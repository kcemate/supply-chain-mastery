import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const port = await new Promise<number>((resolve, reject) => {
  const probe = net.createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => {
    const address = probe.address(); const selected = typeof address === 'object' && address ? address.port : 0;
    probe.close((error) => error ? reject(error) : resolve(selected));
  });
});
const server = spawn('node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = ''; server.stdout.on('data', (chunk) => { serverOutput += String(chunk); }); server.stderr.on('data', (chunk) => { serverOutput += String(chunk); });
const harnessUrl = `http://127.0.0.1:${port}/tests/model-location-panel-harness.html`;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try { if ((await fetch(harnessUrl)).ok) break; } catch { /* server is starting */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (attempt === 79) throw new Error(`Vite harness did not start:\n${serverOutput}`);
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(harnessUrl);
  await page.getByRole('heading', { name: 'Capacity and inventory' }).waitFor();
  assert.ok(await page.getByText('Sample estimate', { exact: true }).count(), 'public identity evidence must not confer verified status on unsupported capacity or inventory');
  await page.getByRole('tab', { name: /Model editor/ }).click();
  const name = page.getByLabel('Location name');
  await name.fill('');
  await page.getByRole('button', { name: 'Save model revision' }).click();
  await assert.rejects(() => page.waitForFunction(() => window.__modelPanelAttempts === 1, null, { timeout: 300 }), /Timeout/);
  await assert.doesNotReject(() => page.getByText('Enter a location name.').waitFor());
  assert.equal(await name.inputValue(), '', 'client validation retains the invalid draft');
  await name.fill('Cartersville Planning DC');
  await page.getByLabel('New lane endpoint').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Add lane' }).click();
  await page.getByRole('button', { name: 'Save model revision' }).click();
  await page.getByText('Storage is temporarily unavailable. Draft retained.').waitFor();
  assert.equal(await name.inputValue(), 'Cartersville Planning DC');
  await page.keyboard.press('Escape');
  await page.getByText('Discard unsaved changes?').waitFor();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  assert.equal(await name.inputValue(), 'Cartersville Planning DC', 'Escape routes through the draft-protection prompt');
  await page.getByRole('button', { name: 'Save model revision' }).click();
  await page.getByText('A newer workspace revision exists. Draft retained.').waitFor();
  assert.equal(await name.inputValue(), 'Cartersville Planning DC');
  await page.getByRole('button', { name: 'Save model revision' }).click();
  await page.getByText('Saved as workspace revision 8.').waitFor();
  const saved = await page.evaluate(() => window.__modelPanelSave);
  assert.equal(saved?.expectedRevision, 7);
  assert.equal(saved?.location.name, 'Cartersville Planning DC');
  assert.equal(saved?.laneChanges.additions.length, 1, 'location and lane changes share one atomic request');
  assert.equal(errors.length, 0, errors.join('\n'));
  const axe = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(axe.violations.filter((item) => ['critical', 'serious'].includes(item.impact || '')), []);

  const frozenContext = await browser.newContext({ viewport: { width: 820, height: 900 } });
  const frozen = await frozenContext.newPage();
  await frozen.goto(`${harnessUrl}?readonly=1`);
  await frozen.getByRole('tab', { name: /Model editor/ }).click();
  assert.equal(await frozen.getByLabel('Location name').isDisabled(), true);
  assert.equal(await frozen.getByRole('button', { name: 'Save model revision' }).isDisabled(), true);
  await frozenContext.close();
  await context.close();
  console.log('Model location panel browser passed: validation, retained drafts across storage and revision failures, atomic lane + location save, frozen read-only state, and axe serious/critical=0.');
} finally {
  await browser.close(); server.kill('SIGTERM');
}
