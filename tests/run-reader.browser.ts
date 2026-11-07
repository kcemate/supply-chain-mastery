import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium, type Page } from 'playwright';

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
  try { if ((await fetch(url)).ok) break; } catch { /* Vite is still starting. */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (attempt === 79) throw new Error(`Vite did not start:\n${serverOutput}`);
}

async function waitForCount(page: Page, kind: 'scopes' | 'impacts', expected: number) {
  await page.waitForFunction(({ requestKind, count }: { requestKind: 'scopes' | 'impacts'; count: number }) => window.runReaderHarness?.counts()[requestKind] === count, { requestKind: kind, count: expected });
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${url}/tests/run-reader-harness.html`);
  await page.waitForFunction(() => Boolean(window.runReaderHarness));
  await waitForCount(page, 'scopes', 1);
  await waitForCount(page, 'impacts', 1);

  assert.deepEqual(await page.evaluate(() => window.runReaderHarness!.scopeRequest(0)), {
    readerId: 'A',
    cursor: undefined,
    query: { product: 'all', period: 0, sort: 'impact', cursor: undefined, limit: 40 },
  });
  assert.deepEqual(await page.evaluate(() => window.runReaderHarness!.impactRequest(0)), { readerId: 'A', cursor: undefined });

  await page.evaluate(() => {
    window.runReaderHarness!.resolveScope(0, 1, 'scope-A-page-2');
    window.runReaderHarness!.resolveImpact(0, 1, 'impact-A-page-2');
  });
  await page.getByTestId('scope-value').getByText('A scope 1|1').waitFor();
  await page.getByTestId('page-value').getByText('A impact 1').waitFor();

  await page.getByRole('button', { name: 'Scope next' }).click();
  await page.getByRole('button', { name: 'Impact next' }).click();
  await waitForCount(page, 'scopes', 2);
  await waitForCount(page, 'impacts', 2);
  assert.equal((await page.evaluate(() => window.runReaderHarness!.scopeRequest(1))).cursor, 'scope-A-page-2');
  assert.equal((await page.evaluate(() => window.runReaderHarness!.impactRequest(1))).cursor, 'impact-A-page-2');
  await page.getByTestId('scope-page').getByText('2').waitFor();
  await page.getByTestId('page-number').getByText('2').waitFor();

  // Changing the scope while page two is pending must reset to page one. The
  // fake reader deliberately resolves after abort so the hook itself must
  // reject the stale result.
  await page.getByLabel('Product').selectOption('Chicken');
  await waitForCount(page, 'scopes', 3);
  const chicken = await page.evaluate(() => window.runReaderHarness!.scopeRequest(2));
  assert.equal(chicken.readerId, 'A');
  assert.equal(chicken.cursor, undefined);
  assert.equal(chicken.query?.product, 'Chicken');
  assert.equal(await page.getByTestId('scope-page').textContent(), '1');
  await page.evaluate(() => window.runReaderHarness!.resolveScope(1, 99));
  await page.waitForTimeout(25);
  assert.equal(await page.getByTestId('scope-value').textContent(), '');
  assert.equal(await page.getByTestId('scope-loading').textContent(), 'loading');
  await page.evaluate(() => window.runReaderHarness!.resolveScope(2, 2, 'scope-chicken-page-2'));
  await page.getByTestId('scope-value').getByText('A scope 2|2').waitFor();

  // A failed second page remains on that page and a retry reissues the exact
  // same bounded request before replacing the visible error.
  await page.getByRole('button', { name: 'Scope next' }).click();
  await waitForCount(page, 'scopes', 4);
  assert.equal((await page.evaluate(() => window.runReaderHarness!.scopeRequest(3))).cursor, 'scope-chicken-page-2');
  await page.evaluate(() => window.runReaderHarness!.rejectScope(3, 'temporary scope failure'));
  await page.getByTestId('scope-error').getByText('temporary scope failure').waitFor();
  await page.getByRole('button', { name: 'Scope retry' }).click();
  await waitForCount(page, 'scopes', 5);
  assert.deepEqual(await page.evaluate(() => window.runReaderHarness!.scopeRequest(4)), await page.evaluate(() => window.runReaderHarness!.scopeRequest(3)));
  await page.evaluate(() => window.runReaderHarness!.resolveScope(4, 4));
  await page.getByTestId('scope-value').getByText('A scope 4|4').waitFor();
  assert.equal(await page.getByTestId('scope-error').textContent(), '');

  // Reader replacement is a second identity boundary. Pending A responses may
  // settle, but cannot populate B's value, error, or page navigation.
  await page.getByLabel('Reader').selectOption('B');
  await waitForCount(page, 'scopes', 6);
  await waitForCount(page, 'impacts', 3);
  assert.equal((await page.evaluate(() => window.runReaderHarness!.scopeRequest(5))).readerId, 'B');
  assert.equal((await page.evaluate(() => window.runReaderHarness!.scopeRequest(5))).cursor, undefined);
  assert.deepEqual(await page.evaluate(() => window.runReaderHarness!.impactRequest(2)), { readerId: 'B', cursor: undefined });
  assert.equal(await page.getByTestId('scope-page').textContent(), '1');
  assert.equal(await page.getByTestId('page-number').textContent(), '1');
  await page.evaluate(() => window.runReaderHarness!.resolveImpact(1, 98));
  await page.waitForTimeout(25);
  assert.equal(await page.getByTestId('page-value').textContent(), '');
  assert.equal(await page.getByTestId('page-loading').textContent(), 'loading');
  await page.evaluate(() => {
    window.runReaderHarness!.resolveScope(5, 5);
    window.runReaderHarness!.resolveImpact(2, 5, 'impact-B-page-2');
  });
  await page.getByTestId('scope-value').getByText('B scope 5|5').waitFor();
  await page.getByTestId('page-value').getByText('B impact 5').waitFor();

  // Page retry is independently bounded and must not erase reader identity.
  await page.getByRole('button', { name: 'Impact next' }).click();
  await waitForCount(page, 'impacts', 4);
  assert.deepEqual(await page.evaluate(() => window.runReaderHarness!.impactRequest(3)), { readerId: 'B', cursor: 'impact-B-page-2' });
  await page.evaluate(() => window.runReaderHarness!.rejectImpact(3, 'temporary impact failure'));
  await page.getByTestId('page-error').getByText('temporary impact failure').waitFor();
  await page.getByRole('button', { name: 'Impact retry' }).click();
  await waitForCount(page, 'impacts', 5);
  assert.deepEqual(await page.evaluate(() => window.runReaderHarness!.impactRequest(4)), await page.evaluate(() => window.runReaderHarness!.impactRequest(3)));
  await page.evaluate(() => window.runReaderHarness!.resolveImpact(4, 6));
  await page.getByTestId('page-value').getByText('B impact 6').waitFor();
  assert.equal(await page.getByTestId('page-error').textContent(), '');

  // Period changes are part of the scope key and reset an exhausted page back
  // to an un-cursored request.
  await page.getByLabel('Period').fill('3');
  await waitForCount(page, 'scopes', 7);
  const periodThree = await page.evaluate(() => window.runReaderHarness!.scopeRequest(6));
  assert.equal(periodThree.cursor, undefined);
  assert.equal(periodThree.query?.product, 'Chicken');
  assert.equal(periodThree.query?.period, 3);
  assert.equal(await page.getByTestId('scope-page').textContent(), '1');
  await page.evaluate(() => window.runReaderHarness!.resolveScope(6, 7));
  await page.getByTestId('scope-value').getByText('B scope 7|7').waitFor();

  assert.deepEqual(pageErrors, []);
  console.log('Run reader browser QA passed: late aborted responses are ignored across filters and readers, cursor state resets correctly, and failed scope/page requests retry without losing identity.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
