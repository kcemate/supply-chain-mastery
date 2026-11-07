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
const url = `http://127.0.0.1:${port}/tests/evidence-workbench-harness.html`;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try { if ((await fetch(url)).ok) break; } catch { /* server is starting */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (attempt === 79) throw new Error(`Vite harness did not start:\n${serverOutput}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(url);
  await page.getByRole('heading', { name: 'Evidence operations' }).waitFor();
  await page.getByRole('button', { name: 'Review queue (39)' }).click();

  const search = page.getByPlaceholder('Search entity, field, or source');
  await search.fill('official-');
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Accept', exact: true }).isDisabled(), true, 'unsupported legacy coordinates stay blocked');

  await search.fill('fixture:facility');
  await page.getByRole('button', { name: /fixture:facility/ }).click();
  assert.equal(await page.getByRole('button', { name: 'Accept', exact: true }).isEnabled(), true, 'artifact-backed exact coordinates can be accepted');
  const decisionReason = page.getByLabel('Decision reason');
  await decisionReason.fill('Fixture fields match the preserved official artifact');
  const accept = page.getByRole('button', { name: 'Accept', exact: true });
  await accept.click();
  await page.getByRole('button', { name: 'Saving…', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(), true, 'duplicate review actions are blocked while persistence is pending');
  await page.getByText('The evidence decision was not saved. Your selection and reason are retained; review the storage notice and retry.').waitFor();
  assert.equal(await decisionReason.inputValue(), 'Fixture fields match the preserved official artifact');
  await page.getByText(/No publication created · Save attempts 1/).waitFor();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.getByText(/^Published publication:fixture-facilities:/).waitFor();
  await page.getByRole('button', { name: 'Decision history (1)' }).click();
  await page.getByText('Fixture fields match the preserved official artifact').waitFor();
  await page.getByText('browser-reviewer').waitFor();

  const accessibility = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(accessibility.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact || '')), []);
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('Evidence workbench browser passed: unsupported coordinate acceptance blocked, artifact-backed candidate accepted, publication callback emitted, immutable decision history rendered, and zero serious/critical axe violations.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
