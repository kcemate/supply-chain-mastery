import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import playwright from 'playwright';

const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: 'pipe',
});

const consoleErrors: string[] = [];
const failedRequests: string[] = [];

try {
  await waitForServer(origin);
  await mkdir('tasks', { recursive: true });

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await context.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(`${request.failure()?.errorText}: ${request.url()}`));

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForSelector('svg.ontology-svg');

  assert.equal(await page.locator('canvas').count(), 0, 'The live scene must not mount a canvas renderer.');
  assert.equal(await page.locator('svg.ontology-svg').count(), 1, 'The ontology scene should render as SVG.');
  assert.equal(await page.locator('svg text.scene-title').textContent(), 'Ontology System', 'The title should render as SVG text.');
  assert.equal(await page.locator('svg text.svg-editable-text').count() > 30, true, 'Most editable labels should render as SVG text.');
  assert.equal(await page.locator('svg foreignObject').count(), 0, 'At rest the scene should not use foreignObject label boxes.');
  assert.equal(/palantir|foundry/i.test(await page.content()), false, 'Vendor branding should not appear in rendered markup.');
  const defaultChrome = await page.evaluate(() => {
    const topbar = document.querySelector('.ontology-topbar');
    const minimap = document.querySelector('.minimap');
    const zoomTools = document.querySelector('.zoom-tools');
    return {
      topbarOpacity: topbar ? window.getComputedStyle(topbar).opacity : '',
      minimapDisplay: minimap ? window.getComputedStyle(minimap).display : '',
      zoomDisplay: zoomTools ? window.getComputedStyle(zoomTools).display : '',
    };
  });
  assert.equal(defaultChrome.topbarOpacity, '0', 'The default visual state should hide editor chrome.');
  assert.equal(defaultChrome.minimapDisplay, 'none', 'The minimap should not alter the default diagram view.');
  assert.equal(defaultChrome.zoomDisplay, 'none', 'Zoom controls should not alter the default diagram view.');

  await page.getByLabel('Edit Ontology System').click();
  await page.waitForSelector('svg foreignObject input.scene-title');
  await page.locator('input.scene-title').fill('Ontology System Live');
  assert.equal(await page.locator('svg foreignObject').count(), 1, 'An input overlay may use foreignObject only while editing.');
  await page.locator('input.scene-title').press('Enter');
  await expectSvgText(page, 'Ontology System Live');
  await page.waitForSelector('svg foreignObject', { state: 'detached' });
  assert.equal(await page.locator('svg foreignObject').count(), 0, 'Committing an edit should return the label to SVG text.');

  await page.keyboard.press('Control+Z');
  await expectSvgText(page, 'Ontology System');

  assert.equal(await page.getByRole('button', { name: /Status positive/i }).count(), 0, 'Status dots should be fixed, not editable buttons.');
  assert.equal(await page.locator('svg .status-dot-svg').count(), 6, 'The fixed data-card status dots should render in SVG.');
  assert.equal(await page.locator('g[aria-label="Edit 12000kWh"]').count(), 0, 'Data-card values should not be editable labels.');

  await page.getByLabel('Edit Status').click();
  await page.locator('input.card-field').fill('State');
  await page.locator('input.card-field').press('Enter');
  await expectSvgText(page, 'State');

  await page.getByRole('button', { name: 'Start presentation' }).click();
  await page.waitForSelector('.scene-viewport.is-presenting');
  assert.equal(await page.locator('.beat-dots button').count(), 4, 'Presentation mode should expose four quiet beat dots.');
  await page.locator('.beat-dots button').nth(2).click();
  await page.keyboard.press('Escape');
  await page.waitForSelector('.scene-viewport.is-presenting', { state: 'detached' });

  await page.getByRole('button', { name: 'Copy link' }).click();
  const readonlyHref = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(readonlyHref, /#scene=.*readonly=1/, 'Copy link should write a read-only scene URL.');
  await page.goto(readonlyHref, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('g[aria-label*="Open a copy to edit."]').count() > 0, true, 'Shared links should open text labels in read-only mode.');
  await page.locator('g[aria-label="Ontology System. Open a copy to edit."]').click();
  assert.equal(await page.locator('input.scene-title').count(), 0, 'Read-only title text should not open an input.');
  await page.getByRole('button', { name: /Open a copy to edit/i }).click();
  await page.getByLabel('Edit Ontology System').click();
  await page.waitForSelector('input.scene-title');
  await page.keyboard.press('Escape');

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export PNG' }).click(),
  ]).then(([downloadEvent]) => downloadEvent);
  assert.match(download.suggestedFilename(), /\.png$/);

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForSelector('svg.ontology-svg');
  assert.equal(await page.locator('svg foreignObject').count(), 0, 'The clean default view should render without edit overlays.');
  await page.screenshot({ path: 'tasks/ontology-scene-smoke.png', fullPage: false });

  await page.setViewportSize({ width: 627, height: 760 });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForSelector('svg.ontology-svg');
  assert.equal(await page.locator('svg text.scene-title').textContent(), 'Ontology System', 'The narrow view should still render the source title.');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, 'The narrow in-app browser pane should not overflow horizontally.');
  await page.screenshot({ path: 'tasks/ontology-scene-narrow-smoke.png', fullPage: false });

  assert.deepEqual(consoleErrors, [], 'Browser console should stay clean.');
  assert.deepEqual(failedRequests, [], 'No browser resources should fail to load.');

  await context.close();
  await browser.close();
  console.log('Ontology browser smoke passed: SVG text labels, edit/undo, fixed values/status dots, hidden default chrome, presentation beats, read-only share, editable copy, PNG export, narrow pane, no canvas renderer, no vendor text, and no console errors.');
} finally {
  server.kill('SIGTERM');
}

async function waitForServer(url: string) {
  const timeoutAt = Date.now() + 30_000;
  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Vite dev server did not become ready at ${url}.`);
}

async function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const tester = createServer();
    tester.once('error', reject);
    tester.listen(0, '127.0.0.1', () => {
      const address = tester.address();
      const port = typeof address === 'object' && address ? address.port : 4174;
      tester.close(() => resolve(port));
    });
  });
}

async function expectSvgText(page: playwright.Page, text: string) {
  await page.waitForFunction((expected) => [...document.querySelectorAll('svg text')].some((node) => node.textContent === expected), text);
}
