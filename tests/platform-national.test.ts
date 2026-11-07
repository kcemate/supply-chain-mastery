import assert from 'node:assert/strict';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Evidence, Lane, ProductCategory, ScenarioDefinition, TwinLocation } from '../src/flywayTypes';
import { FilePlatformStore } from '../server/fileStore';
import { closeServer, createPlatformHttpServer, listenOnRandomLoopback } from '../server/httpServer';
import { PlatformService } from '../server/platformService';
import type { PlatformStore } from '../server/storage';
import type { ArtifactReference, PlatformDatabase, RunRecord } from '../server/types';

const ownerToken = 'platform-national-test-owner-token-32-characters';
const products: ProductCategory[] = ['Chicken', 'Produce', 'Buns & bakery', 'Packaging', 'Beverages', 'Cooking oil', 'Equipment'];
const evidence: Evidence = { classification: 'synthetic', confidence: null, sourceTitle: 'National persistence test', publisher: 'Flyway', verifiedAt: '2026-09-07' };

function nationalFixture() {
  const locations: TwinLocation[] = [];
  const lanes: Lane[] = [];
  for (let supplier = 0; supplier < 100; supplier += 1) locations.push({
    id: `s${supplier}`, type: 'supplier', name: `Supplier ${supplier}`, city: 'Test', state: 'GA', address: `${supplier} Supplier Way`, latitude: 30 + supplier / 100, longitude: -90,
    status: 'active', products, weeklyCapacity: 35_000, productPolicies: products.map((product) => ({ product, baseUnit: 'case', weeklyProductionCapacity: 5_000 })), evidence, operatingSchedule: 'Daily',
  });
  for (let dc = 0; dc < 25; dc += 1) {
    locations.push({
      id: `d${dc}`, type: 'dc', name: `DC ${dc}`, city: 'Test', state: 'GA', address: `${dc} Distribution Way`, latitude: 32 + dc / 100, longitude: -88,
      status: 'active', products, weeklyCapacity: 14_000, productPolicies: products.map((product) => ({ product, baseUnit: 'case', openingInventory: 1_400, storageCapacity: 7_000, safetyStock: 700, reorderPoint: 1_400, orderUpTo: 5_600, leadTimeDays: 1 })), evidence, operatingSchedule: 'Daily',
    });
    for (let index = 0; index < 4; index += 1) {
      const supplier = dc * 4 + index;
      lanes.push({ id: `s${supplier}-d${dc}`, originId: `s${supplier}`, destinationId: `d${dc}`, products, miles: 100 + index * 10, transitHours: 3, deliveriesPerWeek: 7, costPerMile: 2.5, status: 'active', weeklyCapacity: 100_000, evidence });
    }
  }
  for (let restaurant = 0; restaurant < 3_500; restaurant += 1) {
    const dc = restaurant % 25;
    locations.push({
      id: `r${restaurant}`, type: 'restaurant', name: `Restaurant ${restaurant}`, city: 'Test', state: 'GA', address: `${restaurant} Restaurant Way`, latitude: 33 + (restaurant % 100) / 1_000, longitude: -84,
      status: 'active', products, weeklyDemand: 70, productPolicies: products.map((product) => ({ product, baseUnit: 'case', weeklyDemand: 10 })), assignedDcId: `d${dc}`, evidence, operatingSchedule: 'Daily',
    });
    lanes.push({ id: `d${dc}-r${restaurant}`, originId: `d${dc}`, destinationId: `r${restaurant}`, products, miles: 20 + restaurant % 80, transitHours: 2, deliveriesPerWeek: 7, costPerMile: 2.4, status: 'active', weeklyCapacity: 100, evidence });
  }
  return { locations, lanes };
}

const scenario: ScenarioDefinition = {
  id: 'national-persistence', name: 'National persistence proof', description: 'Proves a completed national result remains queryable after restart.',
  type: 'price-change', targetId: 'network', magnitude: 0, grain: 'weekly', horizon: 4,
  createdAt: '2026-09-07T12:00:00.000Z', baselineRevision: 'national-persistence-test', startDate: '2026-09-07', changes: [],
};

async function request<T>(origin: string, path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set('authorization', `Bearer ${ownerToken}`);
  if (options.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${origin}${path}`, { ...options, headers });
  const text = await response.text();
  return { response, text, body: JSON.parse(text) as T };
}

async function waitForCompletion(origin: string, id: string, timeoutMs = 10 * 60_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const current = await request<{ run: RunRecord }>(origin, `/api/v1/runs/${id}`);
    if (current.body.run.status === 'succeeded') return { run: current.body.run, elapsedMs: performance.now() - started };
    if (current.body.run.status === 'failed' || current.body.run.status === 'cancelled') throw new Error(`National run ended ${current.body.run.status}: ${current.body.run.error?.message || 'no error detail'}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`National run ${id} did not complete within ${Math.round(timeoutMs / 1000)} seconds.`);
}

class ReadCountingStore implements PlatformStore {
  readonly artifactReads: string[] = [];
  constructor(readonly base: FilePlatformStore) {}
  initialize() { return this.base.initialize(); }
  read() { return this.base.read(); }
  transaction<T>(mutator: (database: PlatformDatabase) => T | Promise<T>) { return this.base.transaction(mutator); }
  writeArtifact(kind: 'inputs' | 'outputs' | 'evidence', value: unknown): Promise<ArtifactReference> { return this.base.writeArtifact(kind, value); }
  readArtifact<T>(relativePath: string) { this.artifactReads.push(relativePath); return this.base.readArtifact<T>(relativePath); }
  deleteOutputArtifactIfUnreferenced(relativePath: string) { return this.base.deleteOutputArtifactIfUnreferenced(relativePath); }
  resetArtifactReads() { this.artifactReads.length = 0; }
}

const fixture = nationalFixture();
assert.equal(fixture.locations.length, 3_625);
assert.equal(products.length, 7);
assert.equal(scenario.horizon, 4);
const directory = await mkdtemp(join(tmpdir(), 'flyway-national-persistence-'));
const store = new FilePlatformStore({ dataDirectory: directory, initialLocations: fixture.locations, initialLanes: fixture.lanes });
const countingStore = new ReadCountingStore(store);
const service = new PlatformService(countingStore);
await service.initialize();
const server = createPlatformHttpServer({ service, ownerToken });
const { origin } = await listenOnRandomLoopback(server);

let runId = '';
let elapsedMs = 0;
let savedRevision = 0;
try {
  const create = await request<RunRecord>(origin, '/api/v1/runs', {
    method: 'POST', headers: { 'idempotency-key': 'national-persistence-create-0001' }, body: JSON.stringify({ scenario, expectedWorkspaceRevision: 1 }),
  });
  assert.equal(create.response.status, 202);
  runId = create.body.id;
  const completed = await waitForCompletion(origin, runId);
  elapsedMs = completed.elapsedMs;
  const storedRun = (await store.read()).runs[runId];
  assert.equal(storedRun.resultFormat, 'manifest-v2');
  assert.ok(storedRun.resultManifestArtifact);
  assert.ok(storedRun.resultSummary);

  const compactRun = await request<{ run: RunRecord; summary: unknown }>(origin, `/api/v1/runs/${runId}`);
  assert.ok(Buffer.byteLength(compactRun.text) < 250 * 1024, 'Default run metadata must stay below 250 KiB.');
  assert.equal(compactRun.text.includes('periodMetrics'), false);
  assert.equal(compactRun.text.includes('baselinePeriodMetrics'), false);
  assert.equal(compactRun.text.includes('"input"'), false);

  countingStore.resetArtifactReads();
  const legacy = await request(origin, `/api/v1/runs/${runId}?includeOutput=true`);
  assert.equal(legacy.response.status, 413);
  assert.equal((legacy.body as { code: string }).code, 'full_result_too_large');
  assert.deepEqual(countingStore.artifactReads, [storedRun.resultManifestArtifact!.relativePath], 'Oversized compatibility reads must stop after manifest metadata, before input or trace chunks are materialized.');

  const saved = await request<{ scenario: { schemaVersion: number; resultRef: { kind: string; runId: string }; latestRun: { runId: string } }; workspaceRevision: number }>(origin, '/api/v1/scenarios', {
    method: 'POST', headers: { 'idempotency-key': 'national-persistence-save-0001', 'if-match': '"1"' }, body: JSON.stringify({ runId, expectedWorkspaceRevision: 1 }),
  });
  assert.equal(saved.response.status, 200);
  assert.ok(Buffer.byteLength(saved.text) < 250 * 1024, 'Scenario save response must stay compact.');
  assert.equal(saved.body.scenario.schemaVersion, 2);
  assert.equal(saved.body.scenario.resultRef.kind, 'service');
  assert.equal(saved.body.scenario.resultRef.runId, runId);
  assert.equal(saved.body.scenario.latestRun.runId, storedRun.resultSummary?.runId, 'The logical engine run ID must remain distinct from the service job ID.');
  assert.notEqual(saved.body.scenario.latestRun.runId, runId);
  assert.equal(saved.text.includes('periodMetrics'), false);
  assert.equal(saved.text.includes('baselinePeriodMetrics'), false);
  savedRevision = saved.body.workspaceRevision;
} finally {
  await closeServer(server);
  await service.shutdown();
}

const restartedStore = new FilePlatformStore({ dataDirectory: directory, initialLocations: [], initialLanes: [] });
const restartedService = new PlatformService(restartedStore);
await restartedService.initialize();
const restartedServer = createPlatformHttpServer({ service: restartedService, ownerToken });
const restartedOrigin = (await listenOnRandomLoopback(restartedServer)).origin;
try {
  const scenarioPage = await request<{ items: Array<{ resultRef: { runId: string } }>; total: number }>(restartedOrigin, '/api/v1/scenarios?limit=1');
  assert.equal(scenarioPage.response.status, 200);
  assert.equal(scenarioPage.body.total, 1);
  assert.equal(scenarioPage.body.items[0].resultRef.runId, runId);
  assert.ok(Buffer.byteLength(scenarioPage.text) < 250 * 1024);
  assert.equal(scenarioPage.text.includes('periodMetrics'), false);

  const reopened = await request<{ run: RunRecord; summary: { inputInfo: { locationCount: number; horizon: number } } }>(restartedOrigin, `/api/v1/runs/${runId}`);
  assert.equal(reopened.body.run.status, 'succeeded');
  assert.equal(reopened.body.summary.inputInfo.locationCount, 3_625);
  assert.equal(reopened.body.summary.inputInfo.horizon, 4);
  assert.ok(Buffer.byteLength(reopened.text) < 250 * 1024);

  const scope = await request<{ restaurants: { items: unknown[]; total: number; nextCursor?: string } }>(restartedOrigin, `/api/v1/runs/${runId}/scope?product=Chicken&period=0&sort=impact&limit=25`);
  assert.equal(scope.response.status, 200);
  assert.equal(scope.body.restaurants.items.length, 25);
  assert.equal(scope.body.restaurants.total, 3_500);
  assert.ok(scope.body.restaurants.nextCursor);
  assert.ok(Buffer.byteLength(scope.text) < 2 * 1024 * 1024);

  const metrics = await request<{ items: unknown[]; total: number; nextCursor?: string }>(restartedOrigin, `/api/v1/runs/${runId}/metrics?kind=scenario&product=Chicken&periodFrom=0&periodToExclusive=7&limit=5000`);
  assert.equal(metrics.response.status, 200);
  assert.equal(metrics.body.items.length, 5_000);
  assert.ok(metrics.body.total > metrics.body.items.length);
  assert.ok(metrics.body.nextCursor);
  assert.ok(Buffer.byteLength(metrics.text) < 2 * 1024 * 1024);

  const database = await restartedStore.read();
  assert.equal(database.workspace.revision, savedRevision);
  assert.equal(JSON.stringify(database.workspace.scenarios).includes('periodMetrics'), false);
  const outputFiles = await readdir(join(directory, 'artifacts', 'outputs'));
  const outputStats = await Promise.all(outputFiles.map((file) => stat(join(directory, 'artifacts', 'outputs', file))));
  console.log(JSON.stringify({
    fixture: { locations: fixture.locations.length, lanes: fixture.lanes.length, products: products.length, horizonWeeks: scenario.horizon },
    completedMs: Math.round(elapsedMs),
    outputArtifacts: outputFiles.length,
    outputBytes: outputStats.reduce((sum, value) => sum + value.size, 0),
    compactRunBytes: Buffer.byteLength(reopened.text),
    scenarioListBytes: Buffer.byteLength(scenarioPage.text),
    scopePageBytes: Buffer.byteLength(scope.text),
    metricPageBytes: Buffer.byteLength(metrics.text),
    mainProcessMaxRssKiB: process.resourceUsage().maxRSS,
    restartReopen: true,
  }));
} finally {
  await closeServer(restartedServer);
  await restartedService.shutdown();
}
