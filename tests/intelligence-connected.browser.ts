import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer as createProbe } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { initialLocations, initialLanes } from '../src/flywayData';
import { FilePlatformStore } from '../server/fileStore';
import { PlatformService } from '../server/platformService';
import { OpenAiCopilotProvider } from '../server/openAiCopilot';
import { createPlatformHttpServer, closeServer, listenOnRandomLoopback } from '../server/httpServer';

const uiPort = await new Promise<number>((resolve, reject) => {
  const probe = createProbe(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => {
    const address = probe.address(); if (!address || typeof address === 'string') return reject(new Error('No test port.'));
    probe.close(() => resolve(address.port));
  });
});
const uiOrigin = `http://127.0.0.1:${uiPort}`;
const token = 'connected-browser-disposable-owner-token-0001';
const dataDirectory = await mkdtemp(join(tmpdir(), 'flyway-connected-intelligence-'));
const artifacts = 'tasks/browser-evidence';
const logs: string[] = [];
const ui = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
ui.stdout.on('data', (chunk) => logs.push(String(chunk))); ui.stderr.on('data', (chunk) => logs.push(String(chunk)));
let providerCalls = 0;
const provider = new OpenAiCopilotProvider({
  apiKey: 'fake-upstream-key-no-live-account', model: 'browser-protocol-test', baseUrl: 'http://127.0.0.1:9999/v1',
  fetch: (async (_url, init) => {
    providerCalls++;
    const body = JSON.parse(String(init?.body)) as { input: Array<{ role?: string; content?: string; type?: string }> };
    const question = body.input.filter((item) => item.role === 'user').at(-1)?.content || '';
    if (!body.input.some((item) => item.type === 'function_call_output')) return new Response(JSON.stringify({ output: [{ type: 'function_call', call_id: `analysis-${providerCalls}`, name: 'analyze_decisions', arguments: '{}' }] }), { status: 200 });
    if (question.includes('trigger provider failure')) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify({ output: [], output_text: 'The evaluated model changes are recorded. Review the human queue and automatic history in Decision Intelligence.' }), { status: 200 });
  }) as typeof fetch,
});
const service = new PlatformService(new FilePlatformStore({ dataDirectory, initialLocations, initialLanes }), undefined, provider);
await service.initialize();
const api = createPlatformHttpServer({ service, ownerToken: token, allowedOrigin: uiOrigin });
const apiOrigin = (await listenOnRandomLoopback(api)).origin;
const health = { errors: [] as string[], warnings: [] as string[], pageErrors: [] as string[], failedRequests: [] as string[], failedResponses: [] as string[] };
const expectedFailure = { errors: [] as string[], responses: [] as number[] };
const workflow: string[] = [];
let browser: Browser | undefined;
let failurePhase = false;
let outcome = 'running';
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(uiOrigin)).ok) break; } catch { /* owned Vite is starting */ }
    if (attempt >= 100) throw new Error(`Vite startup failed: ${logs.join('')}`);
    await delay(100);
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('flyway-onboarded', 'true'));
  const page = await context.newPage(); page.setDefaultTimeout(15_000);
  page.on('console', (message) => {
    if (message.type() === 'warning') health.warnings.push(message.text());
    if (message.type() === 'error') {
      if (failurePhase && message.location().url === `${apiOrigin}/api/v1/copilot/responses` && message.text().includes('502')) expectedFailure.errors.push(message.text());
      else health.errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => health.pageErrors.push(error.message));
  page.on('requestfailed', (request) => { if (request.url().startsWith(uiOrigin) || request.url().startsWith(apiOrigin)) health.failedRequests.push(`${request.url()} ${request.failure()?.errorText}`); });
  page.on('response', (response) => {
    if (failurePhase && response.url() === `${apiOrigin}/api/v1/copilot/responses` && response.status() === 502) expectedFailure.responses.push(response.status());
    else if ((response.url().startsWith(uiOrigin) || response.url().startsWith(apiOrigin)) && response.status() >= 400) health.failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(uiOrigin, { waitUntil: 'domcontentloaded' });
  await connect(page);
  await page.getByRole('button', { name: 'AI copilot', exact: true }).click();
  await page.getByText('OpenAI · browser-protocol-test', { exact: true }).waitFor();
  workflow.push('Connected an authenticated disposable service through actual Settings; provider configuration appeared.');
  await page.getByRole('button', { name: 'Ask Flyway', exact: true }).click();
  let copilot = page.getByRole('dialog', { name: 'Flyway copilot' });
  await page.waitForFunction(() => (document.querySelector('[aria-label="Assistant mode"]') as HTMLSelectElement)?.value === 'ai');
  await copilot.getByLabel('Ask Flyway', { exact: true }).fill('Analyze the planning model and create decisions.');
  await copilot.getByRole('button', { name: 'Ask', exact: true }).click();
  await copilot.getByText('The evaluated model changes are recorded.', { exact: false }).waitFor({ timeout: 90_000 });
  assert.equal(providerCalls, 2, 'actual Responses protocol must return the engine tool output before the assistant text');
  await copilot.getByText('AI response with model tools', { exact: true }).waitFor();
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: `${artifacts}/intelligence-connected-ai.png`, fullPage: true });
  workflow.push('AI-mode question executed the real analyze_decisions gateway through a fake upstream Responses loop, saved tools and response.');
  await copilot.getByRole('button', { name: 'Close copilot' }).click();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Decision Intelligence' }).click();
  const summary = await page.locator('.di-summary strong').allTextContents();
  assert.deepEqual(summary.slice(0, 3), ['1', '1', '1']);
  await page.getByLabel('Decision reason').fill('Approve the measured capacity tradeoff in this disposable planning model.');
  await page.getByRole('button', { name: 'Approve and apply' }).click();
  await page.getByText('No decisions need review').waitFor();
  workflow.push('AI-triggered analysis produced one automatic and one human decision; actual UI approval applied the latter.');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(axe.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), []);
  failurePhase = true;
  await page.getByRole('button', { name: 'Ask Flyway', exact: true }).click();
  copilot = page.getByRole('dialog', { name: 'Flyway copilot' });
  await copilot.getByRole('button', { name: 'New conversation', exact: true }).click();
  const failedQuestion = 'Analyze the planning model again and trigger provider failure.';
  await copilot.getByLabel('Ask Flyway', { exact: true }).fill(failedQuestion);
  await copilot.getByRole('button', { name: 'Ask', exact: true }).click();
  await copilot.getByRole('alert').filter({ hasText: 'Tool actions may already' }).waitFor({ timeout: 90_000 });
  assert.equal(await copilot.getByLabel('Ask Flyway', { exact: true }).inputValue(), failedQuestion);
  const afterFailure = await service.intelligence();
  assert.equal(afterFailure.state.decisions.length, 3, 'the completed tool action must remain durable after upstream text generation fails');
  assert.equal(afterFailure.state.conversations.length, 1, 'a failed provider must not manufacture or save a successful final response');
  await copilot.getByRole('button', { name: 'Close copilot' }).click();
  await page.getByRole('table', { name: 'Human decision queue' }).waitFor();
  workflow.push('Injected upstream 503 after a completed analysis; question remained, actual saved queue refreshed, no fake final response appeared.');
  assert.deepEqual(expectedFailure.responses, [502]);
  assert.ok(expectedFailure.errors.length <= 1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await connect(page);
  await page.getByRole('button', { name: 'Ask Flyway', exact: true }).click();
  await page.getByRole('dialog', { name: 'Flyway copilot' }).getByText('The evaluated model changes are recorded.', { exact: false }).waitFor();
  workflow.push('Reloaded, reauthenticated, and restored the service conversation and saved decisions without another provider call.');
  assert.equal(providerCalls, 4);
  assert.deepEqual(health, { errors: [], warnings: [], pageErrors: [], failedRequests: [], failedResponses: [] });
  outcome = 'passed';
  console.log('Connected intelligence browser passed: actual authenticated UI → Responses tool loop → atomic decisions → human approval → provider failure recovery → reload/reconnect durability. Fake upstream only; no live credentials or provider charges.');
} catch (error) { outcome = 'failed'; throw error; }
finally {
  await mkdir(artifacts, { recursive: true });
  await writeFile(`${artifacts}/intelligence-connected-receipt.json`, JSON.stringify({ at: new Date().toISOString(), outcome, provider: 'fake upstream through actual Responses adapter', providerCalls, workflow, health, expectedFailure }, null, 2));
  await browser?.close(); await closeServer(api); await service.shutdown(); ui.kill('SIGTERM');
}

async function connect(page: Page) {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Workspace service', exact: true }).click();
  await page.getByLabel('Service URL', { exact: true }).fill(apiOrigin);
  await page.getByLabel('Owner access token', { exact: true }).fill(token);
  await page.getByRole('button', { name: 'Connect and load workspace', exact: true }).click();
  await page.locator('.workspace-save-bar').getByText(/Connected workspace/).waitFor();
  // Connecting remounts Settings with the service-scoped draft boundary.
  await page.getByRole('button', { name: 'Workspace service', exact: true }).click();
  await page.getByRole('heading', { name: 'Connected workspace', exact: true }).waitFor();
}
