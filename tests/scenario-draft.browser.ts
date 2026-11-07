import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { DecisionDraft } from '../src/decisionDraft';
import { contentHash } from '../src/engine/canonical';
import { isScenarioReference } from '../src/runArtifacts';
import type { WorkspaceDocument } from '../src/useWorkspace';

const port = await new Promise<number>((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    const selected = typeof address === 'object' && address ? address.port : 0;
    probe.close((error) => error ? reject(error) : resolve(selected));
  });
});
const server = spawn('node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += String(chunk); });
server.stderr.on('data', (chunk) => { serverOutput += String(chunk); });
const url = `http://127.0.0.1:${port}`;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try { if ((await fetch(url)).ok) break; } catch { /* server is starting */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (attempt === 79) throw new Error(`Vite did not start:\n${serverOutput}`);
}

async function onboard(page: Page) {
  await page.goto(url);
  await page.getByRole('checkbox', { name: /independent simulation/i }).check();
  for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Open Control Tower' }).click();
}

async function openScenario(page: Page) {
  await page.getByRole('tab', { name: 'Planning model' }).click();
  await page.getByRole('button', { name: 'Create scenario' }).click();
  return page.getByRole('dialog', { name: 'Create scenario' });
}

async function storedValue<T>(page: Page, key: string): Promise<T> {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!).value as T, key);
}
async function storedScenarioInput(page: Page, workspace: WorkspaceDocument, name: string) {
  const saved = workspace.scenarios.find((scenario) => scenario.name === name);
  if (!saved) return undefined;
  if (!isScenarioReference(saved)) return saved.result.input;
  if (saved.resultRef.kind !== 'local') return undefined;
  return page.evaluate(async (locator) => {
    // @ts-expect-error Vite resolves this browser-only module URL at runtime.
    const { openLocalRun } = await import('/src/localRunRepository.ts');
    return (await openLocalRun(locator)).input();
  }, saved.resultRef);
}

const browser = await chromium.launch({ headless: true });
try {
  const immediateClose = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const closePage = await immediateClose.newPage();
  await onboard(closePage);
  let drawer = await openScenario(closePage);
  const name = drawer.getByLabel('Scenario name');
  await name.fill('Persisted checkpoint');
  await drawer.getByText('Complete draft saved in this browser').waitFor();
  await closePage.evaluate(`(() => {
    const originalRequest = navigator.locks.request.bind(navigator.locks);
    Object.defineProperty(navigator.locks, 'request', {
      configurable: true,
      value: (lockName, callback) => new Promise((resolve) => setTimeout(resolve, 300)).then(() => originalRequest(lockName, callback)),
    });
  })()`);
  await name.fill('Final edit survives immediate close');
  const unloadProtected = await closePage.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(unloadProtected, true, 'dirty drafts protect browser reload and close during the debounce window');
  const closeButton = drawer.getByRole('button', { name: 'Close draft' });
  await closeButton.click();
  assert.equal(await drawer.getByLabel('Scenario name').isDisabled(), true, 'name cannot change after the close flush begins');
  assert.equal(await drawer.getByLabel('Time grain').isDisabled(), true, 'time grain cannot change after the close flush begins');
  assert.equal(await drawer.getByRole('spinbutton', { name: 'Horizon' }).isDisabled(), true, 'horizon cannot change after the close flush begins');
  assert.equal(await drawer.getByLabel('Start date').isDisabled(), true, 'start date cannot change after the close flush begins');
  await drawer.waitFor({ state: 'detached' });
  drawer = await openScenario(closePage);
  assert.equal(await drawer.getByLabel('Scenario name').inputValue(), 'Final edit survives immediate close');
  await drawer.getByLabel('Scenario name').fill('Top bar transition flushes first');
  await closePage.getByRole('button', { name: 'Ask Flyway' }).evaluate((element) => (element as HTMLButtonElement).click());
  await closePage.getByRole('dialog', { name: 'Flyway copilot' }).waitFor();
  assert.equal((await storedValue<DecisionDraft>(closePage, 'flyway:v2:flyway-decision-draft:local')).scenario.name, 'Top bar transition flushes first', 'top-bar drawer replacement waits for the complete scenario draft save');
  await immediateClose.close();

  const concurrent = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const firstTab = await concurrent.newPage();
  await onboard(firstTab);
  const firstDrawer = await openScenario(firstTab);
  await firstDrawer.getByLabel('Scenario name').fill('Tab A base');
  await firstDrawer.getByText('Complete draft saved in this browser').waitFor();
  const secondTab = await concurrent.newPage();
  await secondTab.goto(url);
  const secondDrawer = await openScenario(secondTab);
  assert.equal(await secondDrawer.getByLabel('Scenario name').inputValue(), 'Tab A base');
  await firstDrawer.getByLabel('Scenario name').fill('Tab A latest');
  await firstDrawer.getByText('Complete draft saved in this browser').waitFor();
  await secondDrawer.getByLabel('Scenario name').fill('Tab B stale overwrite');
  await secondDrawer.getByText(/Draft not saved.*revision/i).waitFor();
  const concurrentDraft = await storedValue<DecisionDraft>(firstTab, 'flyway:v2:flyway-decision-draft:local');
  assert.equal(concurrentDraft.scenario.name, 'Tab A latest', 'stale second tab must not replace the accepted draft');
  assert.equal(await secondDrawer.getByLabel('Scenario name').inputValue(), 'Tab B stale overwrite', 'rejected text remains visible for recovery');
  await secondDrawer.getByRole('button', { name: 'Close draft' }).click();
  await secondDrawer.getByText(/Draft not saved.*revision/i).waitFor();
  assert.equal(await secondDrawer.isVisible(), true, 'a failed close keeps the stale draft open');
  await concurrent.close();

  const frozen = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const frozenPage = await frozen.newPage();
  await onboard(frozenPage);
  drawer = await openScenario(frozenPage);
  await drawer.getByLabel('Scenario name').fill('Frozen lineage source');
  await drawer.getByRole('button', { name: 'Run scenario' }).click();
  let results = frozenPage.getByRole('dialog', { name: 'Scenario results' });
  await results.getByRole('heading', { name: 'Frozen lineage source' }).waitFor({ timeout: 120_000 });
  await results.getByRole('button', { name: 'Save scenario' }).click();
  await results.getByRole('button', { name: 'Saved' }).waitFor();
  const sourceWorkspace = await storedValue<WorkspaceDocument>(frozenPage, 'flyway:v2:flyway-workspace');
  const sourceInput = await storedScenarioInput(frozenPage, sourceWorkspace, 'Frozen lineage source');
  assert.ok(sourceInput);
  const frozenDraft: DecisionDraft = {
    schemaVersion: 1,
    kind: 'frozen',
    sourceInput,
    sourceInputHash: contentHash(sourceInput),
    scenario: {
      ...sourceInput.scenario,
      id: 'recovered-frozen-proposal',
      name: 'Recovered exact proposal',
      createdAt: '2026-09-04T18:00:00.000Z',
      changes: [...sourceInput.changes, { id: 'proposal-capacity', kind: 'adjust-capacity', locationId: 'dc-cartersville', multiplier: 1.15, effectiveDay: 0, note: 'Regression fixture proposal' }],
    },
  };
  await frozenPage.evaluate(({ key, draft }) => {
    const current = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, revision: current.revision + 1, updatedAt: new Date().toISOString(), value: draft }));
  }, { key: 'flyway:v2:flyway-decision-draft:local', draft: frozenDraft });
  await frozenPage.reload({ waitUntil: 'domcontentloaded' });
  drawer = await openScenario(frozenPage);
  await drawer.getByRole('heading', { name: 'Proposed changes in this draft' }).waitFor();
  assert.equal(await drawer.getByLabel('Scenario name').inputValue(), frozenDraft.scenario.name);
  await drawer.getByRole('button', { name: 'Run scenario' }).click();
  results = frozenPage.getByRole('dialog', { name: 'Scenario results' });
  await results.getByRole('heading', { name: frozenDraft.scenario.name }).waitFor({ timeout: 120_000 });
  await frozenPage.waitForTimeout(350);
  assert.equal(await storedValue<DecisionDraft | null>(frozenPage, 'flyway:v2:flyway-decision-draft:local'), null, 'successful run clears its own confirmed draft without a stale autosave recreating it');
  await results.getByRole('button', { name: 'Save scenario' }).click();
  await results.getByRole('button', { name: 'Saved' }).waitFor();
  const workspace = await storedValue<WorkspaceDocument>(frozenPage, 'flyway:v2:flyway-workspace');
  const rerunInput = await storedScenarioInput(frozenPage, workspace, frozenDraft.scenario.name);
  assert.ok(rerunInput && frozenDraft.sourceInput);
  assert.deepEqual(rerunInput.locations, frozenDraft.sourceInput.locations, 'recovered proposal rerun retains the source locations');
  assert.deepEqual(rerunInput.lanes, frozenDraft.sourceInput.lanes, 'recovered proposal rerun retains the source lanes');
  assert.deepEqual(rerunInput.defaults, frozenDraft.sourceInput.defaults, 'recovered proposal rerun retains the source defaults');
  assert.deepEqual(rerunInput.changes, frozenDraft.scenario.changes, 'recovered proposal rerun evaluates the exact proposed changes');
  assert.deepEqual(rerunInput.sourceVersions, frozenDraft.sourceInput.sourceVersions, 'recovered proposal rerun retains source lineage');
  await frozen.close();

  const storageFailure = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const recoveryPage = await storageFailure.newPage();
  await onboard(recoveryPage);
  await recoveryPage.evaluate(`(() => {
    const original = IDBObjectStore.prototype.add;
    window.restoreArtifactWrites = () => { IDBObjectStore.prototype.add = original; };
    IDBObjectStore.prototype.add = function(...args) {
      if (this.name === 'artifacts') throw new DOMException('Test artifact quota failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
  })()`);
  drawer = await openScenario(recoveryPage);
  await drawer.getByLabel('Scenario name').fill('In-memory result survives workspace attempt');
  await drawer.getByRole('spinbutton', { name: 'Horizon', exact: true }).fill('1');
  await drawer.getByRole('button', { name: 'Run scenario' }).click();
  results = recoveryPage.getByRole('dialog', { name: 'Scenario results' });
  await results.getByRole('heading', { name: 'In-memory result survives workspace attempt' }).waitFor({ timeout: 120_000 });
  await recoveryPage.getByText(/This result is retained in memory/).waitFor();
  assert.equal(await results.getByRole('button', { name: 'Saved', exact: true }).count(), 0);
  assert.equal(await recoveryPage.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), true);
  await results.getByRole('button', { name: 'Close scenario results' }).click();
  await recoveryPage.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Settings' }).click();
  await recoveryPage.getByRole('button', { name: 'Workspace service', exact: true }).click();
  await recoveryPage.getByLabel('Service URL').fill(url);
  await recoveryPage.getByLabel('Owner access token').fill('test-only-token-never-sent');
  await recoveryPage.getByRole('button', { name: 'Connect and load workspace' }).click();
  await recoveryPage.getByText('The current result must finish saving before you connect to another workspace.').waitFor();
  assert.match(await recoveryPage.locator('.workspace-save-bar').innerText(), /Browser-only workspace/);
  await recoveryPage.evaluate('window.restoreArtifactWrites()');
  await recoveryPage.getByRole('button', { name: 'Retry saving result' }).click();
  await recoveryPage.getByText(/This result is retained in memory/).waitFor({ state: 'detached' });
  await recoveryPage.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Scenarios' }).click();
  await recoveryPage.getByTestId('scenarios-page').getByRole('button', { name: /In-memory result survives workspace attempt/ }).click();
  await results.getByRole('heading', { name: 'In-memory result survives workspace attempt' }).waitFor();
  await results.getByRole('button', { name: 'Saved', exact: true }).waitFor();
  await storageFailure.close();

  console.log('Scenario draft browser passed: dirty unload protection and locked controls cover the flush window; reduced-motion close and top-bar replacement preserve the final edit; stale tabs fail closed; recovered frozen proposals rerun exact lineage without stale draft resurrection.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
