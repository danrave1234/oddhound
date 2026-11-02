// Explicit local UI check over the saved, sanitized, stopped Meta recording. No inference/target traffic.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';
const runId = process.env.RECORDED_REVIEW_RUN ?? 'aeb4dd1d-c239-4e24-81cc-7712857cd38d';
if (!['aeb4dd1d-c239-4e24-81cc-7712857cd38d', '883c2266-0b91-4cc6-bb3b-fa4fd111cd80'].includes(runId)) throw new Error('Unapproved recording');
const evidenceName = runId.startsWith('883c') ? 'replay-complete-history-ui-2026-11-03' : 'replay-complete-history-ui-2026-11-02';
const recording = JSON.parse(await readFile(`.data/recorded-review/${runId}.json`, 'utf8'));
const run = recording.records.run;
const at = Date.parse(run.started_at) + (Date.parse(run.finished_at) - Date.parse(run.started_at)) * .2;
const expected = recording.records.events.filter((e: any) => e.type === 'action.finished' && Date.parse(e.at) <= at).length;
const truncated = recording.records.events.slice(-300).filter((e: any) => e.type === 'action.finished' && Date.parse(e.at) <= at).length;
const checks: { label: string; passed: boolean }[] = [];
const check = (passed: boolean, label: string) => { checks.push({ label, passed }); if (!passed) throw new Error(label); };
const browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true });
let error: string | undefined;
try {
  check(await checkChromiumSandbox(browser) === 'sandbox_on', 'actual Chromium sandbox enabled');
  check(expected > 0 && truncated === 0, 'recorded early actions exist outside the recent 300-event window');
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => /^http:\/\/127\.0\.0\.1:3312\//.test(route.request().url()) ? route.continue() : route.abort());
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:3312', { waitUntil: 'networkidle' });
  const app = page.frameLocator('iframe');
  const slider = app.getByRole('slider', { name: 'Replay position', exact: true });
  await slider.waitFor({ state: 'visible' });
  check(true, 'playback becomes available after complete history loads');
  await slider.press('Home'); await slider.press('PageUp'); await slider.press('PageUp');
  check(await slider.inputValue() === '200', 'native range input selected 20 percent of the recording');
  await app.getByRole('img', { name: `${expected} actions (no limit)`, exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  check(true, `early playback shows all ${expected} recorded completed actions`);
  await page.screenshot({ path: `docs/evidence/${evidenceName}.png` });
  await slider.press('End');
  await app.getByRole('img', { name: `${recording.counts.actions} actions (no limit)`, exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  check(true, `terminal playback keeps the complete ${recording.counts.actions}-action ledger total`);
  const candidates = recording.records.events.filter((e: any) => e.type === 'finding.candidate').length;
  if (candidates) {
    await app.getByText(new RegExp(`^${candidates}\\s*candidates$`)).waitFor({ state: 'visible', timeout: 5000 });
    check(true, `terminal candidate count retains all ${candidates} candidates outside the recent event window`);
  }
  // The November recording contains enough stops for pagination and a document detail;
  // the older partial recording contains neither and remains the early-history regression.
  if (runId.startsWith('883c')) {
  await app.getByRole('button', { name: 'Expand trail', exact: true }).click();
  check(await app.getByRole('button', { name: 'Collapse trail', exact: true }).getAttribute('aria-expanded') === 'true', 'Trail expands with the full terminal recording');
  await app.getByRole('group', { name: 'Trail layout' }).getByRole('button', { name: 'List', exact: true }).click();
  const trail = app.getByRole('list', { name: 'Recorded trail stops' });
  const pagination = app.getByRole('group', { name: 'Trail pages', exact: true });
  const first = await trail.innerText();
  await pagination.getByRole('button', { name: 'Latest', exact: true }).click();
  check(await trail.innerText() !== first, 'Trail pagination reaches stops beyond the first page');
  await app.getByRole('searchbox', { name: 'Search trail' }).fill('/documents/');
  check((await trail.innerText()).includes('/documents/'), 'expanded Trail finds actual document detail states');
  await page.screenshot({ path: `docs/evidence/${evidenceName}-trail.png` });
  }
  check(errors.length === 0, 'no client runtime errors');
} catch (e) { error = (e as Error).message; }
finally {
  const chromium = browser.version(); await browser.close();
  const result = { checkedAt: new Date().toISOString(), runId, recording: 'actual sanitized stopped Meta run', chromium, expectedEarlyActions: expected, checks, error, browserClosed: true };
  await writeFile(`docs/evidence/${evidenceName}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
if (error) process.exitCode = 1;
