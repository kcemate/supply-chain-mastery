import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Page } from 'playwright';

const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const evidenceDir = 'tasks/browser-evidence';
const receiptPath = `${evidenceDir}/intelligence-prototype-receipt.json`;
const screenshotPaths = [
  `${evidenceDir}/intelligence-prototype-before-analysis.png`,
  `${evidenceDir}/intelligence-prototype-after-analysis.png`,
  `${evidenceDir}/intelligence-prototype-copilot-scenario.png`,
  `${evidenceDir}/intelligence-prototype-tablet-dark.png`,
  `${evidenceDir}/intelligence-prototype-tablet-dark-copilot.png`,
];
const serverLog: string[] = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout?.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()));
server.stderr?.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()));
await mkdir(evidenceDir, { recursive: true });
await waitForHttp(origin, serverLog);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const consoleErrors: string[] = [];
const consoleWarnings: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];
const failedResponses: string[] = [];
const axeReports: Array<{ label: string; violations: number; blocking: number }> = [];
const manifest: string[] = [];
const record = (message: string) => manifest.push(`${new Date().toISOString()} ${message}`);

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
  if (message.type() === 'warning') consoleWarnings.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  if (request.url().startsWith(origin)) failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
});
page.on('response', (response) => {
  if (response.url().startsWith(origin) && response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
});

await page.addInitScript(() => {
  localStorage.setItem('flyway-onboarded', 'true');
  localStorage.setItem('flyway-theme', JSON.stringify('light'));
  const metrics = { lcp: null as number | null, cls: 0, maxEventDuration: 0 };
  Object.defineProperty(window, '__intelligencePrototypePerf', { value: metrics, configurable: true });
  try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) metrics.lcp = Math.max(metrics.lcp ?? 0, entry.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* unsupported metric */ }
  try { new PerformanceObserver((list) => { for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) if (!entry.hadRecentInput) metrics.cls += entry.value || 0; }).observe({ type: 'layout-shift', buffered: true }); } catch { /* unsupported metric */ }
  try { new PerformanceObserver((list) => { for (const entry of list.getEntries() as Array<PerformanceEntry & { duration?: number }>) metrics.maxEventDuration = Math.max(metrics.maxEventDuration, entry.duration || 0); }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit); } catch { /* unsupported metric */ }
});

try {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('app-shell').waitFor();
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('button', { name: 'Decision Intelligence' }).click();
  record('Clicked Primary navigation > Decision Intelligence from the app entry point.');
  await page.getByRole('heading', { name: 'Decision intelligence' }).waitFor();
  await page.getByText('No decisions need review').waitFor();
  await screenshot(page, screenshotPaths[0]);
  record('Verified the first-run empty decision queue and captured its initial state.');

  const analyze = page.getByRole('button', { name: 'Analyze network' }).first();
  await analyze.click();
  record('Clicked Analyze network to evaluate the real sample planning model.');
  await page.getByRole('table', { name: 'Human decision queue' }).waitFor({ timeout: 90_000 });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Analyze network')) as HTMLButtonElement | undefined;
    return button && !button.disabled;
  }, undefined, { timeout: 90_000 });
  const summaryValues = await page.locator('.di-summary > div > div > strong').allTextContents();
  assert.ok(Number(summaryValues[0]) >= 1, `Expected at least one human decision, received ${JSON.stringify(summaryValues)}`);
  assert.ok(Number(summaryValues[1]) >= 1, `Expected at least one automatically applied decision, received ${JSON.stringify(summaryValues)}`);
  const decisionTitle = clean(await page.locator('.di-detail-header h2').textContent());
  assert.ok(decisionTitle, 'The selected human decision needs a title.');
  await screenshot(page, screenshotPaths[1]);
  record(`Verified analysis produced AI-applied and human-routed decisions; selected “${decisionTitle}”.`);

  await page.getByRole('button', { name: 'Approve and apply' }).click();
  await page.getByText('Add a reason so this decision remains auditable.').waitFor();
  record('Clicked Approve and apply without a reason and verified inline validation.');
  const approvalReason = 'Approve this modeled capacity option after reviewing the calculated cost and capacity tradeoffs.';
  await page.getByLabel('Decision reason').fill(approvalReason);
  record('Typed an auditable approval reason into Decision reason.');
  await page.getByRole('button', { name: 'Approve and apply' }).click();
  await page.waitForFunction((approvedTitle) => ![...document.querySelectorAll('.di-decision-list strong')].some((item) => item.textContent?.trim() === approvedTitle), decisionTitle, { timeout: 30_000 });
  await page.getByRole('button', { name: /Decision history/ }).click();
  await page.getByRole('heading', { name: decisionTitle }).waitFor();
  await page.getByText(approvalReason, { exact: true }).waitFor();
  record('Approved and applied the human decision, then verified its reason in Decision history.');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('app-shell').waitFor();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Decision Intelligence' }).click();
  await page.getByRole('button', { name: /Decision history/ }).click();
  await page.getByRole('heading', { name: decisionTitle }).waitFor();
  await page.getByText(approvalReason, { exact: true }).waitFor();
  record('Reloaded the browser and verified the approved decision and reason remained durable.');

  await page.getByRole('button', { name: 'Autonomy policy' }).click();
  const capacityLimit = page.getByLabel('Maximum capacity increase');
  await capacityLimit.fill('4');
  record('Typed a tighter 4% maximum capacity increase into the autonomy policy.');
  await page.getByRole('button', { name: 'Save policy' }).click();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Save policy')) as HTMLButtonElement | undefined;
    return button?.disabled === true;
  });
  record('Saved the autonomy policy and verified the form returned to a clean state.');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Decision Intelligence' }).click();
  await page.getByRole('button', { name: 'Autonomy policy' }).click();
  assert.equal(await page.getByLabel('Maximum capacity increase').inputValue(), '4');
  record('Reloaded and verified the tighter autonomy limit persisted.');

  await page.getByRole('button', { name: 'Ask Flyway' }).click();
  const copilot = page.getByRole('dialog', { name: 'Flyway copilot' });
  await copilot.waitFor();
  assert.equal(await copilot.getByLabel('Assistant mode').inputValue(), 'model-tools');
  const scenarioQuestion = 'Test a 20% demand surge.';
  await copilot.getByLabel('Ask Flyway').fill(scenarioQuestion);
  record('Opened the copilot and typed “Test a 20% demand surge.” in Model tools mode.');
  await copilot.getByRole('button', { name: 'Ask', exact: true }).click();
  await copilot.locator('.copilot-answer > p').filter({ hasText: /Saved a 14-day demand surge scenario/ }).waitFor({ timeout: 90_000 });
  await copilot.getByRole('button', { name: 'Open scenario result' }).waitFor();
  const conversationOptions = await copilot.getByLabel('Saved conversation').locator('option').allTextContents();
  assert.ok(conversationOptions.some((option) => option.includes(scenarioQuestion)), `Saved conversation missing: ${JSON.stringify(conversationOptions)}`);
  await screenshot(page, screenshotPaths[2]);
  record('Submitted the demand scenario, verified the calculated response, action evidence, and saved conversation.');

  await copilot.getByRole('button', { name: 'Open scenario result' }).click();
  const results = page.getByRole('dialog', { name: 'Scenario results' });
  await results.waitFor({ timeout: 30_000 });
  await results.getByText('Frozen input', { exact: true }).waitFor();
  record('Opened the copilot-created run and verified its frozen scenario result.');
  await results.getByRole('button', { name: 'Close scenario results' }).click();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Scenarios' }).click();
  await page.getByTestId('scenarios-page').getByText(/Copilot · demand surge/).waitFor();
  record('Opened Scenarios and verified the copilot-created demand surge is saved.');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Ask Flyway' }).click();
  const restoredCopilot = page.getByRole('dialog', { name: 'Flyway copilot' });
  await restoredCopilot.getByRole('heading', { name: scenarioQuestion, exact: true }).waitFor();
  await restoredCopilot.locator('.copilot-answer > p').filter({ hasText: /Saved a 14-day demand surge scenario/ }).waitFor();
  record('Reloaded and verified the saved copilot conversation and response were restored.');
  await restoredCopilot.getByRole('button', { name: 'Close copilot' }).click();

  await page.getByRole('button', { name: 'Use dark mode' }).click();
  await page.setViewportSize({ width: 768, height: 1024 });
  const mobileMenu = page.getByRole('button', { name: 'Open navigation' });
  if (await mobileMenu.isVisible().catch(() => false)) await mobileMenu.click();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Decision Intelligence' }).click();
  await page.getByRole('button', { name: /Decision history/ }).click();
  await page.getByRole('heading', { name: decisionTitle }).waitFor();
  await noOverflow(page, 'tablet dark decision history');
  await screenshot(page, screenshotPaths[3]);
  record('Switched to dark mode at 768px, navigated through the mobile menu, and verified decision history without horizontal overflow.');
  await axe(page, 'tablet dark decision history');
  record('Completed the tablet dark accessibility scan with no serious or critical violations.');
  await page.getByRole('button', { name: 'Ask Flyway' }).click();
  const tabletCopilot = page.getByRole('dialog', { name: 'Flyway copilot' });
  await tabletCopilot.getByRole('heading', { name: scenarioQuestion, exact: true }).waitFor();
  await screenshot(page, screenshotPaths[4]);
  await axe(page, 'tablet dark saved copilot conversation');
  await tabletCopilot.getByRole('button', { name: 'Close copilot' }).click();
  record('Opened the saved conversation in the tablet dark copilot and captured its responsive state.');

  await page.setViewportSize({ width: 1440, height: 900 });
  await axe(page, 'desktop decision history');
  const performance = await performanceGate(page);
  record('Completed desktop accessibility, performance, console, request, and response health gates.');

  const healthPassed = !consoleErrors.length && !consoleWarnings.length && !pageErrors.length && !failedRequests.length && !failedResponses.length;
  await writeFile(receiptPath, JSON.stringify({
    runAt: new Date().toISOString(),
    outcome: healthPassed ? 'passed' : 'browser-health-failed',
    workflow: { analysis: true, automaticAndHuman: true, approvalPersisted: true, policyPersisted: true, copilotConversationPersisted: true, scenarioOpened: true, tabletDark: true },
    manifest,
    screenshots: screenshotPaths,
    axe: axeReports,
    performance,
    health: { consoleErrors, consoleWarnings, pageErrors, failedRequests, failedResponses },
  }, null, 2));
  console.log(`Decision Intelligence workflow receipt written to ${receiptPath}. Browser health: ${healthPassed ? 'passed' : 'failed'}.`);

  assert.deepEqual(consoleErrors, [], `Console errors:\n${consoleErrors.join('\n')}`);
  assert.deepEqual(consoleWarnings, [], `Console warnings:\n${consoleWarnings.join('\n')}`);
  assert.deepEqual(pageErrors, [], `Page errors:\n${pageErrors.join('\n')}`);
  assert.deepEqual(failedRequests, [], `Failed first-party requests:\n${failedRequests.join('\n')}`);
  assert.deepEqual(failedResponses, [], `First-party 4xx/5xx responses:\n${failedResponses.join('\n')}`);
  assert.ok(manifest.length >= 18, `Interaction manifest is incomplete: ${manifest.length} entries`);
  console.log(`Decision Intelligence prototype browser passed with ${manifest.length} interaction-manifest entries.\n${manifest.map((item) => `  [✓] ${item}`).join('\n')}`);
} finally {
  await context.close();
  await browser.close();
  server.kill('SIGTERM');
}

async function screenshot(page: Page, path: string) {
  await page.screenshot({ path, fullPage: true });
}

async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
  axeReports.push({ label, violations: result.violations.length, blocking: blocking.length });
  assert.deepEqual(blocking.map((violation) => ({ label, id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target) })), []);
}

async function noOverflow(page: Page, label: string) {
  const failures = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>('body *')].filter((element) => {
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(element).position !== 'fixed';
      return visible && (rect.right > viewport + 2 || rect.left < -2);
    }).slice(0, 12).map((element) => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 80), rect: element.getBoundingClientRect().toJSON() }));
  });
  assert.deepEqual(failures, [], `${label} has clipped or overflowing elements`);
}

async function performanceGate(page: Page) {
  const metrics = await page.evaluate(() => (window as unknown as { __intelligencePrototypePerf: { lcp: number | null; cls: number; maxEventDuration: number } }).__intelligencePrototypePerf);
  if (metrics.lcp !== null) assert.ok(metrics.lcp < 4_000, `LCP ${metrics.lcp}ms exceeds 4000ms`);
  assert.ok(metrics.cls < .25, `CLS ${metrics.cls} exceeds 0.25`);
  assert.ok(metrics.maxEventDuration < 500, `Maximum observed interaction duration ${metrics.maxEventDuration}ms exceeds 500ms`);
  return metrics;
}

function clean(value: string | null | undefined) { return (value || '').replace(/\s+/g, ' ').trim(); }
async function availablePort() { return new Promise<number>((resolve, reject) => { const probe = createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => { const address = probe.address(); if (!address || typeof address === 'string') return reject(new Error('Could not allocate a Vite port.')); probe.close(() => resolve(address.port)); }); }); }
async function waitForHttp(url: string, logs: string[]) { for (let attempt = 0; attempt < 120; attempt += 1) { try { if ((await fetch(url)).ok) return; } catch { /* server starting */ } await delay(100); } throw new Error(`Vite did not start at ${url}.\n${logs.join('')}`); }
