import assert from 'node:assert/strict';
import { initialLanes, initialLocations } from '../src/flywayData';
import { runScenario } from '../src/flywayEngine';
import { contentHash } from '../src/engine/canonical';
import { LocalStore, validateStoredValue } from '../src/workspaceStorage';
import { initialPreferences } from '../src/workspacePreferences';

class MemoryStorage implements Storage {
  protected data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

class RejectingStorage extends MemoryStorage {
  rejectWrites = false;
  setItem(key: string, value: string) {
    if (this.rejectWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    super.setItem(key, value);
  }
}

type Row = { id: string; value: number };
const validRows = (value: unknown): value is Row[] => Array.isArray(value) && value.every((row) => row && typeof row === 'object' && typeof (row as Row).id === 'string' && Number.isFinite((row as Row).value));
const envelope = <T>(revision: number, value: T) => JSON.stringify({ schemaVersion: 2, revision, updatedAt: '2026-09-04T12:00:00.000Z', value });
const cases: Array<{ name: string; run: () => void | Promise<void> }> = [];
const test = (name: string, run: () => void | Promise<void>) => cases.push({ name, run });

test('valid legacy migration reads and preserves the original through first save', async () => {
  const storage = new MemoryStorage();
  const legacy = JSON.stringify([{ id: 'legacy', value: 4 }]);
  storage.setItem('rows', legacy);
  const store = new LocalStore<Row[]>('rows', [], validRows, storage);
  assert.deepEqual(store.getSnapshot(), [{ id: 'legacy', value: 4 }]);
  assert.equal(storage.getItem('rows'), legacy);
  assert.equal(storage.getItem('flyway:v2:rows'), null, 'migration is read-only until an explicit save');
  assert.equal(await store.update([{ id: 'migrated', value: 5 }]), true);
  assert.equal(storage.getItem('rows'), legacy, 'legacy source is not deleted or rewritten');
  assert.equal(storage.getItem('flyway:v2:rows:legacy-original'), legacy, 'first v2 save retains a recovery copy of the legacy source');
});

test('corrupt v2 original remains preserved while last-good is recovered', () => {
  const storage = new MemoryStorage();
  const corrupt = '{"schemaVersion":2,"revision":"bad"';
  storage.setItem('flyway:v2:rows', corrupt);
  storage.setItem('flyway:v2:rows:last-good', envelope(2, [{ id: 'safe', value: 2 }]));
  const store = new LocalStore<Row[]>('rows', [], validRows, storage);
  assert.deepEqual(store.getSnapshot(), [{ id: 'safe', value: 2 }]);
  assert.equal(storage.getItem('flyway:v2:rows'), corrupt, 'the corrupt original must remain available for recovery');
});

test('write reports success only after storage accepts the new envelope', async () => {
  const storage = new MemoryStorage();
  const store = new LocalStore<Row[]>('rows', [], validRows, storage);
  const saved = await store.update([{ id: 'accepted', value: 1 }]);
  assert.equal(saved, true);
  assert.deepEqual(store.getSnapshot(), [{ id: 'accepted', value: 1 }]);
  assert.deepEqual(JSON.parse(storage.getItem('flyway:v2:rows')!).value, [{ id: 'accepted', value: 1 }]);
});

test('quota denial reports failure and retains the accepted in-memory revision', async () => {
  const storage = new RejectingStorage();
  const store = new LocalStore<Row[]>('rows', [{ id: 'before', value: 1 }], validRows, storage);
  storage.rejectWrites = true;
  const saved = await store.update([{ id: 'after', value: 2 }]);
  assert.equal(saved, false);
  assert.deepEqual(store.getSnapshot(), [{ id: 'before', value: 1 }]);
  assert.equal(storage.getItem('flyway:v2:rows'), null);
});

test('sequential functional edits in one tab compose without losing an update', async () => {
  const storage = new MemoryStorage();
  const store = new LocalStore<Row[]>('rows', [{ id: 'counter', value: 0 }], validRows, storage);
  const first = store.update((rows) => rows.map((row) => ({ ...row, value: row.value + 1 })));
  const second = store.update((rows) => rows.map((row) => ({ ...row, value: row.value + 1 })));
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(store.getSnapshot()[0].value, 2);
  assert.equal(JSON.parse(storage.getItem('flyway:v2:rows')!).revision, 2);
});

test('stale full replacement from another tab fails closed and loads the newer revision', async () => {
  const storage = new MemoryStorage();
  const firstTab = new LocalStore<Row[]>('rows', [{ id: 'counter', value: 0 }], validRows, storage);
  const secondTab = new LocalStore<Row[]>('rows', [{ id: 'counter', value: 0 }], validRows, storage);
  assert.equal(await firstTab.update([{ id: 'counter', value: 1 }]), true);
  assert.equal(await secondTab.update([{ id: 'counter', value: 9 }]), false);
  assert.deepEqual(secondTab.getSnapshot(), [{ id: 'counter', value: 1 }]);
});

test('explicit expected revision rejects a stale functional draft write', async () => {
  const storage = new MemoryStorage();
  const firstTab = new LocalStore<Row[]>('draft', [{ id: 'scenario', value: 0 }], validRows, storage);
  const secondTab = new LocalStore<Row[]>('draft', [{ id: 'scenario', value: 0 }], validRows, storage);
  const staleRevision = secondTab.getRevision();
  assert.equal(await firstTab.update(() => [{ id: 'scenario', value: 1 }], firstTab.getRevision()), true);
  assert.equal(await secondTab.update(() => [{ id: 'scenario', value: 9 }], staleRevision), false);
  assert.deepEqual(secondTab.getSnapshot(), [{ id: 'scenario', value: 1 }]);
  assert.equal(JSON.parse(storage.getItem('flyway:v2:draft')!).revision, 1, 'the stale functional update must not create a replacement revision');
});

const validMetric = { serviceLevel: 99, stockoutUnits: 0, totalLandedCost: 100, maxUtilization: 60 };
const validScenario = {
  id: 'scenario-1', name: 'Fixture', type: 'demand-surge', grain: 'daily', horizon: 7,
  result: { baseline: validMetric, scenario: validMetric, impacts: [], recommendations: [], inputHash: 'abc' },
};
const validWorkspace = {
  schemaVersion: 1, revision: 3, locations: initialLocations, lanes: initialLanes,
  preferences: initialPreferences, scenarios: [validScenario],
};

test('workspace validator rejects malformed nested evidence', () => {
  const malformed = { ...validWorkspace, evidenceLedger: { schemaVersion: 1, sources: [], artifacts: [], snapshots: [], values: [], conflicts: [{}] } };
  assert.equal(validateStoredValue('flyway-workspace', malformed), false);
});

test('preferences validator rejects malformed nested engine defaults', () => {
  const malformed = { ...initialPreferences, engineOverrides: { defaultVehicleCapacity: -10, defaultSeasonalityByWeekday: [1] } };
  assert.equal(validateStoredValue('flyway-preferences', malformed), false);
});

test('lane validator rejects malformed nested windows and product policies', () => {
  const malformed = [{ ...initialLanes[0], deliveryWindow: { startHour: 20, endHour: 4 }, productPolicies: [{ product: 'Chicken', allocationPct: 900 }] }];
  assert.equal(validateStoredValue('flyway-lanes', malformed), false);
});

test('saved scenario validator rejects a malformed frozen run input', () => {
  const malformed = [{ ...validScenario, result: { ...validScenario.result, input: { schemaVersion: 2, locations: [{ id: 'bad' }], lanes: 'bad' } } }];
  assert.equal(validateStoredValue('flyway-scenarios', malformed), false);
});

test('saved history validates its target against frozen input after the live target is removed', () => {
  const historicalDefinition = {
    id: 'saved-remove-target', name: 'Historical DC outage', description: 'Frozen before the target was removed.',
    type: 'dc-outage' as const, targetId: 'dc-cartersville', magnitude: 100, grain: 'daily' as const,
    horizon: 7, createdAt: '2026-09-04T12:00:00.000Z', baselineRevision: 'local:r1',
  };
  const saved = { ...historicalDefinition, result: runScenario(initialLocations, initialLanes, historicalDefinition) };
  const liveLocations = initialLocations.filter((location) => location.id !== historicalDefinition.targetId);
  const liveLanes = initialLanes.filter((lane) => lane.originId !== historicalDefinition.targetId && lane.destinationId !== historicalDefinition.targetId);
  assert.equal(validateStoredValue('flyway-workspace', { ...validWorkspace, locations: liveLocations, lanes: liveLanes, scenarios: [saved] }), true);
});

test('legacy history without frozen input remains readable after its target is removed', () => {
  const legacy = {
    id: 'legacy-history', name: 'Legacy outage', description: 'Predates frozen inputs.', type: 'dc-outage',
    targetId: 'removed-legacy-target', magnitude: 100, grain: 'daily', horizon: 7,
    createdAt: '2025-01-01T00:00:00.000Z', baselineRevision: 'legacy:r1', result: validScenario.result,
  };
  assert.equal(validateStoredValue('flyway-scenarios', [legacy]), true);
});

test('decision draft decoder requires complete frozen lineage and strict changes', () => {
  const definition = {
    id: 'draft-frozen', name: 'Frozen response', description: 'Draft from a completed run.', type: 'dc-outage' as const,
    targetId: 'dc-cartersville', magnitude: 100, grain: 'daily' as const, horizon: 7,
    createdAt: '2026-09-04T12:00:00.000Z', baselineRevision: 'local:r4',
    changes: [{ id: 'remove-lane', kind: 'remove-lane' as const, laneId: initialLanes[0].id, effectiveDay: 0 }],
  };
  const sourceInput = runScenario(initialLocations, initialLanes, definition).input!;
  const valid = { schemaVersion: 1, kind: 'frozen', scenario: definition, sourceInput, sourceInputHash: contentHash(sourceInput) };
  assert.equal(validateStoredValue('flyway-decision-draft:workspace', valid), true);
  assert.equal(validateStoredValue('flyway-decision-draft:workspace', { ...valid, sourceInputHash: 'short' }), false);
  assert.equal(validateStoredValue('flyway-decision-draft:workspace', { ...valid, scenario: { ...definition, changes: [{ id: 'bad', kind: 'remove-lane', effectiveDay: 0 }] } }), false);
});

test('malformed recovered frozen source is quarantined without replacing safe state', () => {
  const storage = new MemoryStorage();
  const malformed = { schemaVersion: 1, kind: 'frozen', scenario: {}, sourceInput: { schemaVersion: 2, locations: 'bad' }, sourceInputHash: 'b'.repeat(64) };
  const raw = envelope(9, malformed);
  storage.setItem('flyway:v2:flyway-decision-draft:workspace', raw);
  const store = new LocalStore<unknown>('flyway-decision-draft:workspace', null, (value): value is unknown => validateStoredValue('flyway-decision-draft:workspace', value), storage);
  assert.equal(store.getSnapshot(), null);
  assert.equal(storage.getItem('flyway:v2:flyway-decision-draft:workspace'), raw);
});

test('settings draft applies the same strict preferences decoder', () => {
  assert.equal(validateStoredValue('flyway-settings-draft:workspace', { revision: 4, preferences: initialPreferences }), true);
  assert.equal(validateStoredValue('flyway-settings-draft:workspace', { revision: 4, preferences: { ...initialPreferences, engineOverrides: { defaultVehicleCapacity: -1 } } }), false);
});

test('scenario result decoder rejects malformed impacts, proposals, and period traces', () => {
  const definition = {
    id: 'nested-result', name: 'Nested result', description: 'Decoder fixture.', type: 'dc-outage' as const,
    targetId: 'dc-cartersville', magnitude: 100, grain: 'daily' as const, horizon: 7,
    createdAt: '2026-09-04T12:00:00.000Z', baselineRevision: 'local:r8',
  };
  const result = runScenario(initialLocations, initialLanes, definition);
  const badImpact = { ...definition, result: { ...result, impacts: [{ locationId: 'dc-cartersville', serviceDelta: 'bad', stockoutUnits: 0, costDelta: 0, cause: 'fixture' }] } };
  const badProposal = { ...definition, result: { ...result, recommendations: [{ id: 'bad', title: 'Bad', action: 'Bad', rationale: 'Bad', serviceDelta: 0, costDelta: 0, confidence: 'High', affectedLocationIds: [], proposal: [{ id: 'bad-change', kind: 'remove-lane', effectiveDay: 0 }] }] } };
  const badTrace = { ...definition, result: { ...result, periodMetrics: [{ periodIndex: 0, date: '2026-09-04' }] } };
  assert.equal(validateStoredValue('flyway-scenarios', [badImpact]), false);
  assert.equal(validateStoredValue('flyway-scenarios', [badProposal]), false);
  assert.equal(validateStoredValue('flyway-scenarios', [badTrace]), false);
});

const failures: Array<{ name: string; error: unknown }> = [];
for (const item of cases) {
  try { await item.run(); console.log(`PASS ${item.name}`); }
  catch (error) { failures.push({ name: item.name, error }); console.error(`FAIL ${item.name}: ${error instanceof Error ? error.message : String(error)}`); }
}
console.log(`Workspace storage QA: ${cases.length - failures.length} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
