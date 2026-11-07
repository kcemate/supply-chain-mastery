import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const port = await new Promise<number>((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const selected = typeof address === 'object' && address ? address.port : 0;
    server.close((error) => error ? reject(error) : resolve(selected));
  });
});
const server = spawn('node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += String(chunk); });
server.stderr.on('data', (chunk) => { serverOutput += String(chunk); });
const url = `http://127.0.0.1:${port}/tests/decision-intelligence-harness.html`;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try { if ((await fetch(url)).ok) break; } catch { /* server is starting */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (attempt === 79) throw new Error(`Vite harness did not start:\n${serverOutput}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByRole('heading', { name: 'Decision intelligence' }).waitFor();
  await page.getByRole('article').getByText('A 7% capacity increase improves service but exceeds the automatic-change limit.').waitFor();
  await page.screenshot({ path: 'tasks/browser-evidence/decision-intelligence-desktop.png', fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: 'tasks/browser-evidence/decision-intelligence-tablet-dark.png', fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Approve and apply' }).click();
  await page.getByText('Add a reason so this decision remains auditable.').waitFor();
  await page.getByLabel('Decision reason').fill('Capacity provides the best measured service tradeoff for this planning cycle.');
  await page.getByRole('button', { name: 'Approve and apply' }).click();
  await page.getByText(/approve:decision-capacity:Capacity provides/).waitFor();
  await page.getByRole('button', { name: /Decision history/ }).click();
  await page.getByRole('heading', { name: 'Increase Atlanta modeled capacity' }).waitFor();
  await page.getByRole('button', { name: 'Open run' }).click();
  await page.getByText('open:run-capacity-1').waitFor();
  await page.getByRole('button', { name: 'Ask copilot to explain this decision' }).click();
  await page.getByText(/ask:Explain decision decision-capacity/).waitFor();
  await page.getByRole('button', { name: 'Autonomy policy' }).click();
  const capacity = page.getByLabel('Maximum capacity increase');
  await capacity.fill('4');
  await page.getByRole('button', { name: 'Save policy' }).click();
  await page.getByText('policy-saved').waitFor();
  const desktopAxe = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(desktopAxe.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact || '')), []);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('button', { name: /Human queue/ }).click();
  await page.getByPlaceholder('Search decisions').fill('nothing matches');
  await page.getByText('No matching decisions').waitFor();
  const tabletAxe = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(tabletAxe.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact || '')), []);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Decision intelligence browser passed: human approval reason enforced, decision/history evidence actions worked, policy persisted, search empty state worked, and desktop/tablet dark mode had zero serious or critical axe violations.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
