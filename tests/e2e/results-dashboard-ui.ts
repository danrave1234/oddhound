// Actual sanitized terminal recording. Loopback-only, no inference or target requests.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';

const checks: { label: string; passed: boolean }[] = [];
const check = (passed: boolean, label: string) => { checks.push({ label, passed }); if (!passed) throw new Error(label); };
const browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true });
let error: string | undefined;
try {
  check(await checkChromiumSandbox(browser) === 'sandbox_on', 'Chromium sandbox enabled');
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => /^http:\/\/127\.0\.0\.1:3312\//.test(route.request().url()) ? route.continue() : route.abort());
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:3312', { waitUntil: 'networkidle' });
  const app = page.frameLocator('iframe'), dashboard = app.getByRole('region', { name: 'Results dashboard' });
  await dashboard.waitFor({ state: 'visible' });
  check(await app.getByRole('group', { name: 'View', exact: true }).getByRole('button', { name: 'Results', exact: true }).getAttribute('aria-pressed') === 'true', 'finished run opens Results by default');
  const text = await dashboard.innerText();
  check(/Partial results/.test(text) && /Stopped/.test(text), 'time-limited run stays explicitly partial and stopped');
  check(/0\s*Verified issues/.test(text) && /2\s*Needs review/.test(text) && /1\s*Configuration observations/.test(text), 'actual zero issues, two review candidates and one observation remain distinct');
  check(/42 paths reached/.test(text) && /No mobile states recorded/.test(text) && /861 discovered routes/.test(text), 'actual scope and outstanding gaps shown');
  const categories = dashboard.getByRole('group', { name: 'Result categories' });
  await categories.getByRole('button', { name: /^SEO/ }).press('Enter');
  await dashboard.getByRole('heading', { name: 'SEO', exact: true }).waitFor();
  check((await dashboard.innerText()).includes('does not establish that the category was tested or passed'), 'empty SEO view does not claim a passing audit');
  await categories.getByRole('button', { name: /^Security/ }).click();
  await dashboard.getByRole('heading', { name: 'Security', exact: true }).waitFor();
  check(await dashboard.getByRole('button', { name: /No Content-Security-Policy/ }).count() === 1 && await dashboard.getByText('Observed', { exact: true }).count() === 1, 'security header remains an observation with accessible evidence entry');
  await dashboard.getByRole('button', { name: /No Content-Security-Policy/ }).click();
  await app.getByRole('complementary', { name: 'Inspector' }).getByRole('heading', { name: 'No Content-Security-Policy on HTML pages', exact: true }).waitFor();
  check(true, 'finding selection opens existing evidence inspector');
  await app.getByRole('group', { name: 'View', exact: true }).getByRole('button', { name: 'Results', exact: true }).click();
  await dashboard.getByRole('button', { name: 'All categories', exact: true }).click();
  await page.screenshot({ path: 'docs/evidence/results-dashboard-desktop-2026-11-03.png' });
  await page.setViewportSize({ width: 390, height: 1000 });
  check(await dashboard.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'dashboard fits a 390px viewport without horizontal overflow');
  await dashboard.getByRole('button', { name: 'View coverage', exact: true }).click();
  await app.getByRole('heading', { name: 'Coverage', exact: true }).waitFor();
  check(true, 'coverage action opens recorded controls and workflow details');
  await app.getByRole('group', { name: 'View', exact: true }).getByRole('button', { name: 'Results', exact: true }).click();
  await page.screenshot({ path: 'docs/evidence/results-dashboard-mobile-2026-11-03.png' });
  check(errors.length === 0, 'no browser client errors');
} catch (e) { error = (e as Error).message; }
finally {
  const chromium = browser.version(); await browser.close();
  const result = { at: new Date().toISOString(), runId: '883c2266-0b91-4cc6-bb3b-fa4fd111cd80', recordingSha256: '209c0876afa5e487578d667dee3861efc4a26e3eea529b802144540ef4b4faea', chromium, checks, error, browserClosed: true, targetRequests: false, modelCalls: false };
  await writeFile('docs/evidence/results-dashboard-ui-2026-11-03.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
if (error) process.exitCode = 1;
