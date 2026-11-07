import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialLanes, initialLocations } from '../src/flywayData';
import type { RunInputV2, ScenarioDefinition, ScenarioResult } from '../src/flywayTypes';
import { canonicalize, sha256 } from '../server/canonical';
import { FilePlatformStore } from '../server/fileStore';
import { CensusGeocoder } from '../server/geocode';
import { closeServer, createPlatformHttpServer, listenOnRandomLoopback } from '../server/httpServer';
import { createDefaultEngineAdapter, PlatformService, type EngineAdapter } from '../server/platformService';
import type { FrozenPlatformRunInput, RunRecord } from '../server/types';
import { createPlatformClient, PlatformRequestError } from '../src/platformClient';

const ownerToken = 'platform-test-owner-token-32-characters-minimum';
const scenario: ScenarioDefinition = {
  id: 'scenario-platform-outage',
  name: 'Platform recovery test',
  description: 'Exercises durable platform job behavior.',
  type: 'dc-outage',
  targetId: 'dc-cartersville',
  magnitude: 100,
  grain: 'weekly',
  horizon: 4,
  createdAt: '2026-09-04T12:00:00.000Z',
  baselineRevision: 'baseline-platform-test',
};

function resultFor(input: FrozenPlatformRunInput): ScenarioResult {
  const inputHash = sha256(canonicalize(input));
  const output = {
    runId: `engine-${inputHash.slice(0, 12)}`,
    engineVersion: 'platform-test-engine',
    inputHash,
    completedAt: '2026-09-04T12:00:01.000Z',
    baseline: { serviceLevel: 100, stockoutUnits: 0, affectedRestaurants: 0, totalLandedCost: 100, maxUtilization: 50, maxUtilizationLocationId: 'dc-cartersville', totalDemand: 100, fulfilledDemand: 100 },
    scenario: { serviceLevel: 90, stockoutUnits: 10, affectedRestaurants: 1, totalLandedCost: 120, maxUtilization: 75, maxUtilizationLocationId: 'dc-mebane', totalDemand: 100, fulfilledDemand: 90 },
    impacts: [],
    recommendations: [],
    narrative: 'Deterministic platform test result.',
  } satisfies ScenarioResult;
  return { ...output, outputChecksum: sha256(canonicalize(output)) };
}

const immediateEngine: EngineAdapter = {
  async freeze(input, sourceInput) { return structuredClone(sourceInput && typeof sourceInput === 'object' ? { ...sourceInput, scenario: input.scenario } : input); },
  async execute(input) { return resultFor(input as FrozenPlatformRunInput); },
};

const defaultAdapter = createDefaultEngineAdapter();
const defaultFrozen = await defaultAdapter.freeze({
  schemaVersion: 1,
  workspaceId: 'default-adapter-test',
  workspaceRevision: 1,
  defaults: { workspacePreferences: { theme: 'dark' } },
  locations: initialLocations,
  lanes: initialLanes,
  evidenceLedger: { schemaVersion: 1, sources: [], artifacts: [], snapshots: [], values: [], conflicts: [] },
  scenario,
});
assert.equal((defaultFrozen as { schemaVersion: number }).schemaVersion, 2);
assert.equal('workspacePreferences' in (defaultFrozen as { defaults: Record<string, unknown> }).defaults, false, 'UI preferences must not change frozen engine inputs');
const defaultOutput = await defaultAdapter.execute(defaultFrozen);
assert.equal(defaultOutput.input?.schemaVersion, 2);
assert.match(defaultOutput.outputChecksum || '', /^[a-f0-9]{64}$/);
const sourceLineage = structuredClone(defaultFrozen as RunInputV2);
sourceLineage.sourceVersions = ['public-snapshot-v3'];
sourceLineage.routeVersions = ['route-model-v2'];
sourceLineage.forecastVersions = ['forecast-model-v7'];
sourceLineage.warningsAcknowledged = ['sample-demand-estimate'];
const refrozen = await defaultAdapter.freeze({
  schemaVersion: 1,
  workspaceId: 'default-adapter-lineage-test',
  workspaceRevision: 2,
  defaults: {},
  locations: initialLocations,
  lanes: initialLanes,
  evidenceLedger: { schemaVersion: 1, sources: [], artifacts: [], snapshots: [], values: [], conflicts: [] },
  scenario,
}, sourceLineage) as RunInputV2;
sourceLineage.sourceVersions.push('mutated-later');
sourceLineage.routeVersions.push('mutated-later');
sourceLineage.forecastVersions.push('mutated-later');
sourceLineage.warningsAcknowledged.push('mutated-later');
assert.deepEqual(refrozen.sourceVersions, ['public-snapshot-v3']);
assert.deepEqual(refrozen.routeVersions, ['route-model-v2']);
assert.deepEqual(refrozen.forecastVersions, ['forecast-model-v7']);
assert.deepEqual(refrozen.warningsAcknowledged, ['sample-demand-estimate']);

let pollRequestCount = 0;
let pollUpdateCount = 0;
let abortListenersAdded = 0;
let abortListenersRemoved = 0;
const pollController = new AbortController();
const originalAdd = pollController.signal.addEventListener.bind(pollController.signal);
const originalRemove = pollController.signal.removeEventListener.bind(pollController.signal);
pollController.signal.addEventListener = ((...args: Parameters<AbortSignal['addEventListener']>) => { abortListenersAdded += 1; return originalAdd(...args); }) as AbortSignal['addEventListener'];
pollController.signal.removeEventListener = ((...args: Parameters<AbortSignal['removeEventListener']>) => { abortListenersRemoved += 1; return originalRemove(...args); }) as AbortSignal['removeEventListener'];
const pollingClient = createPlatformClient({
  baseUrl: 'https://platform.example',
  ownerToken,
  fetch: (async (_input: RequestInfo | URL, options?: RequestInit) => {
    pollRequestCount += 1;
    assert.equal(options?.redirect, 'error');
    assert.equal(new Headers(options?.headers).get('authorization'), `Bearer ${ownerToken}`);
    const status = pollRequestCount === 1 ? 'queued' : 'succeeded';
    return new Response(JSON.stringify({ run: { id: 'poll-run', status } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch,
});
assert.equal((await pollingClient.pollRun('poll-run', { intervalMs: 1, signal: pollController.signal, onUpdate: () => { pollUpdateCount += 1; } })).run.status, 'succeeded');
assert.equal(pollUpdateCount, 2);
assert.equal(abortListenersAdded, abortListenersRemoved, 'poll delays must remove settled abort listeners');
let healthRequestOptions: RequestInit | undefined;
const healthClient = createPlatformClient({ baseUrl: 'https://platform.example', ownerToken, fetch: (async (_input: RequestInfo | URL, options?: RequestInit) => {
  healthRequestOptions = options;
  return new Response(JSON.stringify({ status: 'ok', schemaVersion: 1, service: 'flyway-platform' }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch });
await healthClient.health();
assert.equal(new Headers(healthRequestOptions?.headers).has('authorization'), false, 'health checks must not send the owner token');
assert.equal(healthRequestOptions?.redirect, 'error');

interface ApiResponse<T = Record<string, unknown>> {
  status: number;
  headers: Headers;
  body: T;
}

async function api<T = Record<string, unknown>>(origin: string, path: string, options: RequestInit & { authenticated?: boolean } = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  if (options.authenticated !== false) headers.set('authorization', `Bearer ${ownerToken}`);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${origin}${path}`, { ...options, headers });
  return { status: response.status, headers: response.headers, body: await response.json() as T };
}

async function waitForRun(origin: string, id: string, expected: RunRecord['status'], timeoutMs = 3_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await api<{ run: RunRecord }>(origin, `/api/v1/runs/${id}?includeOutput=true`);
    if (response.body.run.status === expected) return response;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Run ${id} did not reach ${expected}.`);
}

async function createHarness(engine: EngineAdapter = immediateEngine, geocoder?: CensusGeocoder, dataDirectory?: string) {
  const directory = dataDirectory || await mkdtemp(join(tmpdir(), 'flyway-platform-test-'));
  const store = new FilePlatformStore({ dataDirectory: directory, initialLocations, initialLanes, initialDefaults: { serviceTarget: 0.98 } });
  const service = new PlatformService(store, engine);
  await service.initialize();
  const server = createPlatformHttpServer({ service, ownerToken, geocoder, allowedOrigin: 'http://127.0.0.1:5173' });
  const { origin } = await listenOnRandomLoopback(server);
  return { directory, store, service, server, origin };
}

const censusCalls: string[] = [];
const geocoder = new CensusGeocoder({
  fetch: (async (url: string | URL | Request) => {
    censusCalls.push(String(url));
    return new Response(JSON.stringify({ result: { addressMatches: [{ matchedAddress: '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500', coordinates: { x: -77.0365, y: 38.8977 } }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch,
  now: () => Date.parse('2026-09-04T12:00:00.000Z'),
});

const harness = await createHarness(immediateEngine, geocoder);
try {
  const health = await api(harness.origin, '/api/v1/health', { authenticated: false });
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.match(health.headers.get('content-security-policy') || '', /default-src 'none'/);
  assert.ok(health.headers.get('x-correlation-id'));

  const unauthorized = await api(harness.origin, '/api/v1/workspace', { authenticated: false });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.code, 'authentication_required');
  assert.equal(unauthorized.headers.get('cache-control'), 'no-store');
  const preflight = await fetch(`${harness.origin}/api/v1/workspace`, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:5173', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' }, redirect: 'error' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
  const disallowedOrigin = await api(harness.origin, '/api/v1/workspace', { headers: { origin: 'https://attacker.example' } });
  assert.equal(disallowedOrigin.status, 403);
  assert.equal(disallowedOrigin.body.code, 'origin_not_allowed');

  const initial = await api<{ workspace: { revision: number; locations: typeof initialLocations; lanes: typeof initialLanes; defaults: Record<string, unknown> } }>(harness.origin, '/api/v1/workspace');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.workspace.revision, 1);
  assert.equal(initial.headers.get('etag'), '"1"');

  const missingRevision = await api(harness.origin, '/api/v1/workspace', {
    method: 'PUT',
    headers: { 'idempotency-key': 'workspace-missing-revision' },
    body: JSON.stringify({ defaults: initial.body.workspace.defaults, locations: initialLocations, lanes: initialLanes }),
  });
  assert.equal(missingRevision.status, 428);
  assert.equal(missingRevision.body.code, 'expected_revision_required');

  const savedInput: FrozenPlatformRunInput = { schemaVersion: 1, workspaceId: 'saved', workspaceRevision: 1, defaults: {}, locations: initialLocations, lanes: initialLanes, evidenceLedger: { schemaVersion: 1, sources: [], artifacts: [], snapshots: [], values: [], conflicts: [] }, scenario };
  const replacement = {
    defaults: { serviceTarget: 0.975, defaultGrain: 'daily' as const, workspacePreferences: { theme: 'dark', mapStyle: 'atlas' } },
    locations: initialLocations,
    lanes: initialLanes,
    scenarios: [{ ...scenario, id: 'saved-definition', name: 'Saved metadata', result: resultFor(savedInput) }],
    evidenceLedger: { schemaVersion: 1 as const, sources: [], artifacts: [], snapshots: [], values: [], conflicts: [] },
  };
  const updateHeaders = { 'if-match': '"1"', 'idempotency-key': 'workspace-update-0001' };
  const updated = await api<{ workspace: { revision: number }; idempotentReplay: boolean }>(harness.origin, '/api/v1/workspace', { method: 'PUT', headers: updateHeaders, body: JSON.stringify(replacement) });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.workspace.revision, 2);
  assert.equal(updated.body.idempotentReplay, false);
  const persistedWorkspace = await api<{ workspace: { defaults: { workspacePreferences?: { theme?: string } }; scenarios: unknown[]; evidenceLedger: { schemaVersion: number } } }>(harness.origin, '/api/v1/workspace');
  assert.equal(persistedWorkspace.body.workspace.defaults.workspacePreferences?.theme, 'dark');
  assert.equal(persistedWorkspace.body.workspace.scenarios.length, 1);
  assert.equal(persistedWorkspace.body.workspace.evidenceLedger.schemaVersion, 1);
  const replay = await api<{ workspace: { revision: number }; idempotentReplay: boolean }>(harness.origin, '/api/v1/workspace', { method: 'PUT', headers: updateHeaders, body: JSON.stringify(replacement) });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.workspace.revision, 2);
  assert.equal(replay.body.idempotentReplay, true);

  const reusedKey = await api(harness.origin, '/api/v1/workspace', { method: 'PUT', headers: updateHeaders, body: JSON.stringify({ ...replacement, defaults: { serviceTarget: 0.5 } }) });
  assert.equal(reusedKey.status, 409);
  assert.equal(reusedKey.body.code, 'idempotency_key_reused');

  const concurrencyPayloadA = { ...replacement, defaults: { serviceTarget: 0.96 } };
  const concurrencyPayloadB = { ...replacement, defaults: { serviceTarget: 0.95 } };
  const concurrency = await Promise.all([
    api(harness.origin, '/api/v1/workspace', { method: 'PUT', headers: { 'if-match': '"2"', 'idempotency-key': 'concurrent-workspace-a' }, body: JSON.stringify(concurrencyPayloadA) }),
    api(harness.origin, '/api/v1/workspace', { method: 'PUT', headers: { 'if-match': '"2"', 'idempotency-key': 'concurrent-workspace-b' }, body: JSON.stringify(concurrencyPayloadB) }),
  ]);
  assert.deepEqual(concurrency.map((item) => item.status).sort(), [200, 412]);
  const current = await api<{ workspace: { revision: number; defaults: Record<string, unknown> } }>(harness.origin, '/api/v1/workspace');
  assert.equal(current.body.workspace.revision, 3);

  const invalid = await api(harness.origin, '/api/v1/workspace', { method: 'PUT', headers: { 'if-match': '"3"', 'idempotency-key': 'invalid-workspace-shape' }, body: JSON.stringify({ defaults: {}, locations: {}, lanes: [] }) });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.code, 'validation_failed');

  const firstGeocode = await api<{ candidates: Array<{ latitude: number; provider: string }> }>(harness.origin, '/api/v1/geocode?address=1600%20Pennsylvania%20Ave%20NW%2C%20Washington%2C%20DC');
  const cachedGeocode = await api<{ candidates: Array<{ longitude: number }> }>(harness.origin, '/api/v1/geocode?address=1600%20Pennsylvania%20Ave%20NW%2C%20Washington%2C%20DC');
  assert.equal(firstGeocode.status, 200);
  assert.equal(firstGeocode.body.candidates[0].provider, 'U.S. Census Geocoder');
  assert.equal(cachedGeocode.body.candidates[0].longitude, -77.0365);
  assert.equal(censusCalls.length, 1, 'geocoder responses are cached by normalized address');
  assert.ok(censusCalls[0].startsWith('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?'));

  const createHeaders = { 'idempotency-key': 'create-run-platform-0001', 'x-correlation-id': 'platform-test-correlation-0001' };
  const created = await api<RunRecord & { idempotentReplay: boolean }>(harness.origin, '/api/v1/runs', { method: 'POST', headers: createHeaders, body: JSON.stringify({ scenario, expectedWorkspaceRevision: 3 }) });
  assert.equal(created.status, 202);
  assert.match(created.body.id, /^[0-9a-f-]{36}$/);
  const duplicate = await api<RunRecord & { idempotentReplay: boolean }>(harness.origin, '/api/v1/runs', { method: 'POST', headers: createHeaders, body: JSON.stringify({ scenario, expectedWorkspaceRevision: 3 }) });
  assert.equal(duplicate.status, 202);
  assert.equal(duplicate.body.id, created.body.id);
  assert.equal(duplicate.body.idempotentReplay, true);
  const completed = await waitForRun(harness.origin, created.body.id, 'succeeded');
  assert.equal(completed.status, 200);
  assert.equal((completed.body as unknown as { output: ScenarioResult }).output.scenario.stockoutUnits, 10);
  assert.match((completed.body as { run: RunRecord }).run.outputChecksum || '', /^[a-f0-9]{64}$/);

  const derived = await api<RunRecord>(harness.origin, '/api/v1/runs', { method: 'POST', headers: { 'idempotency-key': 'create-derived-run-0001' }, body: JSON.stringify({ scenario: { ...scenario, id: 'derived-scenario', name: 'Derived frozen-baseline scenario' }, expectedWorkspaceRevision: 3, sourceRunId: created.body.id }) });
  assert.equal(derived.status, 202);
  assert.equal(derived.body.sourceRunId, created.body.id);
  await waitForRun(harness.origin, derived.body.id, 'succeeded');

  const client = createPlatformClient({ baseUrl: harness.origin, ownerToken });
  const clientWorkspace = await client.getWorkspace();
  assert.equal(clientWorkspace.workspace.revision, 3);
  assert.equal(clientWorkspace.etag, '"3"');
  assert.ok((await client.listRuns()).items.some((run) => run.id === created.body.id));
  assert.equal((await client.getLegacyRunResult(created.body.id)).output.scenario.stockoutUnits, 10);
  assert.equal((await client.getAudit()).some((event) => event.action === 'run.succeeded'), true);
  assert.equal((await client.getRunEvents(created.body.id)).at(-1)?.status, 'succeeded');
  assert.throws(() => createPlatformClient({ baseUrl: 'http://example.com', ownerToken }), /HTTPS or HTTP on a loopback/);
  const unauthorizedClient = createPlatformClient({ baseUrl: harness.origin, ownerToken: `${ownerToken}-wrong` });
  await assert.rejects(() => unauthorizedClient.getWorkspace(), (error: unknown) => error instanceof PlatformRequestError && error.problem.code === 'authentication_required');

  const badTarget = await api(harness.origin, '/api/v1/runs', { method: 'POST', headers: { 'idempotency-key': 'create-run-invalid-target' }, body: JSON.stringify({ scenario: { ...scenario, id: 'bad', targetId: 'missing-location' }, expectedWorkspaceRevision: 3 }) });
  assert.equal(badTarget.status, 422);
  assert.equal(badTarget.body.code, 'validation_failed');

  const events = await api<{ events: Array<{ action: string }> }>(harness.origin, '/api/v1/audit?after=0');
  assert.equal(events.status, 200);
  assert.ok(events.body.events.some((event) => event.action === 'workspace.replaced'));
  assert.ok(events.body.events.some((event) => event.action === 'run.succeeded'));
  const metrics = await api<{ jobsSucceeded: number; requests: number }>(harness.origin, '/api/v1/metrics');
  assert.ok(metrics.body.jobsSucceeded >= 1);
  assert.ok(metrics.body.requests >= 1);

  const backupPath = join(await mkdtemp(join(tmpdir(), 'flyway-platform-backup-')), 'backup.json');
  const backupReceipt = await harness.store.createBackup(backupPath);
  assert.match(backupReceipt.checksum, /^[a-f0-9]{64}$/);
  const backup = JSON.parse(await readFile(backupPath, 'utf8')) as { artifacts: unknown[] };
  assert.ok(backup.artifacts.length >= 2);
  const restoredDirectory = await mkdtemp(join(tmpdir(), 'flyway-platform-restored-'));
  const restoreReceipt = await FilePlatformStore.restoreBackup(backupPath, restoredDirectory);
  assert.equal(restoreReceipt.artifactCount, backup.artifacts.length);
  const restoredStore = new FilePlatformStore({ dataDirectory: restoredDirectory, initialLocations: [], initialLanes: [] });
  await restoredStore.initialize();
  const restored = await restoredStore.read();
  assert.equal(restored.workspace.revision, 3);
  assert.equal(restored.runs[created.body.id].status, 'succeeded');
  assert.equal(restored.audit.length, events.body.events.length);
} finally {
  await closeServer(harness.server);
}

// Cancellation remains durable even though a synchronous deterministic step
// can only observe it before or after execution.
let releaseEngine!: () => void;
const engineGate = new Promise<void>((resolve) => { releaseEngine = resolve; });
const controlledEngine: EngineAdapter = {
  async freeze(input) { return structuredClone(input); },
  async execute(input) { await engineGate; return resultFor(input as FrozenPlatformRunInput); },
};
const cancelHarness = await createHarness(controlledEngine);
try {
  const created = await api<RunRecord>(cancelHarness.origin, '/api/v1/runs', { method: 'POST', headers: { 'idempotency-key': 'cancel-run-create-0001' }, body: JSON.stringify({ scenario, expectedWorkspaceRevision: 1 }) });
  await waitForRun(cancelHarness.origin, created.body.id, 'running');
  const cancelled = await api<RunRecord>(cancelHarness.origin, `/api/v1/runs/${created.body.id}/cancel`, { method: 'POST', headers: { 'idempotency-key': 'cancel-run-action-0001' } });
  assert.equal(cancelled.status, 202);
  assert.equal(cancelled.body.cancelRequested, true);
  releaseEngine();
  await waitForRun(cancelHarness.origin, created.body.id, 'cancelled');
  const retried = await api<RunRecord>(cancelHarness.origin, `/api/v1/runs/${created.body.id}/retry`, { method: 'POST', headers: { 'idempotency-key': 'retry-cancelled-run-0001' } });
  assert.equal(retried.status, 202);
  const succeeded = await waitForRun(cancelHarness.origin, created.body.id, 'succeeded');
  assert.equal(succeeded.body.run.attempt, 2);
} finally {
  await closeServer(cancelHarness.server);
}

// A persisted running job is put back in the queue after service restart and
// executes from its immutable input artifact.
const recoveryDirectory = await mkdtemp(join(tmpdir(), 'flyway-platform-recovery-'));
const recoveryHarness = await createHarness(immediateEngine, undefined, recoveryDirectory);
let recoveryRunId = '';
try {
  const created = await api<RunRecord>(recoveryHarness.origin, '/api/v1/runs', { method: 'POST', headers: { 'idempotency-key': 'recovery-run-create-0001' }, body: JSON.stringify({ scenario, expectedWorkspaceRevision: 1 }) });
  recoveryRunId = created.body.id;
  await waitForRun(recoveryHarness.origin, recoveryRunId, 'succeeded');
} finally {
  await closeServer(recoveryHarness.server);
}
await recoveryHarness.store.transaction((database) => {
  const run = database.runs[recoveryRunId];
  run.status = 'running';
  run.outputArtifact = undefined;
  run.outputChecksum = undefined;
  run.completedAt = undefined;
  run.cancelRequested = false;
});
const restarted = await createHarness(immediateEngine, undefined, recoveryDirectory);
try {
  const recovered = await waitForRun(restarted.origin, recoveryRunId, 'succeeded');
  assert.equal(recovered.body.run.attempt, 2);
  const metrics = await api<{ recoveredJobs: number }>(restarted.origin, '/api/v1/metrics');
  assert.equal(metrics.body.recoveredJobs, 1);
  const events = await api<{ events: Array<{ message: string }> }>(restarted.origin, `/api/v1/runs/${recoveryRunId}/events?after=0`);
  assert.ok(events.body.events.some((event) => /Recovered after an interrupted worker/.test(event.message)));
} finally {
  await closeServer(restarted.server);
}

// Failed jobs preserve the failure record and can be explicitly retried.
let executionCount = 0;
const flakyEngine: EngineAdapter = {
  async freeze(input) { return structuredClone(input); },
  async execute(input) {
    executionCount += 1;
    if (executionCount === 1) throw new Error('Injected deterministic worker failure.');
    return resultFor(input as FrozenPlatformRunInput);
  },
};
const retryHarness = await createHarness(flakyEngine);
try {
  const created = await api<RunRecord>(retryHarness.origin, '/api/v1/runs', { method: 'POST', headers: { 'idempotency-key': 'failed-run-create-0001' }, body: JSON.stringify({ scenario, expectedWorkspaceRevision: 1 }) });
  const failed = await waitForRun(retryHarness.origin, created.body.id, 'failed');
  assert.equal(failed.body.run.error?.code, 'engine_execution_failed');
  await api(retryHarness.origin, `/api/v1/runs/${created.body.id}/retry`, { method: 'POST', headers: { 'idempotency-key': 'failed-run-retry-0001' } });
  const succeeded = await waitForRun(retryHarness.origin, created.body.id, 'succeeded');
  assert.equal(succeeded.body.run.attempt, 2);
} finally {
  await closeServer(retryHarness.server);
}

// Full browser client -> authenticated HTTP service -> immutable artifact ->
// production deterministic engine -> polled result integration proof.
const integratedHarness = await createHarness(defaultAdapter);
try {
  const client = createPlatformClient({ baseUrl: integratedHarness.origin, ownerToken });
  const workspace = await client.getWorkspace();
  const submitted = await client.submitRun(scenario, workspace.workspace.revision, { idempotencyKey: 'integrated-default-engine-run' });
  const completed = await client.pollRun(submitted.id, { intervalMs: 5, timeoutMs: 5_000 });
  assert.equal(completed.run.status, 'succeeded');
  assert.ok(completed.summary);
  assert.notEqual(completed.summary?.runId, completed.run.id, 'logical engine run identity must remain distinct from the service job UUID');
  const compactResponse = await fetch(`${integratedHarness.origin}/api/v1/runs/${submitted.id}`, { headers: { authorization: `Bearer ${ownerToken}` } });
  const compactText = await compactResponse.text();
  assert.equal(compactResponse.status, 200);
  assert.ok(Buffer.byteLength(compactText) < 64 * 1024, 'routine run reads must remain compact');
  assert.equal('output' in JSON.parse(compactText), false, 'routine run reads must not materialize the complete result');
  const completedReader = client.createRunReader(completed.run, completed.summary!);
  const completedInput = await completedReader.input();
  assert.equal(completedInput.schemaVersion, 2);
  assert.equal(completed.summary?.inputHash, completed.run.inputHash);
  assert.equal(completed.summary?.outputChecksum, completed.run.outputChecksum);
  const sourceLocationIds = new Set(workspace.workspace.locations.filter((location) => location.id !== scenario.targetId).map((location) => location.id));
  const changedWorkspace = await client.putWorkspace({
    defaults: workspace.workspace.defaults,
    locations: workspace.workspace.locations.filter((location) => sourceLocationIds.has(location.id)),
    lanes: workspace.workspace.lanes.filter((lane) => sourceLocationIds.has(lane.originId) && sourceLocationIds.has(lane.destinationId)),
    scenarios: workspace.workspace.scenarios,
    evidenceLedger: workspace.workspace.evidenceLedger,
  }, { etag: workspace.etag, idempotencyKey: 'integrated-remove-source-target' });
  const derivedScenario = { ...scenario, id: 'integrated-derived-run', name: 'Integrated frozen-source rerun', magnitude: 50 };
  const derived = await client.submitRun(derivedScenario, changedWorkspace.workspace.revision, { sourceRunId: submitted.id, idempotencyKey: 'integrated-derived-engine-run' });
  const derivedResult = await client.pollRun(derived.id, { intervalMs: 5, timeoutMs: 5_000 });
  assert.equal(derivedResult.run.sourceRunId, submitted.id);
  assert.ok(derivedResult.summary);
  const derivedInput = await client.createRunReader(derivedResult.run, derivedResult.summary!).input();
  assert.equal(derivedInput.scenario.id, derivedScenario.id);
  assert.deepEqual(derivedInput.locations, completedInput.locations, 'derived runs must reuse the source run frozen baseline');

  const runPageOne = await client.listRuns({ limit: 1 });
  assert.equal(runPageOne.items.length, 1);
  assert.ok(runPageOne.total >= 2);
  assert.ok(runPageOne.nextCursor);
  const runPageTwo = await client.listRuns({ limit: 1, cursor: runPageOne.nextCursor });
  assert.equal(runPageTwo.items.length, 1);
  assert.notEqual(runPageTwo.items[0].id, runPageOne.items[0].id);

  const found = await client.findRunByInputHash(derivedResult.run.inputHash);
  assert.equal(found.run.id, derived.id);
  assert.equal(found.summary?.inputHash, derivedResult.run.inputHash);

  const metricPage = await completedReader.metrics({ kind: 'scenario', locationType: 'restaurant', stockoutsOnly: true, limit: 3 });
  assert.ok(metricPage.total >= metricPage.items.length);
  assert.ok(metricPage.items.every((row) => row.locationType === 'restaurant' && row.stockoutQuantity > 0));
  assert.equal(metricPage.scope.stockoutsOnly, true);
  if (metricPage.nextCursor) {
    const nextMetricPage = await completedReader.metrics({ kind: 'scenario', locationType: 'restaurant', stockoutsOnly: true, limit: 3, cursor: metricPage.nextCursor });
    assert.deepEqual(nextMetricPage.totals, metricPage.totals, 'metric totals must describe the complete filtered set, not the page');
    await assert.rejects(
      () => completedReader.metrics({ kind: 'baseline', locationType: 'restaurant', stockoutsOnly: true, limit: 3, cursor: metricPage.nextCursor }),
      (error: unknown) => error instanceof PlatformRequestError && error.problem.code === 'invalid_cursor',
    );
    const tamperedCursor = `${metricPage.nextCursor.slice(0, -1)}${metricPage.nextCursor.endsWith('a') ? 'b' : 'a'}`;
    await assert.rejects(
      () => completedReader.metrics({ kind: 'scenario', locationType: 'restaurant', stockoutsOnly: true, limit: 3, cursor: tamperedCursor }),
      (error: unknown) => error instanceof PlatformRequestError && error.problem.code === 'invalid_cursor',
    );
  }
  const fullScope = await completedReader.scope({ product: 'all', period: -1, sort: 'impact', limit: 2 });
  assert.equal(fullScope.scope.period, -1);
  assert.ok(fullScope.restaurants.total >= fullScope.restaurants.items.length);
  const invalidScope = await api(integratedHarness.origin, `/api/v1/runs/${submitted.id}/scope?product=all&period=99&sort=impact`);
  assert.equal(invalidScope.status, 422);

  const scenarioSaveKey = 'integrated-save-scenario-reference';
  const saved = await client.saveScenario(derived.id, changedWorkspace.workspace.revision, { idempotencyKey: scenarioSaveKey });
  assert.equal(saved.scenario.resultRef.runId, derived.id);
  assert.equal(saved.scenario.resultRef.kind, 'service');
  if (saved.scenario.resultRef.kind !== 'service') throw new Error('The service must return a service run locator.');
  assert.equal(saved.scenario.resultRef.workspaceId, changedWorkspace.workspace.id);
  assert.equal(saved.scenario.latestRun.outputChecksum, derivedResult.summary?.outputChecksum);
  assert.equal(saved.workspaceRevision, changedWorkspace.workspace.revision + 1);
  assert.equal(saved.etag, `"${saved.workspaceRevision}"`);
  const savedReplay = await client.saveScenario(derived.id, changedWorkspace.workspace.revision, { idempotencyKey: scenarioSaveKey });
  assert.equal(savedReplay.idempotentReplay, true);
  assert.deepEqual(savedReplay.scenario, saved.scenario);
  const scenarioPage = await client.listScenarios({ limit: 1 });
  assert.equal(scenarioPage.total, 1);
  assert.equal((await client.getScenario(derivedScenario.id)).id, derivedScenario.id);
  const scenarioRuns = await client.listScenarioRuns(derivedScenario.id, { limit: 1 });
  assert.equal(scenarioRuns.total, 1);
  assert.equal(scenarioRuns.items[0].id, derived.id);

  const connectedWorkspace = await client.getWorkspace();
  const forgedScenario = structuredClone(saved.scenario);
  forgedScenario.latestRun.narrative = 'Client-forged published summary';
  await assert.rejects(
    () => client.putWorkspace({
      defaults: connectedWorkspace.workspace.defaults,
      locations: connectedWorkspace.workspace.locations,
      lanes: connectedWorkspace.workspace.lanes,
      scenarios: [forgedScenario],
      evidenceLedger: connectedWorkspace.workspace.evidenceLedger,
    }, { etag: connectedWorkspace.etag, idempotencyKey: 'integrated-forged-scenario-reference' }),
    (error: unknown) => error instanceof PlatformRequestError && error.problem.code === 'untrusted_scenario_reference',
  );
} finally {
  await closeServer(integratedHarness.server);
}

console.log('Flyway platform passed: browser client security/polling, exact-origin CORS, owner auth/security headers, typed workspace/evidence persistence, optimistic concurrency, idempotency, frozen-source derived runs, default engine integration, durable artifacts, async run states, cancel/retry, interrupted-job recovery, audit/metrics, Census geocoder caching, and backup restore.');
