import type { PeriodProductMetric, RunInputV2, ScenarioResult, SimulationDiagnostics } from './flywayTypes';
import { canonicalStringify, contentHash } from './engine/canonical';
import type {
  PublishedRunArtifacts,
  RunArtifactBuildOptions,
  RunArtifactReader,
  RunArtifactReference,
  RunArtifactWriter,
  RunChunkKind,
  RunMetricPage,
  RunMetricQuery,
  RunPage,
  RunQueryTotals,
  RunResultChunkPayloadV2,
  RunResultChunkV2,
  RunResultManifestV2,
  RunScopeQuery,
  RunScopeResult,
  RunSummaryV2,
} from './runArtifacts';
import type { LocationImpact, Recommendation } from './flywayTypes';

const DEFAULT_MAX_ROWS = 5_000;
const DEFAULT_MAX_BYTES = 1_500_000;
const DEFAULT_TRACE_PERIOD_SPAN = 7;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const MAX_METRIC_LIMIT = 5_000;
const encoder = new TextEncoder();

function byteLength(value: unknown) { return encoder.encode(canonicalStringify(value)).byteLength; }
function round(value: number, precision = 4) { return Math.round((value + Number.EPSILON) * 10 ** precision) / 10 ** precision; }
function throwIfAborted(signal?: AbortSignal) { if (signal?.aborted) throw signal.reason || new DOMException('Operation aborted.', 'AbortError'); }

function assertReference(reference: RunArtifactReference) {
  if (!/^[a-f0-9]{64}$/.test(reference.checksum)) throw new Error('Artifact reference checksum is invalid.');
  if (!reference.relativePath || !Number.isInteger(reference.byteLength) || reference.byteLength < 0) throw new Error('Artifact reference metadata is invalid.');
}

async function readChecked<T>(reader: RunArtifactReader, reference: RunArtifactReference): Promise<T> {
  assertReference(reference);
  const value = await reader<T>(reference);
  if (contentHash(value) !== reference.checksum) throw new Error(`Artifact checksum mismatch for ${reference.relativePath}.`);
  if (byteLength(value) !== reference.byteLength) throw new Error(`Artifact byte length mismatch for ${reference.relativePath}.`);
  return value;
}

function validateOptions(options: RunArtifactBuildOptions) {
  const maxRowsPerChunk = options.maxRowsPerChunk ?? DEFAULT_MAX_ROWS;
  const maxBytesPerChunk = options.maxBytesPerChunk ?? DEFAULT_MAX_BYTES;
  const tracePeriodSpan = options.tracePeriodSpan ?? DEFAULT_TRACE_PERIOD_SPAN;
  if (!Number.isInteger(maxRowsPerChunk) || maxRowsPerChunk < 1 || maxRowsPerChunk > DEFAULT_MAX_ROWS) throw new Error(`maxRowsPerChunk must be between 1 and ${DEFAULT_MAX_ROWS}.`);
  if (!Number.isInteger(maxBytesPerChunk) || maxBytesPerChunk < 1_024 || maxBytesPerChunk > DEFAULT_MAX_BYTES) throw new Error(`maxBytesPerChunk must be between 1024 and ${DEFAULT_MAX_BYTES}.`);
  if (!Number.isInteger(tracePeriodSpan) || tracePeriodSpan < 1 || tracePeriodSpan > 7) throw new Error('tracePeriodSpan must be between 1 and 7 periods.');
  return { maxRowsPerChunk, maxBytesPerChunk, tracePeriodSpan };
}

function canonicalMetricOrder(left: PeriodProductMetric, right: PeriodProductMetric) {
  return left.periodIndex - right.periodIndex || left.locationId.localeCompare(right.locationId) || left.product.localeCompare(right.product);
}

function summaryFor(result: ScenarioResult, input: RunInputV2): RunSummaryV2 {
  if (!result.outputChecksum) throw new Error('A logical output checksum is required before result artifacts can be persisted.');
  return {
    schemaVersion: 2,
    runId: result.runId,
    engineVersion: result.engineVersion,
    inputHash: result.inputHash,
    outputChecksum: result.outputChecksum,
    completedAt: result.completedAt,
    baseline: structuredClone(result.baseline),
    scenario: structuredClone(result.scenario),
    narrative: result.narrative,
    productMetrics: structuredClone(result.productMetrics),
    baselineCostBreakdown: structuredClone(result.baselineCostBreakdown),
    costBreakdown: structuredClone(result.costBreakdown),
    impactCount: result.impacts.length,
    recommendationCount: result.recommendations.length,
    diagnosticWarningCount: result.diagnostics?.warnings.length || 0,
    diagnosticsSummary: {
      conservationDeltaByProduct: structuredClone(result.diagnostics?.conservationDeltaByProduct || {}),
      invalidTargetCount: result.diagnostics?.invalidTargets.length || 0,
    },
    inputInfo: {
      engineBuildDigest: input.engineBuildDigest,
      baselineRevision: input.baselineRevision,
      startDate: input.startDate,
      grain: input.grain,
      horizon: input.horizon,
      sourceVersions: [...input.sourceVersions],
      routeVersions: [...input.routeVersions],
      forecastVersions: [...input.forecastVersions],
      warningsAcknowledged: [...input.warningsAcknowledged],
      locationCount: input.locations.length,
      laneCount: input.lanes.length,
      serviceTarget: input.defaults.serviceTarget,
      productWeights: structuredClone(input.defaults.productWeights),
    },
  };
}

function payload<T>(kind: RunChunkKind, ordinal: number, rows: T[]): RunResultChunkPayloadV2<T> {
  return { schemaVersion: 2, format: 'flyway-run-chunk', kind, ordinal, rows };
}

function partitionRows<T>(kind: RunChunkKind, rows: T[], startOrdinal: number, maxRows: number, maxBytes: number) {
  const chunks: RunResultChunkPayloadV2<T>[] = [];
  let ordinal = startOrdinal;
  let current: T[] = [];
  let currentRowsBytes = 0;
  for (const row of rows) {
    const rowBytes = byteLength(row);
    // The empty payload already includes the rows array brackets. Filling that
    // array adds only the serialized rows and the commas between them.
    const envelopeBytes = byteLength(payload(kind, ordinal, []));
    const candidateBytes = envelopeBytes + currentRowsBytes + rowBytes + (current.length ? current.length : 0);
    if (current.length && (current.length >= maxRows || candidateBytes > maxBytes)) {
      chunks.push(payload(kind, ordinal, current));
      ordinal += 1;
      current = [row];
      currentRowsBytes = rowBytes;
      if (byteLength(payload(kind, ordinal, current)) > maxBytes) throw new Error(`A ${kind} row exceeds the maximum artifact byte size.`);
    } else {
      current.push(row);
      currentRowsBytes += rowBytes;
      if (candidateBytes > maxBytes) throw new Error(`A ${kind} row exceeds the maximum artifact byte size.`);
    }
  }
  if (current.length) chunks.push(payload(kind, ordinal, current));
  return chunks;
}

function tracePayloads(kind: 'baseline' | 'scenario', source: PeriodProductMetric[], options: ReturnType<typeof validateOptions>) {
  const rows = [...source].sort(canonicalMetricOrder);
  const chunks: RunResultChunkPayloadV2<PeriodProductMetric>[] = [];
  let index = 0;
  while (index < rows.length) {
    const block = Math.floor(rows[index].periodIndex / options.tracePeriodSpan);
    const blockRows: PeriodProductMetric[] = [];
    while (index < rows.length && Math.floor(rows[index].periodIndex / options.tracePeriodSpan) === block) blockRows.push(rows[index++]);
    chunks.push(...partitionRows(kind, blockRows, chunks.length, options.maxRowsPerChunk, options.maxBytesPerChunk));
  }
  return chunks;
}

function listPayloads<T>(kind: RunChunkKind, rows: T[], options: ReturnType<typeof validateOptions>) {
  return partitionRows(kind, rows, 0, options.maxRowsPerChunk, options.maxBytesPerChunk);
}

function manifestIdentity(manifest: Omit<RunResultManifestV2, 'manifestChecksum'>) { return contentHash(manifest); }

export async function persistRunResult(
  result: ScenarioResult,
  inputArtifact: RunArtifactReference,
  writeArtifact: RunArtifactWriter,
  options: RunArtifactBuildOptions = {},
): Promise<PublishedRunArtifacts> {
  throwIfAborted(options.signal);
  assertReference(inputArtifact);
  const input = result.input;
  if (!input) throw new Error('The result must contain its frozen input before artifacts can be persisted.');
  if (contentHash(input) !== result.inputHash) throw new Error('The frozen input does not match the result input hash.');
  if (inputArtifact.checksum !== result.inputHash) throw new Error('The input artifact does not match the result input hash.');
  const settings = validateOptions(options);
  const baselineRows = result.baselinePeriodMetrics || [];
  const scenarioRows = result.periodMetrics || [];
  const diagnostics = result.diagnostics || { warnings: [], invalidTargets: [], conservationDeltaByProduct: {}, bindingConstraints: [] };
  const payloads: RunResultChunkPayloadV2[] = [
    ...tracePayloads('baseline', baselineRows, settings),
    ...tracePayloads('scenario', scenarioRows, settings),
    ...listPayloads('impacts', result.impacts, settings),
    ...listPayloads('recommendations', result.recommendations, settings),
    ...listPayloads('warnings', diagnostics.warnings, settings),
    ...listPayloads('constraints', diagnostics.bindingConstraints, settings),
  ];
  const chunks: RunResultChunkV2[] = [];
  let chunkByteLength = 0;
  let chunkRowCount = 0;
  for (const chunk of payloads) {
    throwIfAborted(options.signal);
    const artifact = await writeArtifact(chunk);
    throwIfAborted(options.signal);
    assertReference(artifact);
    const expectedBytes = byteLength(chunk);
    if (artifact.checksum !== contentHash(chunk) || artifact.byteLength !== expectedBytes) throw new Error(`Artifact writer returned invalid identity for ${chunk.kind} chunk ${chunk.ordinal}.`);
    const periodRows = (chunk.kind === 'baseline' || chunk.kind === 'scenario') ? chunk.rows as PeriodProductMetric[] : [];
    chunks.push({
      kind: chunk.kind,
      ordinal: chunk.ordinal,
      rowCount: chunk.rows.length,
      ...(periodRows.length ? { periodFrom: periodRows[0].periodIndex, periodToExclusive: periodRows.at(-1)!.periodIndex + 1 } : {}),
      artifact,
    });
    chunkByteLength += artifact.byteLength;
    chunkRowCount += chunk.rows.length;
  }
  const withoutChecksum: Omit<RunResultManifestV2, 'manifestChecksum'> = {
    schemaVersion: 2,
    format: 'flyway-run-manifest',
    summary: summaryFor(result, input),
    inputArtifact: structuredClone(inputArtifact),
    chunks,
    diagnostics: { invalidTargets: [...diagnostics.invalidTargets], conservationDeltaByProduct: structuredClone(diagnostics.conservationDeltaByProduct) },
    artifactCount: chunks.length,
    chunkRowCount,
    chunkByteLength,
    logicalOutputChecksum: result.outputChecksum!,
  };
  const manifest: RunResultManifestV2 = { ...withoutChecksum, manifestChecksum: manifestIdentity(withoutChecksum) };
  throwIfAborted(options.signal);
  const manifestArtifact = await writeArtifact(manifest);
  throwIfAborted(options.signal);
  if (manifestArtifact.checksum !== contentHash(manifest) || manifestArtifact.byteLength !== byteLength(manifest)) throw new Error('Artifact writer returned invalid manifest identity.');
  return { manifest, manifestArtifact };
}

function assertManifest(manifest: RunResultManifestV2) {
  if (manifest.schemaVersion !== 2 || manifest.format !== 'flyway-run-manifest') throw new Error('Unsupported run manifest.');
  const { manifestChecksum: _checksum, ...identity } = manifest;
  if (manifestIdentity(identity) !== manifest.manifestChecksum) throw new Error('Run manifest checksum mismatch.');
  if (manifest.artifactCount !== manifest.chunks.length) throw new Error('Run manifest artifact count mismatch.');
  if (manifest.chunkRowCount !== manifest.chunks.reduce((sum, chunk) => sum + chunk.rowCount, 0)) throw new Error('Run manifest row count mismatch.');
  if (manifest.chunkByteLength !== manifest.chunks.reduce((sum, chunk) => sum + chunk.artifact.byteLength, 0)) throw new Error('Run manifest byte count mismatch.');
}

function pageLimit(limit: number | undefined, maximum: number) {
  const value = limit ?? DEFAULT_PAGE_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`limit must be between 1 and ${maximum}.`);
  return value;
}

interface CursorBody { manifestChecksum: string; queryHash: string; offset: number }
function makeCursor(body: CursorBody) {
  const serialized = canonicalStringify(body);
  return `${encodeURIComponent(serialized)}.${contentHash(body)}`;
}
function cursorOffset(cursor: string | undefined, manifestChecksum: string, query: unknown) {
  if (!cursor) return 0;
  const separator = cursor.lastIndexOf('.');
  if (separator < 1) throw new Error('invalid_cursor');
  try {
    const body = JSON.parse(decodeURIComponent(cursor.slice(0, separator))) as CursorBody;
    if (cursor.slice(separator + 1) !== contentHash(body) || body.manifestChecksum !== manifestChecksum || body.queryHash !== contentHash(query) || !Number.isInteger(body.offset) || body.offset < 0) throw new Error('invalid_cursor');
    return body.offset;
  } catch {
    throw new Error('invalid_cursor');
  }
}

function emptyTotals(): RunQueryTotals { return { serviceLevel: 100, stockoutUnits: 0, affectedRestaurants: 0, maxUtilization: 0, totalDemand: 0, fulfilledDemand: 0 }; }

interface TotalsAccumulator extends RunQueryTotals { affectedIds: Set<string> }
function accumulator(): TotalsAccumulator { return { ...emptyTotals(), affectedIds: new Set<string>() }; }
function addMetric(total: TotalsAccumulator, row: PeriodProductMetric) {
  const demand = row.requestedDemand;
  const fulfilled = row.fulfilledDemand;
  const stockout = row.stockoutQuantity;
  if (row.locationType === 'restaurant') {
    total.totalDemand += demand;
    total.fulfilledDemand += fulfilled;
    total.stockoutUnits += stockout;
    if (stockout > 0) total.affectedIds.add(row.locationId);
  }
  const utilization = Math.max(row.storageUtilization, row.inboundUtilization, row.outboundUtilization);
  if (utilization > total.maxUtilization || (utilization === total.maxUtilization && row.locationId.localeCompare(total.maxUtilizationLocationId || '') < 0)) {
    total.maxUtilization = utilization;
    total.maxUtilizationLocationId = row.locationId;
  }
}
function finishTotals(total: TotalsAccumulator): RunQueryTotals {
  return {
    serviceLevel: total.totalDemand > 0 ? round(total.fulfilledDemand / total.totalDemand * 100) : 100,
    stockoutUnits: round(total.stockoutUnits),
    affectedRestaurants: total.affectedIds.size,
    maxUtilization: round(total.maxUtilization),
    ...(total.maxUtilizationLocationId ? { maxUtilizationLocationId: total.maxUtilizationLocationId } : {}),
    totalDemand: round(total.totalDemand),
    fulfilledDemand: round(total.fulfilledDemand),
  };
}

function queryScope(query: RunMetricQuery) {
  return {
    kind: query.kind,
    ...(query.product ? { product: query.product } : {}),
    ...(query.locationType ? { locationType: query.locationType } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.periodFrom != null ? { periodFrom: query.periodFrom } : {}),
    ...(query.periodToExclusive != null ? { periodToExclusive: query.periodToExclusive } : {}),
    ...(query.stockoutsOnly ? { stockoutsOnly: true } : {}),
  };
}

function matchesMetric(row: PeriodProductMetric, query: Omit<RunMetricQuery, 'cursor' | 'limit'>) {
  return (!query.product || row.product === query.product)
    && (!query.locationType || row.locationType === query.locationType)
    && (!query.locationId || row.locationId === query.locationId)
    && (query.periodFrom == null || row.periodIndex >= query.periodFrom)
    && (query.periodToExclusive == null || row.periodIndex < query.periodToExclusive)
    && (!query.stockoutsOnly || row.stockoutQuantity > 0);
}

function assertChunk<T>(value: RunResultChunkPayloadV2<T>, chunk: RunResultChunkV2) {
  if (value.schemaVersion !== 2 || value.format !== 'flyway-run-chunk' || value.kind !== chunk.kind || value.ordinal !== chunk.ordinal || !Array.isArray(value.rows) || value.rows.length !== chunk.rowCount) throw new Error(`Run ${chunk.kind} chunk ${chunk.ordinal} does not match its manifest.`);
}

export class RunArtifactRepository {
  private inputPromise?: Promise<RunInputV2>;
  constructor(readonly manifest: RunResultManifestV2, private readonly readArtifact: RunArtifactReader) { assertManifest(manifest); }

  input() { return this.inputPromise ||= readChecked<RunInputV2>(this.readArtifact, this.manifest.inputArtifact); }

  private async chunks<T>(kind: RunChunkKind, visit: (row: T) => void, periodFrom?: number, periodToExclusive?: number) {
    const chunks = this.manifest.chunks.filter((chunk) => chunk.kind === kind)
      .filter((chunk) => periodFrom == null || chunk.periodToExclusive == null || chunk.periodToExclusive > periodFrom)
      .filter((chunk) => periodToExclusive == null || chunk.periodFrom == null || chunk.periodFrom < periodToExclusive)
      .sort((left, right) => left.ordinal - right.ordinal);
    for (const chunk of chunks) {
      const value = await readChecked<RunResultChunkPayloadV2<T>>(this.readArtifact, chunk.artifact);
      assertChunk(value, chunk);
      for (const row of value.rows) visit(row);
    }
  }

  async metrics(query: RunMetricQuery): Promise<RunMetricPage> {
    const scope = queryScope(query);
    const limit = pageLimit(query.limit, MAX_METRIC_LIMIT);
    const offset = cursorOffset(query.cursor, this.manifest.manifestChecksum, { type: 'metrics', scope, limit });
    const rows: PeriodProductMetric[] = [];
    const totals = accumulator();
    let count = 0;
    await this.chunks<PeriodProductMetric>(query.kind, (row) => {
      if (!matchesMetric(row, scope)) return;
      if (count >= offset && rows.length < limit) rows.push(structuredClone(row));
      addMetric(totals, row);
      count += 1;
    }, query.periodFrom, query.periodToExclusive);
    return {
      items: rows,
      ...(offset + rows.length < count ? { nextCursor: makeCursor({ manifestChecksum: this.manifest.manifestChecksum, queryHash: contentHash({ type: 'metrics', scope, limit }), offset: offset + rows.length }) } : {}),
      total: count,
      totals: finishTotals(totals),
      scope,
    };
  }

  async scope(query: RunScopeQuery): Promise<RunScopeResult> {
    if (!Number.isInteger(query.period) || query.period < -1 || query.period >= this.manifest.summary.inputInfo.horizon) throw new Error(`period must be -1 or between 0 and ${this.manifest.summary.inputInfo.horizon - 1}.`);
    const limit = pageLimit(query.limit, MAX_LIST_LIMIT);
    const scope = { product: query.product, period: query.period, sort: query.sort } as const;
    const offset = cursorOffset(query.cursor, this.manifest.manifestChecksum, { type: 'scope', scope, limit });
    const daysPerReportingPeriod = this.manifest.summary.inputInfo.grain === 'weekly' ? 7 : 1;
    const periodFrom = query.period === -1 ? undefined : query.period * daysPerReportingPeriod;
    const periodToExclusive = query.period === -1 ? undefined : (query.period + 1) * daysPerReportingPeriod;
    const baseline = new Map<string, { demand: number; fulfilled: number; stockout: number }>();
    const scenario = new Map<string, { demand: number; fulfilled: number; stockout: number }>();
    const baselineTotals = accumulator();
    const scenarioTotals = accumulator();
    const collect = (target: Map<string, { demand: number; fulfilled: number; stockout: number }>, totals: TotalsAccumulator) => (row: PeriodProductMetric) => {
      if ((periodFrom != null && row.periodIndex < periodFrom) || (periodToExclusive != null && row.periodIndex >= periodToExclusive) || (query.product !== 'all' && row.product !== query.product)) return;
      addMetric(totals, row);
      if (row.locationType !== 'restaurant') return;
      const current = target.get(row.locationId) || { demand: 0, fulfilled: 0, stockout: 0 };
      current.demand += row.requestedDemand;
      current.fulfilled += row.fulfilledDemand;
      current.stockout += row.stockoutQuantity;
      target.set(row.locationId, current);
    };
    await this.chunks<PeriodProductMetric>('baseline', collect(baseline, baselineTotals), periodFrom, periodToExclusive);
    await this.chunks<PeriodProductMetric>('scenario', collect(scenario, scenarioTotals), periodFrom, periodToExclusive);
    const input = await this.input();
    const names = new Map(input.locations.map((location) => [location.id, location.name]));
    const ids = new Set([...baseline.keys(), ...scenario.keys()]);
    const restaurants = [...ids].map((locationId) => {
      const before = baseline.get(locationId) || { demand: 0, fulfilled: 0, stockout: 0 };
      const after = scenario.get(locationId) || { demand: 0, fulfilled: 0, stockout: 0 };
      return { locationId, name: names.get(locationId) || locationId, demand: round(after.demand), fulfilled: round(after.fulfilled), stockout: round(after.stockout), baselineStockout: round(before.stockout) };
    }).sort(query.sort === 'impact'
      ? (left, right) => (right.stockout - right.baselineStockout) - (left.stockout - left.baselineStockout) || left.name.localeCompare(right.name) || left.locationId.localeCompare(right.locationId)
      : (left, right) => left.name.localeCompare(right.name) || left.locationId.localeCompare(right.locationId));
    const items = restaurants.slice(offset, offset + limit);
    return {
      baseline: finishTotals(baselineTotals),
      scenario: finishTotals(scenarioTotals),
      restaurants: {
        items,
        total: restaurants.length,
        ...(offset + items.length < restaurants.length ? { nextCursor: makeCursor({ manifestChecksum: this.manifest.manifestChecksum, queryHash: contentHash({ type: 'scope', scope, limit }), offset: offset + items.length }) } : {}),
      },
      incrementalStockoutLocationIds: restaurants.filter((row) => row.stockout > row.baselineStockout).map((row) => row.locationId),
      scope,
    };
  }

  private async page<T>(kind: RunChunkKind, cursor?: string, limitInput?: number): Promise<RunPage<T>> {
    const limit = pageLimit(limitInput, MAX_LIST_LIMIT);
    const query = { type: kind, limit };
    const offset = cursorOffset(cursor, this.manifest.manifestChecksum, query);
    const items: T[] = [];
    let count = 0;
    await this.chunks<T>(kind, (row) => { if (count >= offset && items.length < limit) items.push(structuredClone(row)); count += 1; });
    return { items, total: count, ...(offset + items.length < count ? { nextCursor: makeCursor({ manifestChecksum: this.manifest.manifestChecksum, queryHash: contentHash(query), offset: offset + items.length }) } : {}) };
  }

  impacts(cursor?: string, limit?: number) { return this.page<LocationImpact>('impacts', cursor, limit); }
  recommendations(cursor?: string, limit?: number) { return this.page<Recommendation>('recommendations', cursor, limit); }
  warnings(cursor?: string, limit?: number) { return this.page<string>('warnings', cursor, limit); }
  constraints(cursor?: string, limit?: number) { return this.page<SimulationDiagnostics['bindingConstraints'][number]>('constraints', cursor, limit); }

  async materialize(): Promise<ScenarioResult> {
    const [input, impacts, recommendations, warnings, constraints] = await Promise.all([
      this.input(), this.all<LocationImpact>('impacts'), this.all<Recommendation>('recommendations'), this.all<string>('warnings'), this.all<SimulationDiagnostics['bindingConstraints'][number]>('constraints'),
    ]);
    const baselinePeriodMetrics = await this.all<PeriodProductMetric>('baseline');
    const periodMetrics = await this.all<PeriodProductMetric>('scenario');
    const summary = this.manifest.summary;
    if (summary.outputChecksum !== this.manifest.logicalOutputChecksum) throw new Error('Run summary and manifest logical checksums disagree.');
    return {
      runId: summary.runId,
      engineVersion: summary.engineVersion,
      inputHash: summary.inputHash,
      outputChecksum: this.manifest.logicalOutputChecksum,
      completedAt: summary.completedAt,
      baseline: structuredClone(summary.baseline),
      scenario: structuredClone(summary.scenario),
      narrative: summary.narrative,
      productMetrics: structuredClone(summary.productMetrics),
      baselineCostBreakdown: structuredClone(summary.baselineCostBreakdown),
      costBreakdown: structuredClone(summary.costBreakdown),
      input: structuredClone(input),
      baselinePeriodMetrics,
      periodMetrics,
      impacts,
      recommendations,
      diagnostics: { ...structuredClone(this.manifest.diagnostics), warnings, bindingConstraints: constraints },
    };
  }

  private async all<T>(kind: RunChunkKind) { const rows: T[] = []; await this.chunks<T>(kind, (row) => rows.push(structuredClone(row))); return rows; }
}

export function createRunArtifactRepository(manifest: RunResultManifestV2, readArtifact: RunArtifactReader) { return new RunArtifactRepository(manifest, readArtifact); }

/** Legacy migration helper. The caller keeps the legacy value until this promise and its reference commit both succeed. */
export const persistLegacyRunResult = persistRunResult;
