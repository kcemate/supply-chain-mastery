import type {
  RunArtifactReference,
  RunResultChunkV2,
  RunResultManifestV2,
  RunSummaryV2,
  SavedScenarioReferenceV2,
  StoredScenario,
} from './runArtifacts';
import { contentHash } from './engine/canonical';
import { decodeSavedScenario, decodeScenarioDefinition, type DecodeResult } from './schemaDecoders';

type Errors = Record<string, string>;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => text(value) && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const integer = (value: unknown): value is number => Number.isInteger(value);
const checksum = (value: unknown): value is string => text(value) && /^[a-f0-9]{64}$/i.test(value);
const add = (errors: Errors, path: string, valid: boolean, message: string) => { if (!valid) errors[path] = message; };
const decoded = <T>(value: unknown, errors: Errors): DecodeResult<T> => Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: value as T };

const products = ['Chicken', 'Produce', 'Buns & bakery', 'Packaging', 'Beverages', 'Cooking oil', 'Equipment'] as const;
const units = ['case-equivalent', 'case', 'each', 'pallet'] as const;
const metricsFields = ['serviceLevel', 'stockoutUnits', 'affectedRestaurants', 'totalLandedCost', 'maxUtilization', 'totalDemand', 'fulfilledDemand'] as const;
const costFields = ['purchaseMicros', 'linehaulVariableMicros', 'vehicleFixedMicros', 'driverTimeMicros', 'stopMicros', 'handlingMicros', 'inventoryCarryingMicros', 'tollMicros', 'shortagePenaltyMicros', 'totalMicros'] as const;

function twinMetrics(value: unknown) {
  return record(value) && metricsFields.every((field) => finite(value[field])) && nonempty(value.maxUtilizationLocationId)
    && (value.quantityUnit === undefined || units.includes(value.quantityUnit as typeof units[number]))
    && (value.stockoutRestaurantPeriods === undefined || nonnegative(value.stockoutRestaurantPeriods))
    && (value.serviceTarget === undefined || finite(value.serviceTarget));
}
function costBreakdown(value: unknown) { return record(value) && costFields.every((field) => finite(value[field])); }
function productMetric(value: unknown) {
  return record(value) && products.includes(value.product as typeof products[number]) && units.includes(value.unit as typeof units[number])
    && ['requestedDemand', 'fulfilledDemand', 'stockoutQuantity', 'serviceLevel'].every((field) => finite(value[field]));
}

export function decodeRunArtifactReference(value: unknown, path = 'artifact'): DecodeResult<RunArtifactReference> {
  const errors: Errors = {};
  add(errors, path, record(value), 'Artifact reference must be an object.');
  if (record(value)) {
    add(errors, `${path}.checksum`, checksum(value.checksum), 'Artifact checksum must be a SHA-256 hex digest.');
    add(errors, `${path}.relativePath`, nonempty(value.relativePath) && !String(value.relativePath).includes('..') && !String(value.relativePath).startsWith('/'), 'Artifact path must be a safe relative path.');
    add(errors, `${path}.byteLength`, integer(value.byteLength) && value.byteLength >= 0, 'Artifact byte length must be a non-negative integer.');
  }
  return decoded(value, errors);
}

export function decodeRunSummary(value: unknown, path = 'summary'): DecodeResult<RunSummaryV2> {
  const errors: Errors = {};
  add(errors, path, record(value), 'Run summary must be an object.');
  if (!record(value)) return decoded(value, errors);
  add(errors, `${path}.schemaVersion`, value.schemaVersion === 2, 'Run summary schemaVersion must be 2.');
  for (const field of ['runId', 'engineVersion', 'completedAt', 'narrative'] as const) add(errors, `${path}.${field}`, nonempty(value[field]), 'Non-empty text is required.');
  for (const field of ['inputHash', 'outputChecksum'] as const) add(errors, `${path}.${field}`, checksum(value[field]), 'A SHA-256 checksum is required.');
  add(errors, `${path}.baseline`, twinMetrics(value.baseline), 'Baseline metrics are invalid.');
  add(errors, `${path}.scenario`, twinMetrics(value.scenario), 'Scenario metrics are invalid.');
  for (const field of ['impactCount', 'recommendationCount', 'diagnosticWarningCount'] as const) add(errors, `${path}.${field}`, integer(value[field]) && value[field] >= 0, 'Count must be a non-negative integer.');
  add(errors, `${path}.productMetrics`, value.productMetrics === undefined || (Array.isArray(value.productMetrics) && value.productMetrics.every(productMetric)), 'Product metrics are invalid.');
  for (const field of ['baselineCostBreakdown', 'costBreakdown'] as const) add(errors, `${path}.${field}`, value[field] === undefined || costBreakdown(value[field]), 'Cost breakdown is invalid.');
  const info = value.inputInfo;
  add(errors, `${path}.inputInfo`, record(info), 'Input information is required.');
  if (record(info)) {
    for (const field of ['engineBuildDigest', 'baselineRevision', 'startDate'] as const) add(errors, `${path}.inputInfo.${field}`, nonempty(info[field]), 'Non-empty text is required.');
    add(errors, `${path}.inputInfo.grain`, info.grain === 'daily' || info.grain === 'weekly', 'Grain must be daily or weekly.');
    for (const field of ['horizon', 'locationCount', 'laneCount'] as const) add(errors, `${path}.inputInfo.${field}`, integer(info[field]) && info[field] >= 0, 'Must be a non-negative integer.');
    add(errors, `${path}.inputInfo.serviceTarget`, finite(info.serviceTarget), 'Service target must be finite.');
    for (const field of ['sourceVersions', 'routeVersions', 'forecastVersions', 'warningsAcknowledged'] as const) add(errors, `${path}.inputInfo.${field}`, Array.isArray(info[field]) && info[field].every(text), 'Must be a string array.');
    add(errors, `${path}.inputInfo.productWeights`, record(info.productWeights) && Object.entries(info.productWeights).every(([product, weight]) => products.includes(product as typeof products[number]) && nonnegative(weight)), 'Product weights are invalid.');
  }
  add(errors, `${path}.diagnosticsSummary`, value.diagnosticsSummary === undefined || (record(value.diagnosticsSummary)
    && record(value.diagnosticsSummary.conservationDeltaByProduct) && Object.values(value.diagnosticsSummary.conservationDeltaByProduct).every(finite)
    && integer(value.diagnosticsSummary.invalidTargetCount) && value.diagnosticsSummary.invalidTargetCount >= 0), 'Diagnostics summary is invalid.');
  return decoded(value, errors);
}

export function decodeRunResultChunk(value: unknown, path = 'chunk'): DecodeResult<RunResultChunkV2> {
  const errors: Errors = {};
  add(errors, path, record(value), 'Run chunk must be an object.');
  if (!record(value)) return decoded(value, errors);
  add(errors, `${path}.kind`, ['baseline', 'scenario', 'impacts', 'recommendations', 'warnings', 'constraints'].includes(String(value.kind)), 'Unsupported chunk kind.');
  for (const field of ['ordinal', 'rowCount'] as const) add(errors, `${path}.${field}`, integer(value[field]) && value[field] >= 0, 'Must be a non-negative integer.');
  add(errors, `${path}.periodFrom`, value.periodFrom === undefined || (integer(value.periodFrom) && value.periodFrom >= 0), 'Period start must be a non-negative integer.');
  add(errors, `${path}.periodToExclusive`, value.periodToExclusive === undefined || (integer(value.periodToExclusive) && value.periodToExclusive >= 0), 'Period end must be a non-negative integer.');
  if (integer(value.periodFrom) && integer(value.periodToExclusive)) add(errors, `${path}.periodRange`, value.periodToExclusive > value.periodFrom, 'Period end must be after period start.');
  const artifact = decodeRunArtifactReference(value.artifact, `${path}.artifact`); if (!artifact.ok) Object.assign(errors, artifact.errors);
  return decoded(value, errors);
}

export function decodeRunManifest(value: unknown, path = 'manifest'): DecodeResult<RunResultManifestV2> {
  const errors: Errors = {};
  add(errors, path, record(value), 'Run manifest must be an object.');
  if (!record(value)) return decoded(value, errors);
  add(errors, `${path}.schemaVersion`, value.schemaVersion === 2, 'Manifest schemaVersion must be 2.');
  add(errors, `${path}.format`, value.format === 'flyway-run-manifest', 'Unsupported manifest format.');
  const summary = decodeRunSummary(value.summary, `${path}.summary`); if (!summary.ok) Object.assign(errors, summary.errors);
  const input = decodeRunArtifactReference(value.inputArtifact, `${path}.inputArtifact`); if (!input.ok) Object.assign(errors, input.errors);
  add(errors, `${path}.chunks`, Array.isArray(value.chunks), 'Chunks must be an array.');
  if (Array.isArray(value.chunks)) {
    const keys = new Set<string>();
    value.chunks.forEach((item, index) => {
      const chunk = decodeRunResultChunk(item, `${path}.chunks[${index}]`); if (!chunk.ok) Object.assign(errors, chunk.errors);
      if (record(item)) keys.add(`${item.kind}:${item.ordinal}`);
    });
    add(errors, `${path}.chunks.identity`, keys.size === value.chunks.length, 'Chunk kind and ordinal pairs must be unique.');
  }
  add(errors, `${path}.diagnostics`, record(value.diagnostics) && Array.isArray(value.diagnostics.invalidTargets) && value.diagnostics.invalidTargets.every(text)
    && record(value.diagnostics.conservationDeltaByProduct) && Object.values(value.diagnostics.conservationDeltaByProduct).every(finite), 'Manifest diagnostics are invalid.');
  for (const field of ['artifactCount', 'chunkRowCount', 'chunkByteLength'] as const) add(errors, `${path}.${field}`, integer(value[field]) && value[field] >= 0, 'Must be a non-negative integer.');
  if (Array.isArray(value.chunks)) {
    add(errors, `${path}.artifactCount`, value.artifactCount === value.chunks.length, 'Artifact count does not match chunks.');
    add(errors, `${path}.chunkRowCount`, value.chunkRowCount === value.chunks.reduce((sum, chunk) => sum + (record(chunk) && integer(chunk.rowCount) ? chunk.rowCount : 0), 0), 'Chunk row count does not match chunks.');
    add(errors, `${path}.chunkByteLength`, value.chunkByteLength === value.chunks.reduce((sum, chunk) => sum + (record(chunk) && record(chunk.artifact) && integer(chunk.artifact.byteLength) ? chunk.artifact.byteLength : 0), 0), 'Chunk byte count does not match chunks.');
  }
  for (const field of ['logicalOutputChecksum', 'manifestChecksum'] as const) add(errors, `${path}.${field}`, checksum(value[field]), 'A SHA-256 checksum is required.');
  if (checksum(value.manifestChecksum)) {
    const { manifestChecksum: _manifestChecksum, ...identity } = value;
    add(errors, `${path}.manifestChecksum`, contentHash(identity) === value.manifestChecksum, 'Manifest checksum does not match its contents.');
  }
  return decoded(value, errors);
}

export function decodeSavedScenarioReference(value: unknown, path = 'scenario'): DecodeResult<SavedScenarioReferenceV2> {
  const errors: Errors = {};
  add(errors, path, record(value), 'Scenario reference must be an object.');
  if (!record(value)) return decoded(value, errors);
  add(errors, `${path}.schemaVersion`, value.schemaVersion === 2, 'Scenario reference schemaVersion must be 2.');
  const scenario = decodeScenarioDefinition(value, null, path); if (!scenario.ok) Object.assign(errors, scenario.errors);
  add(errors, `${path}.savedAt`, nonempty(value.savedAt), 'Saved timestamp is required.');
  const summary = decodeRunSummary(value.latestRun, `${path}.latestRun`); if (!summary.ok) Object.assign(errors, summary.errors);
  add(errors, `${path}.resultRef`, record(value.resultRef), 'Result locator is required.');
  if (record(value.resultRef)) {
    add(errors, `${path}.resultRef.kind`, value.resultRef.kind === 'local' || value.resultRef.kind === 'service', 'Unsupported result locator kind.');
    add(errors, `${path}.resultRef.runId`, nonempty(value.resultRef.runId), 'Run ID is required.');
    if (value.resultRef.kind === 'service') add(errors, `${path}.resultRef.workspaceId`, nonempty(value.resultRef.workspaceId), 'Service workspace ID is required.');
    if (value.resultRef.kind === 'local') add(errors, `${path}.resultRef.workspaceId`, value.resultRef.workspaceId === undefined, 'Local locators cannot contain a workspace ID.');
    if (summary.ok && value.resultRef.kind === 'local') add(errors, `${path}.resultRef.runId`, value.resultRef.runId === summary.value.runId, 'Local locator and logical run IDs must match.');
  }
  return decoded(value, errors);
}

export function decodeStoredScenario(value: unknown, path = 'scenario'): DecodeResult<StoredScenario> {
  if (record(value) && value.schemaVersion === 2) return decodeSavedScenarioReference(value, path);
  return decodeSavedScenario(value, null, path);
}
