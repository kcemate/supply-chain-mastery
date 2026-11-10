import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { initialLanes, initialLocations } from '../src/flywayData';
import { syntheticNetwork } from '../src/syntheticNetwork';

const directory = 'tasks/browser-evidence';
const port = await new Promise<number>((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') return reject(new Error('Could not allocate a local port.'));
    probe.close(() => resolve(address.port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
const log: string[] = [];
server.stdout?.on('data', value => log.push(String(value)));
server.stderr?.on('data', value => log.push(String(value)));

const health = { errors: [] as string[], warnings: [] as string[], pageErrors: [] as string[], failedRequests: [] as string[], failedResponses: [] as string[] };
const interactions: string[] = [];
const screenshots: string[] = [];
const scans: Array<{ label: string; violations: number; blocking: number }> = [];
const totalLocations = initialLocations.length + syntheticNetwork.locations.length;
const totalLanes = initialLanes.length + syntheticNetwork.lanes.length;
const hub = syntheticNetwork.locations.find(location => location.id === syntheticNetwork.scenarioHubId)!;
const scenarioName = 'Synthetic hub outage verification';
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let workflowPassed = false;
try {
  await mkdir(directory, { recursive: true });
  let ready = false;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    try { ready = (await fetch(origin)).ok; } catch { /* local Vite still starting */ }
    if (!ready) await delay(100);
  }
  assert.ok(ready, log.join(''));
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('console', message => {
    if (message.type() === 'error') health.errors.push(message.text());
    if (message.type() === 'warning') health.warnings.push(message.text());
  });
  page.on('pageerror', error => health.pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (request.url().startsWith(origin)) health.failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`);
  });
  page.on('response', response => {
    if (response.url().startsWith(origin) && response.status() >= 400) health.failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript(() => localStorage.setItem('flyway-onboarded', 'true'));
  const snapshot = async (suffix: string) => {
    const path = `${directory}/synthetic-network-${suffix}.png`;
    await page.screenshot({ path, animations: 'disabled' });
    screenshots.push(path);
  };
  const scan = async (label: string) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const blocking = results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
    scans.push({ label, violations: results.violations.length, blocking: blocking.length });
    assert.deepEqual(blocking.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), []);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    assert.ok(fits, `${label} overflows the viewport`);
  };

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const evidenceMap = page.getByLabel(/Interactive U.S. evidence atlas with 3458 official location pages, 16 publicly evidenced/);
  await evidenceMap.waitFor();
  await page.getByRole('button', { name: /Cartersville Distribution Center, publicly evidenced/ }).waitFor();
  const coverage = await page.getByTestId('coverage-summary').innerText();
  assert.equal(await page.getByRole('region', { name: 'Synthetic network expansion' }).count(), 0);
  await page.getByRole('tab', { name: 'Planning model' }).click();
  const panel = page.getByRole('region', { name: 'Synthetic network expansion' });
  await panel.getByText('Fictional data', { exact: true }).waitFor();
  await page.getByLabel(new RegExp(`planning map with ${initialLocations.length} modeled locations`)).waitFor();
  interactions.push('Opened the public atlas and switched to the separate Planning model.');
  await snapshot('before-desktop');
  const add = panel.getByRole('button', { name: 'Add synthetic network', exact: true });
  await add.focus();
  await add.press('Enter');
  await panel.getByText('Included in this planning model.', { exact: false }).waitFor();
  await page.getByLabel(new RegExp(`planning map with ${totalLocations} modeled locations`)).waitFor();
  await page.getByText(new RegExp(`Sample assumptions · ${totalLocations} locations · ${totalLanes} lanes`)).waitFor();
  await page.getByRole('complementary', { name: 'Modeled performance' }).waitFor();
  interactions.push('Added the expansion by keyboard, verified exact map counts, and waited for a calculated baseline.');
  await snapshot('planning-desktop');
  await scan('expanded desktop planning');

  const restaurant = syntheticNetwork.locations.find(location => location.assignedDcId === hub.id)!;
  const map = page.getByTestId('network-map');
  const marker = map.getByRole('button', { name: `${restaurant.name}, Restaurant, active`, exact: true });
  await marker.waitFor();
  assert.deepEqual(await marker.evaluate(element => ({ symbol: getComputedStyle(element, '::before').width, hitArea: element.getBoundingClientRect().width })), { symbol: '8px', hitArea: 44 });
  await marker.focus();
  await marker.press('Enter');
  const nearby = page.getByRole('dialog', { name: 'Choose a location' });
  await nearby.getByRole('button', { name: new RegExp(restaurant.name) }).click();
  await page.getByRole('heading', { name: restaurant.name, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close location panel' }).click();
  interactions.push('Used a compact overview marker with its full keyboard target to select an overlapping sample restaurant.');

  await panel.getByRole('button', { name: 'Inspect sample hub' }).click();
  await page.getByRole('heading', { name: hub.name, exact: true }).waitFor();
  const hubPanel = page.locator('.model-location-panel');
  await hubPanel.getByText('Sample estimate', { exact: true }).first().waitFor();
  await hubPanel.getByRole('button', { name: 'Create scenario' }).click();
  const builder = page.getByRole('dialog', { name: 'Create scenario' });
  await builder.waitFor();
  assert.equal(await builder.getByLabel('Target location').inputValue(), hub.id);
  await builder.getByLabel('Scenario name').fill(scenarioName);
  await builder.getByLabel('Time grain').selectOption('daily');
  await builder.getByRole('spinbutton', { name: 'Horizon', exact: true }).fill('7');
  await builder.getByLabel('Start date').fill('2026-11-09');
  await builder.getByRole('button', { name: 'Run scenario' }).click();
  const result = page.getByRole('dialog', { name: 'Scenario results' });
  await result.getByRole('heading', { name: scenarioName }).waitFor({ timeout: 90_000 });
  await result.getByText('Frozen input', { exact: true }).waitFor();
  const stockoutDelta = await result.locator('.comparison-grid > div').filter({ hasText: 'Stockout units' }).locator('small').innerText();
  assert.ok(Number(stockoutDelta.replace(/[,\s+]/g, '')) > 0, `Expected a shortage from the hub outage; received ${stockoutDelta}`);
  await result.getByRole('button', { name: 'Save scenario' }).click();
  await result.getByRole('button', { name: 'Saved', exact: true }).waitFor();
  interactions.push('Opened the sample hub, ran a real outage with higher shortages, and saved the frozen result.');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await evidenceMap.waitFor();
  await page.getByRole('button', { name: /Cartersville Distribution Center, publicly evidenced/ }).waitFor();
  assert.equal(await page.getByTestId('coverage-summary').innerText(), coverage);
  assert.equal(await page.getByRole('region', { name: 'Synthetic network expansion' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: hub.name, exact: true }).count(), 0);
  interactions.push('Reloaded and proved synthetic sites do not enter the public atlas.');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('button', { name: 'Scenarios', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(scenarioName) }).waitFor();
  await nav.getByRole('button', { name: 'Locations', exact: true }).click();
  await panel.getByRole('button', { name: 'Inspect sample hub' }).waitFor();
  assert.equal(await panel.getByRole('button', { name: 'Add synthetic network', exact: true }).count(), 0);
  await page.getByText(`${totalLocations} of ${totalLocations} modeled locations`, { exact: true }).waitFor();
  await page.getByLabel('Search locations').fill(hub.name);
  await page.getByText(`1 of ${totalLocations} modeled locations`, { exact: true }).waitFor();
  await page.getByRole('row').filter({ hasText: hub.name }).getByText('Sample estimate', { exact: true }).waitFor();
  interactions.push('Verified the saved scenario and expansion persisted, duplicate add is unavailable, and the registry identifies sample evidence.');
  await page.getByRole('button', { name: 'Use dark mode' }).click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await snapshot('locations-tablet-dark');
  await scan('filtered tablet dark registry');
  workflowPassed = true;
  console.log(`Synthetic expansion workflow passed: ${totalLocations} locations, ${totalLanes} lanes; outage shortage delta ${stockoutDelta}; ${scans.length} axe scans.`);
  assert.deepEqual(health, { errors: [], warnings: [], pageErrors: [], failedRequests: [], failedResponses: [] }, 'Strict browser health gate');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await writeFile(`${directory}/synthetic-network-browser-receipt.json`, JSON.stringify({ workflowPassed, totalLocations, totalLanes, interactions, screenshots, scans, health }, null, 2));
}
