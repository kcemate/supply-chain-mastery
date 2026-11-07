import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

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
const url = `http://127.0.0.1:${port}/tests/flyway-map-overlap-harness.html`;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try { if ((await fetch(url)).ok) break; } catch { /* server is starting */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (attempt === 79) throw new Error(`Vite harness did not start:\n${serverOutput}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(url);
  await page.locator('.maplibregl-canvas').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.real-map-node').length === 2);

  const atlanta = page.getByRole('button', { name: /Atlanta Midtown Restaurant, Restaurant/ });
  const cartersville = page.getByRole('button', { name: /Cartersville Distribution Center, Distribution center/ });
  const atlantaBox = await atlanta.boundingBox();
  const cartersvilleBox = await cartersville.boundingBox();
  assert.ok(atlantaBox && cartersvilleBox);
  assert.ok(Math.abs(atlantaBox.x - cartersvilleBox.x) < 44 && Math.abs(atlantaBox.y - cartersvilleBox.y) < 44, `fixture markers must overlap at national zoom: ${JSON.stringify({ atlantaBox, cartersvilleBox })}`);

  await atlanta.click();
  const chooser = page.getByRole('dialog', { name: 'Choose a location' });
  await chooser.waitFor();
  await chooser.getByRole('button', { name: /Cartersville Distribution Center.*Modeled distribution center.*operating assumptions/ }).click();
  await page.getByText('Selected dc-cartersville · 1 selections').waitFor();

  await cartersville.click();
  await chooser.waitFor();
  await chooser.getByRole('button', { name: /Atlanta Midtown Restaurant.*Modeled restaurant.*operating assumptions/ }).click();
  await page.getByText('Selected rest-atlanta-midtown · 2 selections').waitFor();

  await atlanta.click();
  await chooser.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await chooser.count(), 0, 'Escape closes the nonmodal chooser');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Atlanta Midtown Restaurant'));
  assert.equal(await atlanta.evaluate((element) => document.activeElement === element), true, 'focus returns to the marker that opened the chooser');

  const accessibility = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(accessibility.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact || '')), []);
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('Flyway map overlap browser passed: coincident modeled markers expose a scoped chooser, every peer remains reachable after selection, Escape restores focus, and axe has no serious/critical violations.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
