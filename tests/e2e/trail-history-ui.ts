// Real Next/React/Chromium + PostgreSQL UI regression. Synthetic records only; no model/target calls.
// Run using .tools/node26/node.exe tests/e2e/trail-history-ui.ts (local Docker PostgreSQL on55433).
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile, access, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { Db } from '../../packages/core/db/pool.ts';
import { chromium, type Browser, type Page } from 'playwright';
import { migrate } from '../../packages/core/db/migrate.ts';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { canonicalJson, sha256 } from '../../packages/core/ledger/runs.ts';
import { checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';

const { Pool } = createRequire(new URL('../../packages/core/db/pool.ts', import.meta.url))('pg') as { Pool: new(options: { connectionString: string }) => Db };
const database = `oddhound_trail_ui_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const admin = new Pool({ connectionString: 'postgres://oddhound:oddhound_local_dev@127.0.0.1:55433/postgres' });
const databaseUrl = `postgres://oddhound:oddhound_local_dev@127.0.0.1:55433/${database}`;
const pool = new Pool({ connectionString: databaseUrl });
const root = resolve('.'), origin = 'http://127.0.0.1:3312';
const keepServing = process.argv.includes('--serve');
const stopFile = resolve('.data', `${database}.stop`);
let browserVersion = 'not_run', sandbox = 'not_run';
let server: ChildProcess | undefined, browser: Browser | undefined, created = false;
let page: Page | undefined;
const errors: string[] = [];
const checks: { name: string; passed: boolean }[] = [];
let diagnostic = '', fatal: string | undefined;
const check = (ok: boolean, name: string) => { checks.push({ name, passed: ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) throw new Error(name); };
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
try {
  await admin.query(`CREATE DATABASE ${database}`); created = true;
  await migrate(pool);
  const contract = canonicalJson(demoTargetContract('https://owned-ui-fixture.example'));
  const makeRun = async (mode: string) => (await pool.query(`INSERT INTO runs (principal, mode, origin, active_origins, environment, test_mode, contract, contract_hash, status, provider, started_at, finished_at)
    VALUES ('ui-fixture', $1, 'https://owned-ui-fixture.example', ARRAY['https://owned-ui-fixture.example'], 'staging', 'active', $2, $3, 'completed', 'test-double', now()-interval '1 hour', now()) RETURNING id`, [mode, contract, sha256(contract)])).rows[0].id as string;
  const runId = await makeRun('demo_target'), privateId = await makeRun('verified_site');
  await pool.query(`INSERT INTO graph_states(run_id,fingerprint,route,title,actor,device,first_seen_at)
    SELECT $1, 'state-'||i, CASE WHEN i<=105 THEN '/settings' ELSE '/route-'||i END, 'Synthetic state '||i,
      CASE WHEN i<=105 OR i%2=0 THEN 'A' ELSE 'B' END, CASE WHEN i<=105 OR i%3<>0 THEN 'desktop' ELSE 'mobile' END,
      now()-interval '1 hour'+i*interval '1 second' FROM generate_series(1,650) i`, [runId]);
  await pool.query(`INSERT INTO run_events(run_id,seq,type,payload,at) SELECT $1,i,'action.finished',jsonb_build_object('description','Synthetic action '||i,'ok',true),now()-interval '1 hour'+i*interval '1 second' FROM generate_series(1,650) i`, [runId]);
  await pool.query(`UPDATE run_events SET type='exploration.updated', payload=$2 WHERE run_id=$1 AND seq=650`, [runId, JSON.stringify({ revision: 50, changes: [], summary: { revision: 50, discovered: 70, visited: 40, outcomeChecked: 7, blocked: 1, pendingRoutes: 30, pendingControls: 3, sampledVariants: 11, next: [{ id: 'fixture-menu', kind: 'control', path: '/menu', label: 'Open account menu', source: 'menu', status: 'pending', checked: false, attempts: 0, priority: 1 }] } })]);
  await pool.query(`INSERT INTO actions(run_id,seq,generation,actor,device,tool,args,state,url_after) SELECT $1,i,1,'A','desktop','click','{}','succeeded','/route-'||i FROM generate_series(1,240) i`, [runId]);
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: 'synthetic-ui-test-secret-32-characters', BETTER_AUTH_URL: origin, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'development' };
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', '3312', '--hostname', '127.0.0.1'], { cwd: resolve('apps/web'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const append = (chunk: Buffer) => { diagnostic = (diagnostic + chunk.toString()).slice(-5000); };
  server.stdout?.on('data', append); server.stderr?.on('data', append);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Fixture Next server exited: ${diagnostic}`);
    try { if ((await fetch(`${origin}/api/runs/${runId}`, { signal: AbortSignal.timeout(3000) })).ok) { ready = true; break; } } catch {}
    await delay(500);
  }
  check(ready, 'local Next server ready with dedicated synthetic database');
  if (keepServing) console.log(JSON.stringify({ proofUrl: `${origin}/runs/${runId}`, stopFile }));
  const snapshot = await fetch(`${origin}/api/runs/${runId}`).then((r) => r.json());
  check(snapshot.graph.states.length === 650 && snapshot.graph.states[0].first_seen_at && snapshot.history.eventsHasMore && snapshot.history.actionsHasMore, 'snapshot retains all650 discoveries and explicit older-history cursors');
  const events: number[] = []; let before: number | undefined;
  for (;;) {
    const result = await fetch(`${origin}/api/runs/${runId}/history?kind=events${before ? `&before=${before}` : ''}`).then((r) => r.json());
    check(result.rows.length <= 100, `history page is bounded to100 (${events.length} already read)`);
    events.push(...result.rows.map((r: { seq: number }) => r.seq));
    if (!result.hasMore) break; before = result.nextBefore;
  }
  check(events.length === 650 && new Set(events).size === 650 && events.at(-1) === 1, 'keyset pages reach event1 without gaps or duplicates');
  check((await fetch(`${origin}/api/runs/${privateId}/history?kind=events`)).status === 404, 'history API refuses anonymous access to a private run');
  check((await fetch(`${origin}/api/runs/${runId}/history?limit=100000`)).status === 400, 'history API rejects unbounded page request');
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true });
  browserVersion = browser.version(); sandbox = await checkChromiumSandbox(browser);
  check(sandbox === 'sandbox_on', 'UI test Chromium sandbox is enabled');
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/runs/${runId}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const discovery = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Site exploration' }) });
  check(await discovery.innerText().then((s) => s.includes('40 routes visited') && s.includes('7 outcomes checked') && s.includes('30 routes and 3 controls pending')), 'discovery summary separates visits, checked outcomes and pending gaps');
  check(await page.locator('.tmap-hit').count() === 24, 'compact trail explicitly renders latest24 stops');
  await page.getByRole('button', { name: 'Expand trail', exact: true }).click();
  check(await page.locator('.tmap-hit').count() === 48, 'expansion renders48 bounded stops including earlier discoveries');
  await page.getByRole('button', { name: /^Inspect stop 1:/ }).click();
  await page.getByLabel('State at selected stop', { exact: true }).fill('105');
  check(await page.getByRole('region', { name: 'Selected trail state' }).innerText().then((s) => s.includes('Synthetic state 105')), 'all105 grouped states are individually inspectable');
  await page.getByLabel('Search trail', { exact: true }).fill('Synthetic state 650');
  check(await page.locator('.tmap-hit').count() === 1, 'search reaches a state far beyond original24-stop cap');
  await page.getByRole('button', { name: /^Inspect stop 546:/ }).click();
  check(await page.getByRole('region', { name: 'Selected trail state' }).innerText().then((s) => s.includes('Synthetic state 650')), 'last recorded state can be selected and inspected');
  await page.getByLabel('Search trail', { exact: true }).fill('');
  await page.getByLabel('Actor', { exact: true }).selectOption('B');
  await page.getByLabel('Device', { exact: true }).selectOption('mobile');
  check(await page.locator('.tmap-hit').count() > 0 && (await page.locator('.tmap-hit').evaluateAll((els) => els.every((el) => el.getAttribute('aria-label')?.includes('actor B, mobile')))), 'actor/device filters preserve session distinctions');
  await page.getByRole('group', { name: 'Trail layout' }).getByRole('button', { name: 'List', exact: true }).click();
  check(await page.locator('.trail-history-stop').count() > 0, 'keyboard-accessible list offers equivalent stop selection');
  await page.locator('.trail-history-stop').first().focus(); await page.keyboard.press('Enter');
  check(await page.getByRole('region', { name: 'Selected trail state' }).innerText().then((s) => s.includes('Actor B · mobile')), 'keyboard selection opens matching state details');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  check(await page.locator('.trail-history-stop').first().evaluate((el) => el === document.activeElement), 'closing state details restores focus to selected stop');
  await page.getByLabel('Actor', { exact: true }).selectOption(''); await page.getByLabel('Device', { exact: true }).selectOption('');
  await page.getByRole('group', { name: 'Trail pages' }).getByRole('button', { name: 'Latest', exact: true }).click();
  check(await page.locator('.trail-history-stop').last().innerText().then((s) => s.includes('/route-650')), 'pagination reaches final discovery');
  await page.screenshot({ path: resolve('docs/evidence/trail-history-large-run.png'), fullPage: false });
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await page.getByRole('button', { name: 'Load earlier records', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Recorded activity"]')?.textContent?.includes('Synthetic action 350'));
  check(await page.getByRole('list', { name: 'Recorded activity' }).locator('li').count() <= 100, 'activity older-page loading stays bounded to100 rendered records');
  for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: 'Load earlier records', exact: true }).click(); await page.getByRole('button', { name: 'Load earlier records', exact: true }).waitFor(); }
  await page.waitForFunction(() => document.querySelector('[aria-label="Recorded activity"]')?.textContent?.includes('Synthetic action 1'));
  check(await page.getByRole('button', { name: 'Load earlier records', exact: true }).isDisabled(), 'activity reaches first saved event and reports history exhausted');
  await page.getByRole('button', { name: 'Browser', exact: true }).click();
  await page.getByRole('button', { name: 'Load earlier records', exact: true }).click();
  await page.getByRole('button', { name: 'Load earlier records', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Load earlier records', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Recorded actions"]')?.textContent?.includes('#1'));
  check(await page.getByRole('list', { name: 'Recorded actions' }).locator('li').count() <= 100, 'all240 actions accessible beyond previous15/60 limits');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  check(await page.getByRole('button', { name: 'Collapse trail', exact: true }).isVisible(), 'expanded trail controls remain accessible on narrow dark/reduced-motion view');
  check(errors.length === 0, `no client runtime errors (${errors.length})`);
  if (keepServing) {
    await browser.close(); browser = undefined;
    console.log('UI_PROOF_READY — synthetic local page remains available; create the printed stopFile to clean up.');
    while (!(await access(stopFile).then(() => true, () => false))) await delay(1000);
    await unlink(stopFile);
  }
} catch (e) {
  fatal = e instanceof Error ? e.stack : String(e); console.error(fatal);
  if (page) {
    await page.screenshot({ path: resolve('docs/evidence/trail-history-ui-failure.png') }).catch(() => {});
    const overlay = await page.locator('nextjs-portal').evaluateAll((els) => els.map((el) => el.shadowRoot?.textContent?.slice(-6000))).catch(() => []);
    console.error(JSON.stringify({ errors, overlay }));
  }
}
finally {
  await browser?.close();
  if (server?.pid) { try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { server.kill(); } }
  await pool.end();
  if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await admin.end();
  await mkdir(resolve('docs/evidence'), { recursive: true });
  const report = JSON.stringify({ at: new Date().toISOString(), node: process.version, playwright: '1.64.1', chromium: browserVersion, sandbox, mocked: 'Synthetic saved run/states/events/actions only; real local Next/React/PostgreSQL/Chromium. No provider or external target.', checks, fatal, errors, diagnostic: fatal ? diagnostic : undefined, cleanup: 'Dedicated database dropped; local server/browser stopped' }, null, 2);
  await writeFile(resolve('docs/evidence/trail-history-ui.json'), report);
  await writeFile(resolve(`docs/evidence/trail-history-ui-${randomUUID().slice(0, 8)}.json`), report);
}
process.exitCode = fatal || checks.some((c) => !c.passed) ? 1 : 0;
