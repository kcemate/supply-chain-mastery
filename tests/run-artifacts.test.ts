import assert from 'node:assert/strict';
import { initialLanes, initialLocations } from '../src/flywayData';
import { createRunInput, runInput } from '../src/flywayEngine';
import type { ScenarioDefinition } from '../src/flywayTypes';
import { canonicalStringify, contentHash } from '../src/engine/canonical';
import { createRunArtifactRepository, persistRunResult } from '../src/runArtifactRepository';
import type { RunArtifactReader, RunArtifactReference, RunArtifactWriter, RunResultChunkPayloadV2 } from '../src/runArtifacts';
import { executeEngineWorkerToArtifacts } from '../server/engineWorkerClient';

const scenario: ScenarioDefinition = {
  id: 'artifact-repository-test',
  name: 'Artifact repository test',
  description: 'Exercises deterministic result chunking and scoped reads.',
  type: 'dc-outage',
  targetId: 'dc-cartersville',
  magnitude: 100,
  grain: 'weekly',
  horizon: 4,
  createdAt: '2026-09-04T12:00:00.000Z',
  baselineRevision: 'artifact-test',
  startDate: '2026-09-07',
};

function memoryArtifacts() {
  const values = new Map<string, string>();
  const writes: unknown[] = [];
  const write: RunArtifactWriter = async (value) => {
    const serialized = canonicalStringify(value);
    const checksum = contentHash(value);
    const reference = { checksum, relativePath: `memory/${checksum}.json`, byteLength: new TextEncoder().encode(serialized).byteLength };
    values.set(reference.relativePath, serialized);
    writes.push(value);
    return reference;
  };
  const read: RunArtifactReader = async <T>(reference: RunArtifactReference) => {
    const serialized = values.get(reference.relativePath);
    if (!serialized) throw new Error(`Missing ${reference.relativePath}`);
    return JSON.parse(serialized) as T;
  };
  return { values, writes, write, read };
}

const input = createRunInput(initialLocations, initialLanes, scenario);
const result = runInput(input);
const memory = memoryArtifacts();
const inputArtifact = await memory.write(input);
const publication = await persistRunResult(result, inputArtifact, memory.write, { maxRowsPerChunk: 17, maxBytesPerChunk: 8_000, tracePeriodSpan: 7 });
assert.equal(memory.writes.at(-1), publication.manifest, 'The publishable manifest must be written only after every chunk is durable.');
assert.equal(publication.manifest.logicalOutputChecksum, result.outputChecksum);
assert.equal(publication.manifest.summary.diagnosticsSummary?.invalidTargetCount, result.diagnostics?.invalidTargets.length);
assert.deepEqual(publication.manifest.summary.diagnosticsSummary?.conservationDeltaByProduct, result.diagnostics?.conservationDeltaByProduct);

for (const chunk of publication.manifest.chunks) {
  assert.ok(chunk.rowCount <= 17);
  assert.ok(chunk.artifact.byteLength <= 8_000);
  const value = await memory.read<RunResultChunkPayloadV2>(chunk.artifact);
  assert.equal(value.rows.length, chunk.rowCount);
  if (chunk.kind === 'baseline' || chunk.kind === 'scenario') {
    const periods = value.rows.map((row) => (row as { periodIndex: number }).periodIndex);
    assert.equal(Math.floor(Math.min(...periods) / 7), Math.floor(Math.max(...periods) / 7), 'Trace chunks must not cross a modeled week.');
  }
}

// Byte boundaries include the two rows-array brackets. These fixtures place a
// two-row payload one byte over the cap and a single-row payload one byte over
// the cap, respectively; neither may be published as an oversized chunk.
const boundaryCap = 1_024;
const serializedBytes = (value: unknown) => new TextEncoder().encode(canonicalStringify(value)).byteLength;
const warningEnvelopeBytes = serializedBytes({ schemaVersion: 2, format: 'flyway-run-chunk', kind: 'warnings', ordinal: 0, rows: [] });
const twoRowByteBudget = boundaryCap + 1 - warningEnvelopeBytes - 1;
const firstWarningBytes = Math.floor(twoRowByteBudget / 2);
const secondWarningBytes = twoRowByteBudget - firstWarningBytes;
const boundaryWarnings = ['a'.repeat(firstWarningBytes - 2), 'b'.repeat(secondWarningBytes - 2)];
assert.equal(serializedBytes({ schemaVersion: 2, format: 'flyway-run-chunk', kind: 'warnings', ordinal: 0, rows: boundaryWarnings }), boundaryCap + 1);
const boundaryResult = {
  ...result,
  baselinePeriodMetrics: [],
  periodMetrics: [],
  impacts: [],
  recommendations: [],
  diagnostics: { warnings: boundaryWarnings, invalidTargets: [], conservationDeltaByProduct: {}, bindingConstraints: [] },
};
const boundaryMemory = memoryArtifacts();
const boundaryInputArtifact = await boundaryMemory.write(input);
const boundaryPublication = await persistRunResult(boundaryResult, boundaryInputArtifact, boundaryMemory.write, { maxBytesPerChunk: boundaryCap });
const warningChunks = boundaryPublication.manifest.chunks.filter((chunk) => chunk.kind === 'warnings');
assert.equal(warningChunks.length, 2, 'A candidate whose complete payload exceeds the byte cap must spill to a new chunk.');
for (const chunk of boundaryPublication.manifest.chunks) {
  const stored = await boundaryMemory.read(chunk.artifact);
  assert.equal(serializedBytes(stored), chunk.artifact.byteLength);
  assert.ok(chunk.artifact.byteLength <= boundaryCap, `Published ${chunk.kind} chunk ${chunk.ordinal} must not exceed the byte cap.`);
}

const oversizedWarningLength = boundaryCap + 1 - warningEnvelopeBytes - 2;
const oversizedResult = {
  ...boundaryResult,
  diagnostics: { ...boundaryResult.diagnostics, warnings: ['x'.repeat(oversizedWarningLength)] },
};
assert.equal(serializedBytes({ schemaVersion: 2, format: 'flyway-run-chunk', kind: 'warnings', ordinal: 0, rows: oversizedResult.diagnostics.warnings }), boundaryCap + 1);
const oversizedMemory = memoryArtifacts();
const oversizedInputArtifact = await oversizedMemory.write(input);
await assert.rejects(
  () => persistRunResult(oversizedResult, oversizedInputArtifact, oversizedMemory.write, { maxBytesPerChunk: boundaryCap }),
  /A warnings row exceeds the maximum artifact byte size/,
);

const ordinalNineEnvelopeBytes = serializedBytes({ schemaVersion: 2, format: 'flyway-run-chunk', kind: 'warnings', ordinal: 9, rows: [] });
const ordinalBoundaryWarning = 'o'.repeat(boundaryCap - ordinalNineEnvelopeBytes - 2);
assert.equal(serializedBytes({ schemaVersion: 2, format: 'flyway-run-chunk', kind: 'warnings', ordinal: 9, rows: [ordinalBoundaryWarning] }), boundaryCap);
assert.equal(serializedBytes({ schemaVersion: 2, format: 'flyway-run-chunk', kind: 'warnings', ordinal: 10, rows: [ordinalBoundaryWarning] }), boundaryCap + 1);
const ordinalGrowthResult = {
  ...boundaryResult,
  diagnostics: { ...boundaryResult.diagnostics, warnings: Array.from({ length: 11 }, () => ordinalBoundaryWarning) },
};
const ordinalGrowthMemory = memoryArtifacts();
const ordinalGrowthInputArtifact = await ordinalGrowthMemory.write(input);
await assert.rejects(
  () => persistRunResult(ordinalGrowthResult, ordinalGrowthInputArtifact, ordinalGrowthMemory.write, { maxRowsPerChunk: 1, maxBytesPerChunk: boundaryCap }),
  /A warnings row exceeds the maximum artifact byte size/,
  'A row that fit ordinal 9 must be rechecked against the larger ordinal 10 envelope.',
);

const repository = createRunArtifactRepository(publication.manifest, memory.read);
const metricOrder = (left: { periodIndex: number; locationId: string; product: string }, right: { periodIndex: number; locationId: string; product: string }) => left.periodIndex - right.periodIndex || left.locationId.localeCompare(right.locationId) || left.product.localeCompare(right.product);
const canonicalResult = {
  ...result,
  baselinePeriodMetrics: [...result.baselinePeriodMetrics!].sort(metricOrder),
  periodMetrics: [...result.periodMetrics!].sort(metricOrder),
};
const materialized = await repository.materialize();
assert.deepEqual(materialized, canonicalResult, 'Explicit materialization must reconstruct the exact logical result in canonical trace order.');
assert.equal(runInput(materialized.input!).outputChecksum, publication.manifest.logicalOutputChecksum, 'Replaying the checked frozen input must reproduce the manifest logical checksum.');

const metricQuery = { kind: 'scenario' as const, product: 'Chicken' as const, locationType: 'restaurant' as const, periodFrom: 0, periodToExclusive: 14, limit: 7 };
const firstMetricPage = await repository.metrics(metricQuery);
const metricRows = [...firstMetricPage.items];
let metricCursor = firstMetricPage.nextCursor;
while (metricCursor) {
  const page = await repository.metrics({ ...metricQuery, cursor: metricCursor });
  assert.deepEqual(page.totals, firstMetricPage.totals, 'Scoped totals must not depend on page size or cursor.');
  metricRows.push(...page.items);
  metricCursor = page.nextCursor;
}
const expectedMetricRows = result.periodMetrics!.filter((row) => row.product === 'Chicken' && row.locationType === 'restaurant' && row.periodIndex < 14).sort(metricOrder);
assert.deepEqual(metricRows, expectedMetricRows);
assert.equal(metricRows.length, firstMetricPage.total);
await assert.rejects(() => repository.metrics({ ...metricQuery, product: 'Produce', cursor: firstMetricPage.nextCursor }), /invalid_cursor/);
await assert.rejects(() => repository.metrics({ ...metricQuery, limit: 5_001 }), /limit must be between 1 and 5000/);
const shortagePage = await repository.metrics({ kind: 'scenario', locationType: 'restaurant', stockoutsOnly: true, limit: 8 });
assert.ok(shortagePage.items.length > 0 && shortagePage.items.every((row) => row.stockoutQuantity > 0));
assert.equal(shortagePage.total, result.periodMetrics!.filter((row) => row.locationType === 'restaurant' && row.stockoutQuantity > 0).length);

const scoped = await repository.scope({ product: 'all', period: 0, sort: 'impact', limit: 2 });
const expectedScenarioDemand = result.periodMetrics!.filter((row) => row.periodIndex >= 0 && row.periodIndex < 7 && row.locationType === 'restaurant')
  .reduce((sum, row) => sum + row.requestedDemand, 0);
assert.equal(scoped.scenario.totalDemand, Math.round(expectedScenarioDemand * 10_000) / 10_000);
assert.ok(scoped.restaurants.items.length <= 2);
assert.ok(scoped.incrementalStockoutLocationIds.every((locationId) => {
  const scenarioStockout = result.periodMetrics!.filter((row) => row.periodIndex < 7 && row.locationId === locationId).reduce((sum, row) => sum + row.stockoutQuantity, 0);
  const baselineStockout = result.baselinePeriodMetrics!.filter((row) => row.periodIndex < 7 && row.locationId === locationId).reduce((sum, row) => sum + row.stockoutQuantity, 0);
  return scenarioStockout > baselineStockout;
}));
const secondWeek = await repository.scope({ product: 'all', period: 1, sort: 'impact' });
const expectedSecondWeekDemand = result.periodMetrics!.filter((row) => row.periodIndex >= 7 && row.periodIndex < 14 && row.locationType === 'restaurant')
  .reduce((sum, row) => sum + row.requestedDemand, 0);
assert.equal(secondWeek.scenario.totalDemand, Math.round(expectedSecondWeekDemand * 10_000) / 10_000);
const fullHorizon = await repository.scope({ product: 'all', period: -1, sort: 'impact' });
const preciseFullDemand = result.periodMetrics!.filter((row) => row.locationType === 'restaurant').reduce((sum, row) => sum + row.requestedDemand, 0);
const preciseFullFulfilled = result.periodMetrics!.filter((row) => row.locationType === 'restaurant').reduce((sum, row) => sum + row.fulfilledDemand, 0);
assert.equal(fullHorizon.scenario.totalDemand, Math.round(preciseFullDemand * 10_000) / 10_000);
assert.equal(fullHorizon.scenario.fulfilledDemand, Math.round(preciseFullFulfilled * 10_000) / 10_000);
assert.equal(Math.round(fullHorizon.scenario.totalDemand), result.scenario.totalDemand);
assert.equal(Math.round(fullHorizon.scenario.fulfilledDemand), result.scenario.fulfilledDemand);
assert.equal(Math.round(fullHorizon.scenario.stockoutUnits), result.scenario.stockoutUnits);
assert.equal(Math.round(fullHorizon.scenario.serviceLevel * 10) / 10, result.scenario.serviceLevel);
await assert.rejects(() => repository.scope({ product: 'all', period: 4, sort: 'impact' }), /period must be -1 or between 0 and 3/);

const dailyLocations = initialLocations.map((location) => location.type === 'restaurant'
  ? { ...location, productPolicies: [{ product: 'Chicken' as const, baseUnit: 'case-equivalent' as const, weeklyDemand: 100 }] }
  : location);
const dailyInput = createRunInput(dailyLocations, initialLanes, { ...scenario, id: 'artifact-daily-scope', grain: 'daily', horizon: 14 }, { productWeights: { ...input.defaults.productWeights, Chicken: 0 } });
const dailyResult = runInput(dailyInput);
const dailyMemory = memoryArtifacts();
const dailyInputArtifact = await dailyMemory.write(dailyInput);
const dailyPublication = await persistRunResult(dailyResult, dailyInputArtifact, dailyMemory.write);
const dailyRepository = createRunArtifactRepository(dailyPublication.manifest, dailyMemory.read);
const dailyFirst = await dailyRepository.scope({ product: 'all', period: 0, sort: 'impact' });
const dailyAll = await dailyRepository.scope({ product: 'all', period: -1, sort: 'impact' });
const expectedDailyFirst = dailyResult.periodMetrics!.filter((row) => row.periodIndex === 0 && row.locationType === 'restaurant')
  .reduce((sum, row) => sum + row.requestedDemand, 0);
assert.equal(dailyFirst.scenario.totalDemand, Math.round(expectedDailyFirst * 10_000) / 10_000);
assert.equal(Math.round(dailyAll.scenario.totalDemand), dailyResult.scenario.totalDemand);
assert.notEqual(dailyFirst.scenario.totalDemand, dailyAll.scenario.totalDemand);
const zeroWeightChicken = await dailyRepository.metrics({ kind: 'scenario', product: 'Chicken', locationType: 'restaurant', periodFrom: 0, periodToExclusive: 14 });
const explicitChickenDemand = dailyResult.periodMetrics!.filter((row) => row.product === 'Chicken' && row.locationType === 'restaurant').reduce((sum, row) => sum + row.requestedDemand, 0);
assert.ok(explicitChickenDemand > 0, 'Fixture requires explicit Chicken product policy demand despite a zero fallback share.');
assert.equal(zeroWeightChicken.totals.totalDemand, Math.round(explicitChickenDemand * 10_000) / 10_000, 'Repository totals must sum modeled rows without applying product allocation weights a second time.');

const allImpacts = [];
let impactCursor: string | undefined;
do {
  const page = await repository.impacts(impactCursor, 1);
  allImpacts.push(...page.items);
  impactCursor = page.nextCursor;
} while (impactCursor);
assert.deepEqual(allImpacts, result.impacts);

const tamperedReference = publication.manifest.chunks[0].artifact;
const original = memory.values.get(tamperedReference.relativePath)!;
memory.values.set(tamperedReference.relativePath, canonicalStringify({ tampered: true }));
await assert.rejects(() => createRunArtifactRepository(publication.manifest, memory.read).metrics({ kind: 'baseline' }), /checksum mismatch/);
memory.values.set(tamperedReference.relativePath, original);

// The production worker uses a strict request/ack handshake. The writer records
// at most one active persistence call even when deliberately delayed.
const workerMemory = memoryArtifacts();
const workerInputArtifact = await workerMemory.write(input);
let activeWrites = 0;
let maximumActiveWrites = 0;
const delayedWriter: RunArtifactWriter = async (value) => {
  activeWrites += 1;
  maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
  await new Promise((resolve) => setTimeout(resolve, 1));
  try { return await workerMemory.write(value); } finally { activeWrites -= 1; }
};
const workerPublication = await executeEngineWorkerToArtifacts(input, workerInputArtifact, delayedWriter, undefined, { build: { maxRowsPerChunk: 31, maxBytesPerChunk: 12_000 } });
assert.equal(maximumActiveWrites, 1, 'Worker artifact writes must be backpressured by durable acknowledgements.');
assert.deepEqual(workerMemory.writes.at(-1), workerPublication.manifest);
const workerMaterialized = await createRunArtifactRepository(workerPublication.manifest, workerMemory.read).materialize();
assert.equal(workerMaterialized.outputChecksum, result.outputChecksum);
assert.deepEqual(workerMaterialized.input, input);
assert.deepEqual(workerMaterialized.baselinePeriodMetrics, canonicalResult.baselinePeriodMetrics);
assert.deepEqual(workerMaterialized.periodMetrics, canonicalResult.periodMetrics);

const failedMemory = memoryArtifacts();
const failedInputArtifact = await failedMemory.write(input);
let writeCount = 0;
await assert.rejects(
  () => executeEngineWorkerToArtifacts(input, failedInputArtifact, async (value) => {
    writeCount += 1;
    if (writeCount === 2) throw new Error('Injected artifact sink failure.');
    return failedMemory.write(value);
  }),
  /Injected artifact sink failure/,
);
assert.equal(failedMemory.writes.some((value) => (value as { format?: string })?.format === 'flyway-run-manifest'), false, 'A failed stream must not publish a manifest.');

const cancelledMemory = memoryArtifacts();
const cancelledInputArtifact = await cancelledMemory.write(input);
const cancellation = new AbortController();
let releaseCancelledWrite!: () => void;
let markCancelledWriteStarted!: () => void;
const cancelledWriteStarted = new Promise<void>((resolve) => { markCancelledWriteStarted = resolve; });
const cancelledWriteRelease = new Promise<void>((resolve) => { releaseCancelledWrite = resolve; });
const cancelledExecution = executeEngineWorkerToArtifacts(input, cancelledInputArtifact, async (value) => {
  markCancelledWriteStarted();
  await cancelledWriteRelease;
  return cancelledMemory.write(value);
}, cancellation.signal);
await cancelledWriteStarted;
cancellation.abort();
let cancellationSettled = false;
void cancelledExecution.finally(() => { cancellationSettled = true; }).catch(() => undefined);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(cancellationSettled, false, 'Cancellation must wait for the in-flight durable write so its orphan reference can be collected.');
releaseCancelledWrite();
await assert.rejects(cancelledExecution, (error: unknown) => error instanceof Error && error.name === 'AbortError');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(cancelledMemory.writes.some((value) => (value as { format?: string })?.format === 'flyway-run-manifest'), false, 'A cancelled stream must not publish a manifest.');

console.log(`Run artifact repository passed: ${publication.manifest.chunkRowCount.toLocaleString()} rows in ${publication.manifest.artifactCount} checked chunks; pagination, weighted scope, exact replay, tamper rejection, worker backpressure, failed publication, and cancellation verified.`);
