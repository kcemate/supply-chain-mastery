import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';

const port = await new Promise<number>((resolve, reject) => {
  const probe = net.createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => {
    const address = probe.address(); const selected = typeof address === 'object' && address ? address.port : 0;
    probe.close((error) => error ? reject(error) : resolve(selected));
  });
});
const server = spawn('node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; server.stdout.on('data', (chunk) => { output += String(chunk); }); server.stderr.on('data', (chunk) => { output += String(chunk); });
const url = `http://127.0.0.1:${port}`;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try { if ((await fetch(url)).ok) break; } catch { /* starting */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (attempt === 79) throw new Error(`Vite did not start:\n${output}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  // tsx preserves function names in serialized Playwright callbacks through
  // this helper; the browser realm must provide the same no-op binding.
  await page.addInitScript('globalThis.__name = (target) => target;');
  await page.goto(url);
  const first = await page.evaluate(async () => {
    // @ts-expect-error Vite resolves this browser-only module URL at runtime.
    const { initialLocations, initialLanes } = await import('/src/flywayData.ts');
    // @ts-expect-error Vite resolves this browser-only module URL at runtime.
    const engine = await import('/src/flywayEngine.ts');
    // @ts-expect-error Vite resolves this browser-only module URL at runtime.
    const local = await import('/src/localRunRepository.ts');
    const scenario = { id: 'local-artifact', name: 'Local artifact', description: 'Browser persistence fixture', type: 'dc-outage', targetId: 'dc-cartersville', magnitude: 100, grain: 'weekly', horizon: 1, createdAt: '2026-09-04T18:00:00.000Z', baselineRevision: 'local:r1', startDate: '2026-09-07' };
    const result = engine.runScenario(initialLocations, initialLanes, scenario);
    const reader = await local.persistLocalRun(result);
    const input = await reader.input();
    let cursor: string | undefined; let rows = 0; let total = -1; const periods = new Set<number>();
    do { const page = await reader.metrics({ kind: 'scenario', limit: 7, cursor }); rows += page.items.length; for (const item of page.items as Array<{ periodIndex: number }>) periods.add(item.periodIndex); total = page.total; cursor = page.nextCursor; } while (cursor);
    const reference = local.createLocalScenarioReference(scenario, reader, '2026-09-04T18:01:00.000Z');
    const migrated = await local.migrateLegacyScenario({ ...scenario, result });
    const memory = await local.createMemoryRunReader(result);
    const memoryInput = await memory.input();
    const interruptedScenario = { ...scenario, id: 'interrupted-local-artifact', name: 'Interrupted local artifact' };
    const interruptedResult = engine.runScenario(initialLocations, initialLanes, interruptedScenario);
    const abort = new AbortController();
    queueMicrotask(() => abort.abort());
    let interruptionRejected = false;
    try { await local.persistLocalRun(interruptedResult, { signal: abort.signal }); } catch (error) { interruptionRejected = error instanceof DOMException && error.name === 'AbortError'; }
    let interruptedPublished = true;
    try { await local.openLocalRun({ kind: 'local', runId: interruptedResult.runId }); } catch { interruptedPublished = false; }
    let denyArtifactWrite = false;
    const denied = new local.LocalRunRepository({ databaseName: `flyway-quota-${crypto.randomUUID()}`, beforeCommit: () => { if (denyArtifactWrite) throw new DOMException('Quota exceeded', 'QuotaExceededError'); } });
    await denied.persist(result);
    denyArtifactWrite = true;
    let quotaRejected = false;
    try { await denied.persist(interruptedResult); } catch (error) { quotaRejected = error instanceof DOMException && error.name === 'QuotaExceededError'; }
    let quotaPublished = true;
    try { await denied.open({ kind: 'local', runId: interruptedResult.runId }); } catch { quotaPublished = false; }
    const existingAfterQuota = await denied.open({ kind: 'local', runId: result.runId });
    const quotaFallback = await local.createMemoryRunReader(interruptedResult);
    return { runId: result.runId, inputHash: result.inputHash, persistedInputHash: reader.summary.inputHash, inputLocationCount: input.locations.length, rows, total, periods: [...periods].sort((a,b)=>a-b), reference, migrated, memoryInputHash: memory.summary.inputHash, memoryLocationCount: memoryInput.locations.length, interruptedInputHash: interruptedResult.inputHash, interruptionRejected, interruptedPublished, quotaRejected, quotaPublished, existingAfterQuotaHash: existingAfterQuota.summary.inputHash, quotaFallbackHash: quotaFallback.summary.inputHash };
  });
  assert.equal(first.persistedInputHash, first.inputHash);
  assert.equal(first.inputLocationCount > 0, true);
  assert.equal(first.rows, first.total, 'bounded pagination returns every metric row exactly once');
  assert.deepEqual(first.periods, [0,1,2,3,4,5,6], 'one weekly reporting period retains the complete seven-day simulation horizon');
  assert.equal(first.reference.schemaVersion, 2);
  assert.equal(first.reference.resultRef.kind, 'local');
  assert.equal(first.migrated.resultRef.runId, first.runId);
  assert.equal(first.memoryInputHash, first.inputHash);
  assert.equal(first.memoryLocationCount, first.inputLocationCount);
  assert.equal(first.interruptionRejected, true);
  assert.equal(first.interruptedPublished, false, 'an interrupted artifact write never publishes a discoverable manifest');
  assert.equal(first.quotaRejected, true);
  assert.equal(first.quotaPublished, false, 'a deterministic artifact quota failure never publishes a saved run');
  assert.equal(first.existingAfterQuotaHash, first.inputHash, 'an artifact-write failure leaves an earlier saved run readable and unchanged');
  assert.equal(first.quotaFallbackHash, first.interruptedInputHash, 'the exact failed run remains readable through memory fallback');

  await page.reload({ waitUntil: 'domcontentloaded' });
  const reopened = await page.evaluate(async (runId) => {
    // @ts-expect-error Vite resolves this browser-only module URL at runtime.
    const { openLocalRun } = await import('/src/localRunRepository.ts');
    const reader = await openLocalRun({ kind: 'local', runId });
    const input = await reader.input();
    const impacts = await reader.impacts();
    return { inputHash: reader.summary.inputHash, locations: input.locations.length, impacts: impacts.total };
  }, first.runId);
  assert.equal(reopened.inputHash, first.inputHash);
  assert.equal(reopened.locations, first.inputLocationCount);
  assert.equal(reopened.impacts >= 0, true);

  await page.goto(`${url}/tests/workspace-reference-harness.html`);
  await page.getByTestId('ready').waitFor();
  const workspaceSave = await page.evaluate(async (reference) => {
    const harness = window.workspaceReferenceHarness!;
    const expected = harness.revision();
    const firstSaved = await harness.save(reference, expected);
    const afterFirst = JSON.parse(localStorage.getItem('flyway:v2:flyway-workspace')!).value.revision as number;
    const concurrent = await Promise.all([harness.save(reference, afterFirst), harness.save(reference, afterFirst)]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const envelope = localStorage.getItem('flyway:v2:flyway-workspace')!;
    return { firstSaved, concurrent, scenarios: JSON.parse(envelope).value.scenarios as unknown[], error: harness.error(), envelopeBytes: new TextEncoder().encode(envelope).byteLength, embedsTrace: envelope.includes('periodMetrics') || envelope.includes('baselinePeriodMetrics') };
  }, first.reference);
  assert.equal(workspaceSave.firstSaved, true);
  assert.deepEqual(workspaceSave.concurrent.sort(), [false, true], 'queued writes with the same expected workspace revision cannot both win');
  assert.equal(workspaceSave.scenarios.some((item) => (item as { schemaVersion?: number }).schemaVersion === 2), true);
  assert.equal(workspaceSave.embedsTrace, false, 'workspace reference storage never embeds trace or frozen-result arrays');
  assert.ok(workspaceSave.envelopeBytes < 250_000, 'compact browser workspace remains below the result-list budget');

  const failure = await page.evaluate(async (runId) => {
    // @ts-expect-error Vite resolves this browser-only module URL at runtime.
    const { LocalStore } = await import('/src/workspaceStorage.ts');
    // @ts-expect-error Vite resolves this browser-only module URL at runtime.
    const local = await import('/src/localRunRepository.ts');
    const reference = local.createLocalScenarioReference({ id: 'local-artifact', name: 'Local artifact', description: 'Browser persistence fixture', type: 'dc-outage', targetId: 'dc-cartersville', magnitude: 100, grain: 'weekly', horizon: 1, createdAt: '2026-09-04T18:00:00.000Z', baselineRevision: 'local:r1', startDate: '2026-09-07' }, await local.openLocalRun({ kind: 'local', runId }));
    const legacy = { schemaVersion: 1, revision: 7, locations: [], lanes: [], preferences: {}, scenarios: [{ id: 'legacy-original' }], evidenceLedger: undefined };
    const values = new Map<string, string>();
    const key = 'flyway:v2:migration-quota-fixture';
    values.set(key, JSON.stringify({ schemaVersion: 2, revision: 1, updatedAt: '2026-09-04T18:00:00.000Z', value: legacy }));
    let deny = false;
    const storage = {
      get length() { return values.size; }, clear() { values.clear(); }, key(index: number) { return [...values.keys()][index] || null; },
      getItem(name: string) { return values.get(name) || null; }, removeItem(name: string) { values.delete(name); },
      setItem(name: string, value: string) { if (deny && name === key) throw new DOMException('Quota exceeded', 'QuotaExceededError'); values.set(name, value); },
    } as Storage;
    const store = new LocalStore('migration-quota-fixture', legacy, () => true, storage);
    const original = storage.getItem(key); deny = true;
    const saved = await store.update((current: typeof legacy) => ({ ...current, revision: 8, scenarios: [reference] }));
    const abort = new AbortController(); abort.abort();
    let aborted = false; try { await local.persistLocalRun(undefined as never, { signal: abort.signal }); } catch (error) { aborted = error instanceof DOMException && error.name === 'AbortError'; }
    return { saved, originalPreserved: storage.getItem(key) === original, backupPreserved: storage.getItem(`${key}:last-good`) === original, aborted };
  }, first.runId);
  assert.equal(failure.saved, false, 'workspace reference is not reported saved when localStorage rejects it');
  assert.equal(failure.originalPreserved, true, 'the original embedded workspace envelope remains byte-for-byte intact');
  assert.equal(failure.backupPreserved, true, 'the previous envelope is retained as a recovery backup');
  assert.equal(failure.aborted, true);

  console.log('Local run browser QA passed: IndexedDB commit/reopen survives reload, interrupted publication stays undiscoverable, paginated reads are exact, memory fallback works, migration produces compact references, and failed reference writes preserve the original envelope.');
} finally {
  await browser.close(); server.kill('SIGTERM');
}
