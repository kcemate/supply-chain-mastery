import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const previewPort = await availablePort();
const apiPort = await availablePort();
const origin = `http://127.0.0.1:${previewPort}`;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const token = 'browser-smoke-owner-token-000000000001';
const evidenceDecisionReason = 'Browser verification deferred pending stronger source evidence';
const evidenceDir = 'tasks/browser-evidence';
const dataDir = await mkdtemp(join(tmpdir(), 'flyway-browser-platform-'));
const buildDir = await mkdtemp(join(tmpdir(), 'flyway-browser-build-'));
const logs = { preview: [] as string[], api: [] as string[] };
const health = {
  errors: [] as string[], warnings: [] as string[], pageErrors: [] as string[],
  failedRequests: [] as string[], serverErrors: [] as string[], firstPartyClientErrors: [] as string[],
  accessibilityFailures: [] as Array<{ label: string; id: string; impact: string | null | undefined; help: string; targets: unknown[] }>,
  browserDriverDiagnostics: [] as string[],
};
const receipt = {
  runAt: new Date().toISOString(),
  completedAt: '',
  outcome: 'running' as 'running' | 'passed' | 'failed',
  failure: null as string | null,
  build: { indexSha256: '', immutablePreview: true },
  environment: { browser: 'Chromium', headless: true, throttling: 'none' },
  workflow: {
    onboarding: false, publicEvidence: false, settingsApplied: false, planningTrace: false,
    locationAndLaneSaved: false, scenarioSavedAndRecovered: false, recommendationDraftOpened: false,
    frozenComparison: false, assistantQuestions: 0, evidenceDecisionPersisted: false, serviceReconnect: false,
    compactScenarioReference: false,
  },
  axeScans: [] as Array<{ label: string; violations: number; criticalOrSerious: number }>,
  performance: {} as Record<string, { lcpMs: number | null; cls: number | null; maxObservedEventDurationMs: number | null; domContentLoadedMs: number | null }>,
  screenshots: [] as string[],
  health,
};

await access('dist/index.html');
await mkdir(evidenceDir, { recursive: true });
// Freeze the tested build; a concurrent local rebuild must not remove a loaded
// page's worker/chunk assets partway through a workflow.
await cp('dist', buildDir, { recursive: true });
receipt.build.indexSha256 = createHash('sha256').update(await readFile(join(buildDir, 'index.html'))).digest('hex');
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', buildDir, '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], { cwd: process.cwd(), stdio: 'pipe' });
const api = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/cli.ts', 'serve'], {
  cwd: process.cwd(), stdio: 'pipe',
  // This smoke deliberately verifies unconfigured Model tools. Never inherit a
  // real provider key and accidentally make paid AI calls from a browser test.
  env: { ...process.env, OPENAI_API_KEY: '', HOST: '127.0.0.1', PORT: String(apiPort), FLYWAY_OWNER_TOKEN: token, FLYWAY_DATA_DIR: dataDir, FLYWAY_ALLOWED_ORIGIN: origin },
});
capture(preview, logs.preview); capture(api, logs.api);

let browser: Browser | undefined;
let desktopContext: BrowserContext | undefined;
let tabletContext: BrowserContext | undefined;
try {
  await Promise.all([waitForHttp(origin, logs.preview), waitForHttp(`${apiOrigin}/api/v1/health`, logs.api)]);
  const healthResponse = await fetch(`${apiOrigin}/api/v1/health`, { redirect: 'error' });
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json() as { status?: string }).status, 'ok');

  browser = await chromium.launch({ headless: true });
  desktopContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const page = await desktopContext.newPage();
  page.setDefaultTimeout(10_000);
  await installPerf(page); observeHealth(page, [origin, apiOrigin]);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await onboarding(page); receipt.workflow.onboarding = true;
  await publicWorkspace(page);
  await axe(page, 'public workspace');
  await noOverflow(page, 'desktop public workspace');
  await page.screenshot({ path: `${evidenceDir}/public-desktop.png`, fullPage: true });
  receipt.screenshots.push(`${evidenceDir}/public-desktop.png`);
  await publicEvidence(page); receipt.workflow.publicEvidence = true;
  await connectAndConfigure(page); receipt.workflow.settingsApplied = true;
  await planningTrace(page); receipt.workflow.planningTrace = true;
  await addAndEditLocation(page); receipt.workflow.locationAndLaneSaved = true;
  await scenarioWorkflow(page);
  await copilot(page); receipt.workflow.assistantQuestions = 2;
  await evidenceReview(page); receipt.workflow.evidenceDecisionPersisted = true;
  await durableRecovery(page); receipt.workflow.serviceReconnect = true; receipt.workflow.scenarioSavedAndRecovered = true;
  await responsive(page);
  await page.screenshot({ path: `${evidenceDir}/planning-dark-desktop.png`, fullPage: true });
  receipt.screenshots.push(`${evidenceDir}/planning-dark-desktop.png`);

  tabletContext = await browser.newContext({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 1, hasTouch: true });
  await tabletContext.addInitScript(() => localStorage.setItem('flyway-onboarded', 'true'));
  const tablet = await tabletContext.newPage();
  tablet.setDefaultTimeout(10_000);
  await installPerf(tablet); observeHealth(tablet, [origin, apiOrigin]);
  await tablet.goto(origin, { waitUntil: 'domcontentloaded' });
  await tablet.getByRole('heading', { name: 'U.S. public network' }).waitFor();
  await noOverflow(tablet, 'tablet public workspace');
  await axe(tablet, 'tablet public workspace');
  await tablet.screenshot({ path: `${evidenceDir}/public-tablet.png`, fullPage: true });
  receipt.screenshots.push(`${evidenceDir}/public-tablet.png`);

  await performanceGate(page, 'desktop'); await performanceGate(tablet, 'tablet');
  assert.deepEqual(health.errors, [], `Console errors:\n${health.errors.join('\n')}`);
  assert.deepEqual(health.warnings, [], `Console warnings:\n${health.warnings.join('\n')}`);
  assert.deepEqual(health.pageErrors, [], `Page errors:\n${health.pageErrors.join('\n')}`);
  assert.deepEqual(health.failedRequests, [], `Failed first-party requests:\n${health.failedRequests.join('\n')}`);
  assert.deepEqual(health.serverErrors, [], `HTTP 5xx responses:\n${health.serverErrors.join('\n')}`);
  assert.deepEqual(health.firstPartyClientErrors, [], `First-party HTTP 4xx responses:\n${health.firstPartyClientErrors.join('\n')}`);
  assert.deepEqual(health.accessibilityFailures, [], `Critical/serious accessibility violations:\n${JSON.stringify(health.accessibilityFailures, null, 2)}`);
  receipt.outcome = 'passed';
  console.log('Flyway browser smoke passed: real onboarding, Public/Planning/Compare boundaries, 16 evidenced DC markers, source inspection and Hawaii search, manual U.S. placement, atomic location/lane editing, settings effects, durable scenario recovery, frozen comparison, two grounded assistant questions, evidence review history, dark mode, desktop/tablet layout, axe critical/serious checks, strict browser health, and unthrottled performance budgets. This is a release smoke, not an exhaustive UX audit.');
} catch (error) {
  receipt.outcome = 'failed';
  receipt.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  receipt.completedAt = new Date().toISOString();
  try {
    await writeFile(`${evidenceDir}/browser-smoke-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  } finally {
    await Promise.allSettled([desktopContext?.close(), tabletContext?.close()]);
    await browser?.close();
    await stop(preview); await stop(api);
    await rm(dataDir, { recursive: true, force: true });
    await rm(buildDir, { recursive: true, force: true });
  }
}

async function onboarding(page: Page) {
  await page.getByRole('heading', { name: 'Explore a public-data supply network.' }).waitFor();
  await page.getByRole('checkbox', { name: /independent simulation/i }).check();
  for (const heading of ['Separate public evidence from assumptions.', 'Rank decisions by what matters.']) {
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: heading }).waitFor();
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Your control tower is ready.' }).waitFor();
  await page.getByRole('button', { name: 'Open Control Tower' }).click();
}

async function publicWorkspace(page: Page) {
  await page.getByRole('heading', { name: 'U.S. public network' }).waitFor();
  const tabs = page.getByRole('tablist', { name: 'Network context' });
  assert.equal(await tabs.getByRole('tab', { name: 'Public network' }).getAttribute('aria-selected'), 'true');
  assert.equal(await tabs.getByRole('tab', { name: /Compare scenarios/ }).isDisabled(), true);
  await page.locator('.maplibregl-canvas').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.facility-map-marker').length === 16);
  assert.equal(await page.locator('.facility-map-marker.is-exact').count(), 13);
  assert.equal(await page.locator('.facility-map-marker.is-city-level').count(), 3);
  assert.equal(await page.locator('.real-map-node').count(), 0);
  assert.equal(await page.locator('.real-map-lane').count(), 0);
  const rail = page.getByRole('complementary', { name: 'Public network evidence' });
  const coverage = rail.getByTestId('coverage-summary');
  for (const exact of ['Restaurant points', '3,424', 'Official records indexed', '3,458', 'Evidenced DCs', '16', '13 exact / 3 city']) await coverage.getByText(exact, { exact: true }).waitFor();
  assert.doesNotMatch(text(await page.getByTestId('control-tower').textContent()), /MODELED · NOT COMPANY ACTUALS|Service level|Unmet demand|Total modeled cost|Peak utilization/i);
  await page.getByLabel('Search network').fill('Kapolei');
  assert.match(text(await page.locator('.search-results').getByRole('button').first().textContent()), /Kapolei.*HI/i);
  await page.getByLabel('Search network').fill('');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByText(/public records/).first().waitFor();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
}

async function publicEvidence(page: Page) {
  await page.getByRole('complementary', { name: 'Public network evidence' }).getByRole('button', { name: /Cartersville DC/i }).click();
  const drawer = page.getByRole('dialog', { name: /Cartersville.*public evidence/i });
  await drawer.getByText('Public evidence boundary').waitFor();
  assert.match(text(await drawer.textContent()), /capacity|inventory|routes|allocations|not public/i);
  await axe(page, 'public evidence drawer');
  await page.getByRole('button', { name: 'Close public facility evidence' }).click();
}

async function connectAndConfigure(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByTestId('settings-page');
  await settings.getByRole('button', { name: 'Workspace service' }).click();
  await settings.getByLabel('Service URL').fill(apiOrigin);
  await settings.getByLabel('Owner access token').fill(token);
  const responsePromise = page.waitForResponse((response) => response.url() === `${apiOrigin}/api/v1/workspace` && response.request().method() === 'GET', { timeout: 15_000 });
  await settings.getByRole('button', { name: 'Connect and load workspace' }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, `workspace connection returned ${response.status()}: ${await response.text()}`);
  await waitForConnectionOutcome(page, settings);
  await settings.getByRole('button', { name: 'Model defaults' }).click();
  await settings.getByLabel('Default time grain').selectOption('daily');
  await settings.getByLabel('Service target · %').fill('97.5');
  await settings.getByRole('button', { name: 'Save defaults' }).click();
  await settings.getByText('Saved to the workspace service', { exact: true }).waitFor();
  await axe(page, 'connected settings');
  await settings.getByRole('button', { name: 'Appearance' }).click();
  await settings.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await nav.getByRole('button', { name: 'Control Tower' }).click();
}

async function planningTrace(page: Page) {
  await page.getByRole('tab', { name: 'Planning model' }).click();
  await page.getByRole('heading', { name: 'Network planning' }).waitFor();
  await page.getByRole('complementary', { name: 'Modeled performance' }).waitFor();
  await page.getByText('MODELED · NOT COMPANY ACTUALS', { exact: true }).waitFor();
  await page.getByRole('region', { name: 'Product and period analysis' }).waitFor();
  await page.getByRole('heading', { name: 'Baseline fulfillment' }).waitFor();
  await page.getByLabel('Analysis product').selectOption({ label: 'Chicken' });
  await page.getByLabel('Analysis period').selectOption({ index: 1 });
  await axe(page, 'planning workspace');
}

async function addAndEditLocation(page: Page) {
  await page.getByRole('button', { name: 'Add location' }).click();
  const add = page.getByRole('dialog', { name: 'Add location' });
  await add.getByRole('heading', { name: 'Add modeled location' }).waitFor();
  await add.getByRole('radio', { name: 'Supplier' }).check();
  await add.getByLabel('Location name', { exact: true }).fill('Dallas Packaging Test Supplier');
  await add.getByLabel('Street address', { exact: true }).fill('100 Test Planning Way');
  await add.getByLabel('City', { exact: true }).fill('Dallas');
  await add.locator('label.field').filter({ hasText: /^State/ }).locator('select').selectOption('TX');
  await add.getByLabel('Latitude', { exact: true }).fill('32.7767');
  await add.getByLabel('Longitude', { exact: true }).fill('-96.7970');
  await add.getByRole('checkbox', { name: /I reviewed this position/ }).check();
  await add.getByLabel('Weekly capacity · model units').fill('20000');
  await add.getByLabel('Opening inventory days').fill('7');
  await add.getByRole('button', { name: 'Save location' }).click();
  if (await add.getByText(/State boundaries are still loading/).isVisible().catch(() => false)) {
    await page.waitForTimeout(750); await add.getByRole('button', { name: 'Save location' }).click();
  }
  const panel = page.locator('.model-location-panel').filter({ has: page.getByRole('heading', { name: 'Dallas Packaging Test Supplier' }) });
  await panel.getByRole('heading', { name: 'Record provenance' }).waitFor();
  await panel.getByText('User input', { exact: true }).first().waitFor();
  await panel.getByRole('tab', { name: /Model editor/ }).click();
  await panel.getByLabel('Weekly capacity', { exact: true }).fill('21000');
  await panel.getByLabel('New lane endpoint').selectOption({ label: 'Cartersville Distribution Center' });
  await panel.getByRole('button', { name: 'Add lane' }).click();
  const lane = panel.locator('details').filter({ hasText: 'Cartersville Distribution Center' }).last();
  await lane.locator('summary').click();
  await lane.getByRole('spinbutton', { name: /^Distance/ }).fill('780');
  await lane.getByRole('spinbutton', { name: /^Transit time/ }).fill('12');
  await lane.getByRole('spinbutton', { name: /^Dwell time/ }).fill('1');
  await lane.getByLabel('Weekly capacity', { exact: true }).fill('21000');
  await panel.getByRole('button', { name: 'Save model revision' }).click();
  await panel.getByText(/Saved as workspace revision \d+\./).waitFor();
  await axe(page, 'location and lane editor');
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('button', { name: 'Locations' }).click();
  const locations = page.getByTestId('locations-page');
  const row = locations.getByText('Dallas Packaging Test Supplier', { exact: true }).locator('xpath=ancestor::tr');
  await row.waitFor(); assert.match(text(await row.textContent()), /21,000.*User input/i);
  await row.getByRole('button', { name: /Dallas Packaging Test Supplier/ }).click();
  await page.getByRole('heading', { name: 'Connections' }).waitFor();
  const reopened = page.locator('.model-location-panel');
  await reopened.getByRole('tabpanel', { name: 'Summary' }).getByText('Cartersville Distribution Center', { exact: true }).waitFor();
  await reopened.getByRole('button', { name: 'Close', exact: true }).click();
  await nav.getByRole('button', { name: 'Control Tower' }).click();
}

async function scenarioWorkflow(page: Page) {
  await page.getByRole('button', { name: 'Create scenario' }).click();
  const builder = page.getByRole('dialog', { name: 'Create scenario' });
  await builder.getByRole('heading', { name: 'Stress-test the network' }).waitFor();
  assert.equal(await builder.getByRole('combobox', { name: 'Time grain', exact: true }).inputValue(), 'daily');
  assert.equal(await builder.getByRole('spinbutton', { name: 'Horizon', exact: true }).inputValue(), '14');
  await builder.getByLabel('Scenario name').fill('Cartersville enterprise recovery test');
  await builder.getByLabel('Target location').selectOption({ label: 'Cartersville Distribution Center' });
  await builder.getByRole('button', { name: 'Run scenario' }).click();
  const results = page.getByRole('dialog', { name: 'Scenario results' });
  await results.getByRole('heading', { name: 'Cartersville enterprise recovery test' }).waitFor({ timeout: 120_000 });
  for (const copy of ['Service level', 'Stockout units', 'Landed cost', 'Peak utilization', 'Explainable recovery actions', 'Frozen input']) await results.getByText(copy, { exact: true }).first().waitFor();
  const savedResponse=page.waitForResponse(response=>response.url()===`${apiOrigin}/api/v1/scenarios`&&response.request().method()==='POST');
  await results.getByRole('button', { name: 'Save scenario' }).click();
  const saved=await savedResponse;
  assert.ok(saved.ok());
  const request=saved.request().postDataJSON();
  assert.deepEqual(Object.keys(request).sort(),['expectedWorkspaceRevision','runId']);
  assert.ok(Buffer.byteLength(saved.request().postData()||'')<1024,'Saving a result sends only its identity and revision, not a trace.');
  const savedBody=await saved.json();
  assert.equal(savedBody.scenario.schemaVersion,2);
  assert.equal(savedBody.scenario.resultRef.kind,'service');
  assert.equal('result' in savedBody.scenario,false);
  assert.equal('input' in savedBody.scenario.latestRun,false);
  assert.equal('periodMetrics' in savedBody.scenario.latestRun,false);
  receipt.workflow.compactScenarioReference=true;
  await results.getByRole('button', { name: 'Saved' }).waitFor();
  receipt.workflow.scenarioSavedAndRecovered = true;
  await results.getByText('Loading evaluated responses…', { exact: true }).waitFor({state:'detached'});
  await page.waitForLoadState('networkidle');
  const model = results.getByRole('button', { name: /Model this response/ }).first();
  if (await model.count()) {
    await model.click();
    await builder.getByRole('heading', { name: 'Proposed changes in this draft' }).waitFor();
    receipt.workflow.recommendationDraftOpened = true;
    await builder.getByRole('button', { name: 'Close draft' }).click();
  } else await results.getByRole('button', { name: 'Close scenario results' }).click();
  await page.getByRole('tab', { name: 'Compare scenarios' }).click();
  await page.getByRole('heading', { name: 'Scenario comparison' }).waitFor();
  await page.getByRole('button', { name: /Atlanta Midtown Restaurant, Restaurant/ }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a location' });
  await chooser.waitFor();
  await chooser.getByRole('button', { name: /Cartersville Distribution Center.*Modeled distribution center/i }).click();
  const frozen = page.locator('.model-location-panel');
  await frozen.getByText('Frozen comparison', { exact: true }).waitFor();
  await frozen.getByRole('tab', { name: /Model editor/ }).click();
  assert.equal(await frozen.getByLabel('Location name').isDisabled(), true);
  assert.equal(await frozen.getByRole('button', { name: 'Save model revision' }).isDisabled(), true);
  receipt.workflow.frozenComparison = true;
  await frozen.getByRole('button', { name: 'Close', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('button', { name: 'Scenarios' }).click();
  const scenarios = page.getByTestId('scenarios-page');
  await scenarios.getByText('Cartersville enterprise recovery test', { exact: true }).waitFor();
  await scenarios.getByRole('button', { name: /Cartersville enterprise recovery test/ }).click();
  await results.getByText('Frozen input', { exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  await results.getByRole('button', { name: 'Close scenario results' }).click();
  await nav.getByRole('button', { name: 'Control Tower' }).click();
}

async function copilot(page: Page) {
  await page.getByRole('button', { name: 'Ask Flyway' }).click();
  const dialog = page.getByRole('dialog', { name: 'Flyway copilot' });
  for (const question of ['Which products run out first and on which dates?', 'Show official sources for Mebane.']) {
    await dialog.getByRole('button', { name: question }).click();
    await dialog.getByRole('heading', { name: question }).waitFor();
  }
  assert.equal(await dialog.getByText('Grounded tool result', { exact: true }).count(), 2);
  const answers = await dialog.locator('.copilot-answer > p:not(.assistant-limitation)').allTextContents();
  assert.equal(answers.length, 2); assert.notEqual(text(answers[0]), text(answers[1]));
  await dialog.getByRole('button', { name: 'Close copilot' }).click();
}

async function evidenceReview(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('button', { name: 'Data & Sources' }).click();
  await page.getByRole('heading', { name: 'Evidence operations' }).waitFor();
  await page.getByRole('button', { name: 'Review queue (38)', exact: true }).click();
  const reviewItems = page.getByLabel('Evidence review items').getByRole('button');
  const reviewCount = await reviewItems.count();
  assert.ok(reviewCount > 0, `Evidence review queue is empty or unavailable. Rendered evidence workspace: ${text(await page.getByTestId('sources-page').textContent())}`);
  await reviewItems.first().click();
  await page.getByLabel('Decision reason').fill(evidenceDecisionReason);
  await page.getByLabel('Defer until').fill('2026-12-31');
  await page.getByRole('button', { name: 'Defer', exact: true }).click();
  await page.waitForTimeout(750);
  const postDecision = text(await page.getByTestId('sources-page').textContent());
  assert.match(postDecision, /Review queue \(37\)/, `Deferred evidence decision did not leave the active queue: ${postDecision}`);
  await page.getByRole('button', { name: 'Decision history (1)', exact: true }).click();
  await page.getByText(evidenceDecisionReason, { exact: true }).waitFor();
  await axe(page, 'evidence decision history');
  await nav.getByRole('button', { name: 'Control Tower' }).click();
}

async function durableRecovery(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByTestId('settings-page');
  await settings.getByRole('button', { name: 'Workspace service' }).click();
  await settings.getByLabel('Service URL').fill(apiOrigin);
  await settings.getByLabel('Owner access token').fill(token);
  const responsePromise = page.waitForResponse((response) => response.url() === `${apiOrigin}/api/v1/workspace` && response.request().method() === 'GET', { timeout: 15_000 });
  await settings.getByRole('button', { name: 'Connect and load workspace' }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, `workspace reconnection returned ${response.status()}: ${await response.text()}`);
  await waitForConnectionOutcome(page, settings);
  await nav.getByRole('button', { name: 'Locations' }).click();
  const row = page.getByTestId('locations-page').getByText('Dallas Packaging Test Supplier', { exact: true }).locator('xpath=ancestor::tr');
  await row.waitFor(); assert.match(text(await row.textContent()), /21,000.*User input/i);
  await nav.getByRole('button', { name: 'Scenarios' }).click();
  await page.getByTestId('scenarios-page').getByText('Cartersville enterprise recovery test', { exact: true }).waitFor();
  await nav.getByRole('button', { name: 'Data & Sources' }).click();
  await page.getByRole('button', { name: 'Review queue (37)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Decision history (1)', exact: true }).click();
  await page.getByText(evidenceDecisionReason, { exact: true }).waitFor();
  await nav.getByRole('button', { name: 'Control Tower' }).click();
  await page.getByRole('tab', { name: 'Planning model' }).click();
}

async function responsive(page: Page) {
  for (const size of [{ width: 1280, height: 900 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size); await noOverflow(page, `${size.width}px planning workspace`);
    assert.ok(await page.getByRole('button', { name: 'Create scenario' }).count());
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
}

async function waitForConnectionOutcome(page: Page, settings: ReturnType<Page['getByTestId']>) {
  await page.waitForTimeout(750);
  const saveBar = text(await page.locator('.workspace-save-bar').textContent());
  assert.match(saveBar, /Connected workspace/, `Workspace GET returned 200 but the app did not enter connected state. Status rendered: ${saveBar}; settings rendered: ${text(await settings.textContent())}`);
}

async function axe(page: Page, label: string) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  receipt.axeScans.push({ label, violations: result.violations.length, criticalOrSerious: blocking.length });
  health.accessibilityFailures.push(...blocking.map((v) => ({ label, id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target) })));
}

async function noOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${label} overflows: ${JSON.stringify(dimensions)}`);
}

async function installPerf(page: Page) {
  await page.addInitScript(() => {
    const metrics = { lcp: null as number | null, cls: null as number | null, maxEventDuration: null as number | null };
    Object.defineProperty(window, '__flywayPerf', { value: metrics, configurable: true });
    try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) metrics.lcp = Math.max(metrics.lcp ?? 0, entry.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
    try { metrics.cls = 0; new PerformanceObserver((list) => { for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) if (!entry.hadRecentInput) metrics.cls = (metrics.cls ?? 0) + (entry.value || 0); }).observe({ type: 'layout-shift', buffered: true }); } catch { metrics.cls = null; }
    try { metrics.maxEventDuration = 0; new PerformanceObserver((list) => { for (const entry of list.getEntries() as Array<PerformanceEntry & { duration?: number }>) metrics.maxEventDuration = Math.max(metrics.maxEventDuration ?? 0, entry.duration || 0); }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit); } catch { metrics.maxEventDuration = null; }
  });
}

async function performanceGate(page: Page, label: string) {
  const metric = await page.evaluate(() => {
    const observed = (window as unknown as { __flywayPerf?: { lcp: number | null; cls: number | null; maxEventDuration: number | null } }).__flywayPerf || { lcp: null, cls: null, maxEventDuration: null };
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return { ...observed, dcl: navigation?.domContentLoadedEventEnd || null };
  });
  receipt.performance[label] = { lcpMs: metric.lcp, cls: metric.cls, maxObservedEventDurationMs: metric.maxEventDuration, domContentLoadedMs: metric.dcl };
  if (metric.lcp !== null) assert.ok(metric.lcp < 4000, `${label} unthrottled LCP ${metric.lcp}ms`);
  if (metric.cls !== null) assert.ok(metric.cls < .25, `${label} CLS ${metric.cls}`);
  if (metric.maxEventDuration !== null) assert.ok(metric.maxEventDuration < 500, `${label} unthrottled maximum observed event duration ${metric.maxEventDuration}ms`);
  if (metric.dcl !== null) assert.ok(metric.dcl < 5000, `${label} DOMContentLoaded ${metric.dcl}ms`);
}

function observeHealth(page: Page, firstParty: string[]) {
  page.on('console', (message) => {
    if (message.type() === 'error') health.errors.push(message.text());
    if (message.type() === 'warning') {
      if (/^\[\.WebGL-.*\]GL Driver Message/.test(message.text())) health.browserDriverDiagnostics.push(message.text());
      health.warnings.push(message.text());
    }
  });
  page.on('pageerror', (error) => health.pageErrors.push(error.message));
  page.on('requestfailed', (request) => { if (firstParty.some((item) => request.url().startsWith(item))) health.failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`); });
  page.on('response', (response) => { if (response.status() >= 500) health.serverErrors.push(`${response.status()} ${response.url()}`); else if (response.status() >= 400 && firstParty.some((item) => response.url().startsWith(item))) health.firstPartyClientErrors.push(`${response.status()} ${response.url()}`); });
}

function text(value: string | null | undefined) { return (value || '').replace(/\s+/g, ' ').trim(); }
function capture(process: ChildProcess, log: string[]) { process.stdout?.on('data', (chunk: Buffer) => log.push(chunk.toString())); process.stderr?.on('data', (chunk: Buffer) => log.push(chunk.toString())); }
async function stop(process: ChildProcess) { if (process.exitCode != null || process.killed) return; process.kill('SIGTERM'); await Promise.race([new Promise<void>((resolve) => process.once('exit', () => resolve())), delay(2000)]); if (process.exitCode == null) process.kill('SIGKILL'); }
async function availablePort() { return new Promise<number>((resolve, reject) => { const probe = createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => { const address = probe.address(); if (!address || typeof address === 'string') return reject(new Error('Could not allocate port.')); probe.close(() => resolve(address.port)); }); }); }
async function waitForHttp(url: string, log: string[]) { for (let attempt = 0; attempt < 120; attempt++) { try { const response = await fetch(url); if (response.ok) return; } catch {} await delay(100); } throw new Error(`Service did not start at ${url}.\n${log.join('')}`); }
