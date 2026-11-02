// Opt-in evaluation only. Real sandboxed Chromium and TLS proxy, owned synthetic targets, no model.
// The target network is INTERNAL. A separate bridge exposes only loopback control ports; it is lab
// plumbing, not proof of provider-side egress isolation. Synthetic target code makes no outbound calls.
// Build the separate apps/browser/gateway/Dockerfile first, then run with the pinned Node 26.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';
import { attachSentinels, gatewayBlockReason, type Signal } from '../../packages/core/browser/sentinels.ts';

const id = randomUUID();
const suffix = id.slice(0, 8);
const network = `oddhound-gateway-eval-${suffix}`;
const controlNetwork = `oddhound-gateway-control-${suffix}`;
const targetName = `oddhound-gateway-target-${suffix}`;
const gatewayName = `oddhound-gateway-eval-${suffix}`;
const work = resolve('.data', `gateway-evaluation-${suffix}`);
const trust = resolve(work, 'public-trust');
const wsPath = `/pw-${randomUUID().replaceAll('-', '')}`;
const image = process.env.ODDHOUND_EVALUATION_IMAGE ?? 'oddhound-claude-gateway:evaluation';
const primary = 'https://fixture.test';
const api = 'https://api.test';
const resource = 'https://resource.test';
const codes = [301, 302, 303, 307, 308];
const checks: { id: string; name: string; passed: boolean; expected: string; nonce: string; browserResult: string; arrivals: Arrival[]; denials?: Record<string, unknown>[] }[] = [];
type Arrival = { kind: string; host?: string; nonce?: string; path?: string; method?: string; body?: string; origin?: string | null; code?: string; activeForNonce?: number };
let browser: Browser | undefined;
let sandbox = 'not_run', browserVersion = 'not_run', imageId = 'not_run', fatal: string | undefined;
let admin = '';
let gatewayLogs = '';
let targetLogs = '';
const cleanup: Record<string, boolean> = {};
const created = { network: false, controlNetwork: false, target: false, gateway: false };
const scrub = (s: string) => s.replaceAll(wsPath, '/[control-path-redacted]');
const docker = (args: string[], timeout = 60_000) => execFileSync('docker', args, { encoding: 'utf8', timeout, maxBuffer: 5 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const events = async (): Promise<Arrival[]> => (await fetch(`${admin}/events`, { signal: AbortSignal.timeout(5_000) })).json() as Promise<Arrival[]>;
const sink = (a: Arrival[], host: string, method?: string) => a.filter((x) => x.kind === 'http' && x.host === host && x.path === '/sink' && (!method || x.method === method));
const post = (p: Page, url: string, nonce: string, method = 'POST') => p.evaluate(async ({ url, nonce, method }) => {
  try { const r = await fetch(url, { method, body: `synthetic=${nonce}` }); return `response:${r.status}`; }
  catch (e) { return `error:${String(e)}`; }
}, { url, nonce, method });
const redirect = (code: number, target: string, nonce: string) => `${primary}/redirect?code=${code}&nonce=${nonce}&target=${encodeURIComponent(target)}`;
const socket = (p: Page, url: string) => p.evaluate((url) => new Promise<string>((done) => {
  const ws = new WebSocket(url);
  const timer = setTimeout(() => { ws.close(); done('timeout'); }, 3_000);
  ws.onopen = () => { clearTimeout(timer); ws.close(); done('opened'); };
  ws.onerror = () => { clearTimeout(timer); done('error'); };
}), url);

async function check(name: string, expected: string, op: (p: Page, nonce: string) => Promise<string>, judge: (a: Arrival[], result: string) => boolean) {
  const nonce = randomUUID();
  const context = await browser!.newContext({ serviceWorkers: 'block', acceptDownloads: false, ignoreHTTPSErrors: false, userAgent: 'Oddhound/1.0 (+https://oddhound.online/bot)' });
  let browserResult = '';
  try {
    const page = await context.newPage();
    await page.goto(`${primary}/page`, { waitUntil: 'load', timeout: 15_000 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      browserResult = await Promise.race([op(page, nonce), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('canary_operation_timeout')), 12_000); })]);
    } finally { if (timer) clearTimeout(timer); }
    const arrivals = (await events()).filter((x) => x.nonce === nonce);
    const passed = judge(arrivals, browserResult);
    checks.push({ id: `GT-${String(checks.length + 1).padStart(2, '0')}`, name, passed, expected, nonce, browserResult, arrivals });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  } finally { await context.close(); }
}

try {
  await mkdir(work, { recursive: true });
  execFileSync('python', ['tests/lab/gateway-evaluation-certificates.py', work], { stdio: 'pipe', timeout: 30_000 });
  await mkdir(trust);
  await copyFile(resolve(work, 'ca.pem'), resolve(trust, 'ca.pem'));
  await copyFile('tests/lab/gateway-evaluation-target.mjs', resolve(work, 'target.mjs'));
  docker(['network', 'create', '--internal', '--subnet', '93.184.216.0/24', '--label', `oddhound.evaluation=${id}`, network]);
  created.network = true;
  docker(['network', 'create', '--label', `oddhound.evaluation=${id}`, controlNetwork]);
  created.controlNetwork = true;
  docker(['run', '-d', '--name', targetName, '--network', controlNetwork, '--label', `oddhound.evaluation=${id}`, '-p', '127.0.0.1::8080', '--mount', `type=bind,source=${work},target=/evaluation-target,readonly`, '--entrypoint', 'node', 'oddhound-claude-fixture:dev', '/evaluation-target/target.mjs']);
  created.target = true;
  docker(['network', 'connect', '--ip', '93.184.216.10', '--alias', 'fixture.test', '--alias', 'api.test', '--alias', 'resource.test', '--alias', 'badcert.test', network, targetName]);
  if (docker(['inspect', targetName, '--format', '{{.State.Running}}']) !== 'true') throw new Error('Synthetic target exited before published-port discovery');
  admin = `http://${docker(['port', targetName, '8080/tcp'])}`;
  for (let i = 0; i < 40; i++) { if (await fetch(`${admin}/health`).then((r) => r.ok, () => false)) break; await delay(100); }
  if (!(await fetch(`${admin}/health`)).ok) throw new Error('Synthetic target did not become ready');
  const policy = { version: 1, runId: id, primaryOrigin: primary, apiOrigins: [api], writes: true, deniedPathPrefixes: ['/forbidden'], deniedPathKeywords: [], expiresAt: Date.now() + 20 * 60_000, limits: { requests: 30_000, concurrent: 6, resourceBytes: 8_388_608, totalBytes: 1_073_741_824 } };
  docker(['run', '-d', '--name', gatewayName, '--network', controlNetwork, '--label', `oddhound.evaluation=${id}`, '--cap-add', 'NET_ADMIN', '--security-opt', `seccomp=${resolve('infra/docker/playwright-seccomp-profile.json')}`, '--memory', '2g', '--pids-limit', '512', '-p', '127.0.0.1::3000', '-e', `RUN_WS_PATH=${wsPath}`, '-e', `ODDHOUND_EVALUATION_POLICY=${JSON.stringify(policy)}`, '-e', 'ODDHOUND_EVALUATION_LAB=1', '--mount', `type=bind,source=${trust},target=/evaluation-trust,readonly`, image]);
  created.gateway = true;
  imageId = docker(['inspect', gatewayName, '--format', '{{.Image}}']);
  docker(['network', 'connect', network, gatewayName]);
  for (let i = 0; i < 120; i++) {
    gatewayLogs = docker(['logs', gatewayName]);
    if (gatewayLogs.includes('"browserServer":"ready"') || gatewayLogs.includes('"browserServer": "ready"')) break;
    if (docker(['inspect', gatewayName, '--format', '{{.State.Running}}']) !== 'true') throw new Error(`Gateway exited before ready: ${gatewayLogs}`);
    await delay(500);
  }
  if (!gatewayLogs.includes('ready')) throw new Error('Gateway did not become ready');
  browser = await chromium.connect(`ws://${docker(['port', gatewayName, '3000/tcp'])}${wsPath}`, { timeout: 15_000 });
  sandbox = await checkChromiumSandbox(browser);
  browserVersion = browser.version();
  if (sandbox !== 'sandbox_on') throw new Error(`Chromium sandbox verdict ${sandbox}`);
  // Native transport errors bypass mitmproxy addon response hooks in both HTTP protocols.
  // Use the browser UID and existing proxy exception, with verified ephemeral CA and no secrets.
  docker(['cp', resolve('tests/lab/gateway-native-error-control.mjs'), `${gatewayName}:/tmp/gateway-native-error-control.mjs`]);
  for (const protocol of ['http/1.1', 'h2']) for (const mode of ['transport-failure', 'target-502']) {
    const nonce = randomUUID();
    const result = docker(['exec', '--user', 'pwuser', gatewayName, '/usr/local/bin/node26', '/tmp/gateway-native-error-control.mjs', protocol, nonce, mode]);
    const got = JSON.parse(result) as { protocol: string; status: number; server: string | null; blocked: string | null };
    const arrivals = (await events()).filter(x => x.nonce === nonce);
    const proxyError = mode === 'transport-failure';
    const name = `native ${protocol} ${proxyError ? 'transport error attributed' : 'genuine 502 strips spoofed attribution'}`;
    const passed = got.protocol === protocol && got.status === 502 && arrivals.some(x => x.path === `/${mode}`) && (proxyError ? got.server === 'oddhound-evaluation-gateway/12.3.1' : got.server === null && got.blocked === null);
    checks.push({ id: `GT-${String(checks.length + 1).padStart(2, '0')}`, name, passed, expected: proxyError ? 'negotiated native protocol; proxy 502 attributed; target sent no HTTP response' : 'genuine target 502 remains unattributed even with spoofed headers', nonce, browserResult: result, arrivals });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  }
  for (const kind of ['transport-failure', 'target-502', 'target-502?spoof=1'] as const) {
    const proxyError = kind === 'transport-failure';
    await check(`${kind} sentinel attribution control`, proxyError ? 'gateway 502 excluded from target findings' : 'real target 502 remains a finding, including spoofed gateway headers', async (p, nonce) => {
      const signals: Signal[] = [];
      attachSentinels(p, origin => origin === primary, signal => signals.push(signal));
      const url = `${primary}/${kind}${kind.includes('?') ? '&' : '?'}nonce=${nonce}`;
      const responsePromise = p.waitForResponse(url);
      await p.evaluate(async url => { await fetch(url).then(r => r.text()); }, url);
      const response = await responsePromise;
      await delay(50);
      return JSON.stringify({ status: response.status(), reason: gatewayBlockReason(response), server: response.headers().server ?? null, signals: signals.map(s => s.kind) });
    }, (a, result) => {
      const got = JSON.parse(result) as { status: number; reason: string | null; signals: string[] };
      return a.some(x => x.path === `/${kind.split('?')[0]}`) && got.status === 502 && (proxyError ? got.reason === 'upstream_error' && !got.signals.includes('http_5xx') : got.reason === null && got.signals.includes('http_5xx'));
    });
  }
  await check('same-origin active POST', 'one primary POST with unchanged synthetic body', (p, n) => post(p, `${primary}/sink?nonce=${n}`, n), (a) => sink(a, 'fixture.test', 'POST').some((x) => x.body === `synthetic=${x.nonce}`));
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    await check(`verified API ${method}`, 'one API write from verified UI Origin', (p, n) => post(p, `${api}/sink?nonce=${n}`, n, method), (a) => sink(a, 'api.test', method).some((x) => x.origin === primary));
  }
  await check('resource CSS positive control', 'resource CSS reached', (p, n) => p.evaluate((url) => new Promise<string>((done) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url; l.onload = () => done('loaded'); l.onerror = () => done('error'); document.head.append(l); }), `${resource}/asset.css?nonce=${n}`), (a, r) => r === 'loaded' && a.some((x) => x.host === 'resource.test' && x.path === '/asset.css'));
  await check('twelve parallel resources are queued and all load', '12 resource CSS responses; destination concurrency at most 6', (p, n) => p.evaluate(async (base) => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => new Promise<string>((done) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `${base}&item=${i}`; l.onload = () => done('loaded'); l.onerror = () => done('error'); document.head.append(l); })));
    return `${results.filter((x) => x === 'loaded').length} loaded`;
  }, `${resource}/asset.css?nonce=${n}&delay=200`), (a, r) => r === '12 loaded' && a.filter((x) => x.host === 'resource.test' && x.path === '/asset.css').length === 12 && Math.max(...a.map((x) => x.activeForNonce ?? 0)) <= 6);
  for (const first of codes) for (const second of codes) {
    await check(`allowed redirect pair ${first}/${second}`, 'final permitted sink reached once with browser-correct method/body', (p, n) => post(p, redirect(first, redirect(second, `${primary}/sink`, n), n), n), (a) => {
      const expectedMethod = [307, 308].includes(first) && [307, 308].includes(second) ? 'POST' : 'GET';
      const got = sink(a, 'fixture.test');
      return got.length === 1 && got[0]!.method === expectedMethod && (expectedMethod !== 'POST' || got[0]!.body === `synthetic=${got[0]!.nonce}`);
    });
  }
  await check('direct resource POST blocked', 'no resource write, client denied', (p, n) => post(p, `${resource}/sink?nonce=${n}`, n), (a, r) => sink(a, 'resource.test').length === 0 && r !== 'response:200');
  for (const code of [307, 308]) {
    await check(`off-origin ${code} body escape blocked`, 'no resource sink/body', (p, n) => post(p, redirect(code, `${resource}/sink`, n), n), (a, r) => sink(a, 'resource.test').length === 0 && r !== 'response:200');
  }
  for (const code of codes) {
    await check(`off-origin ${code} navigation blocked`, 'no resource destination request', async (p, n) => { try { const r = await p.goto(redirect(code, `${resource}/sink`, n), { waitUntil: 'load', timeout: 10_000 }); return `response:${r?.status()}`; } catch (e) { return `error:${String(e)}`; } }, (a, r) => sink(a, 'resource.test').length === 0 && r !== 'response:200');
  }
  for (const destination of [primary, api]) {
    await check(`resource frame cannot write ${destination}`, 'resource frame loads; no borrowed primary/API write', async (p, n) => {
      await p.evaluate((url) => new Promise<void>((done) => { const f = document.createElement('iframe'); f.src = url; f.onload = () => done(); document.body.append(f); }), `${resource}/frame?nonce=${n}`);
      const frame = p.frames().find((f) => f.url().startsWith(`${resource}/frame`));
      if (!frame) throw new Error('Resource frame missing');
      return frame.evaluate(async ({ url, n }) => { try { const r = await fetch(url, { method: 'POST', body: `synthetic=${n}`, mode: 'no-cors' }); return `response:${r.status}`; } catch (e) { return `error:${String(e)}`; } }, { url: `${destination}/sink?nonce=${n}`, n });
    }, (a) => a.some((x) => x.host === 'resource.test' && x.path === '/frame') && sink(a, new URL(destination).hostname).length === 0);
  }
  for (const destination of [primary, api, resource]) {
    const allowed = destination !== resource;
    await check(`worker ${allowed ? 'approved' : 'denied'} POST ${destination}`, allowed ? 'verified worker POST reaches sink' : 'no resource worker write', (p, n) => p.evaluate(({ url, n }) => new Promise<string>((done) => { const w = new Worker('/worker.js'); const timer = setTimeout(() => { w.terminate(); done('timeout'); }, 4_000); w.onmessage = ({ data }) => { clearTimeout(timer); w.terminate(); done(String(data)); }; w.onerror = () => { clearTimeout(timer); w.terminate(); done('error'); }; w.postMessage({ url, body: `synthetic=${n}` }); }), { url: `${destination}/sink?nonce=${n}`, n }), (a) => sink(a, new URL(destination).hostname, 'POST').length === (allowed ? 1 : 0));
  }
  // The direct positive control runs inside the synthetic fixture container, never outside the lab.
  const positiveNonce = randomUUID();
  const wsControl = docker(['exec', targetName, 'node', '-e', `const https=require('node:https'),fs=require('node:fs');const r=https.request('https://resource.test/socket?nonce=${positiveNonce}',{ca:fs.readFileSync('/evaluation-target/ca.pem'),headers:{Upgrade:'websocket',Connection:'Upgrade','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ=='}},()=>{});r.on('upgrade',(_r,s)=>{console.log('opened');s.destroy()});r.on('error',()=>process.exit(1));r.end();`]);
  const positiveArrivals = (await events()).filter((x) => x.nonce === positiveNonce);
  checks.push({ id: `GT-${String(checks.length + 1).padStart(2, '0')}`, name: 'socket listener positive control', expected: 'owned listener accepts valid TLS WebSocket upgrade', passed: wsControl === 'opened' && positiveArrivals.some((x) => x.kind === 'websocket'), nonce: positiveNonce, browserResult: wsControl, arrivals: positiveArrivals });
  for (const destination of [primary, api, resource]) {
    await check(`unsupported socket blocked ${destination}`, 'no destination WebSocket handshake', (p, n) => socket(p, `${destination.replace('https:', 'wss:')}/socket?nonce=${n}`), (a, r) => r !== 'opened' && !a.some((x) => x.kind === 'websocket'));
  }
  const tlsNonce = randomUUID();
  const tlsControl = docker(['exec', targetName, 'node', '-e', `const https=require('node:https'),fs=require('node:fs');https.get('https://badcert.test/sink?nonce=${tlsNonce}',{ca:fs.readFileSync('/evaluation-target/untrusted-ca.pem')},r=>{r.resume();r.on('end',()=>console.log(r.statusCode))}).on('error',()=>process.exit(1));`]);
  const tlsArrivals = (await events()).filter((x) => x.nonce === tlsNonce);
  checks.push({ id: `GT-${String(checks.length + 1).padStart(2, '0')}`, name: 'untrusted-certificate listener positive control', expected: 'listener works when trusted explicitly inside fixture only', passed: tlsControl === '200' && tlsArrivals.some((x) => x.kind === 'http'), nonce: tlsNonce, browserResult: tlsControl, arrivals: tlsArrivals });
  await check('untrusted upstream certificate refused', 'badcert origin receives no HTTP request; TLS fails', (p, n) => p.evaluate((url) => new Promise<string>((done) => { const image = new Image(); image.onload = () => done('loaded'); image.onerror = () => done('error'); image.src = url; document.body.append(image); }), `https://badcert.test/sink?nonce=${n}`), (a, r) => r === 'error' && !a.some((x) => x.kind === 'http' && x.host === 'badcert.test'));
} catch (e) {
  fatal = scrub((e as Error).stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (created.gateway) { try { gatewayLogs = scrub(docker(['logs', gatewayName])); } catch {} }
  if (created.target) { try { targetLogs = docker(['logs', targetName]); } catch {} }
  for (const [kind, name] of [['gateway', gatewayName], ['target', targetName]] as const) {
    if (!created[kind]) continue;
    try { docker(['rm', '-f', name]); cleanup[kind] = !docker(['ps', '-aq', '--filter', `name=^/${name}$`]); } catch { cleanup[kind] = false; }
  }
  if (created.network) { try { docker(['network', 'rm', network]); cleanup.network = true; } catch { cleanup.network = false; } }
  if (created.controlNetwork) { try { docker(['network', 'rm', controlNetwork]); cleanup.controlNetwork = true; } catch { cleanup.controlNetwork = false; } }
}

const denials: Record<string, unknown>[] = gatewayLogs.split('\n').flatMap((line) => {
  try { const value = JSON.parse(line); return value.egress === 'denied' ? [value] : []; } catch { return []; }
});
for (const check of checks) {
  if (!/blocked|cannot write|worker denied|certificate refused|transport error attributed|transport-failure sentinel/.test(check.name)) continue;
  check.denials = denials.filter((d) => d.canaryNonce === check.nonce);
  check.passed = check.passed && check.denials.length > 0;
  if (check.name === 'untrusted upstream certificate refused') check.passed = check.passed && check.denials.some((d) => d.reason === 'upstream_error');
}
const failed = checks.filter((x) => !x.passed).length;
const report = { at: new Date().toISOString(), profile: 'opt-in gateway evaluation; internal Docker target network plus separate bridge for loopback control ports; synthetic HTTPS targets; no production enablement', node: process.version, playwright: JSON.parse(await readFile('node_modules/playwright/package.json', 'utf8')).version, chromium: browserVersion, sandbox, image, imageId, provider: 'none', mocked: 'synthetic target pages/endpoints only; real TLS, mitmproxy/smokescreen/firewall/Chromium and destination arrivals', result: fatal ? 'incomplete' : failed ? 'failed' : 'passed', passed: checks.length - failed, failed, fatal, cleanup, targetLogs, checks };
await mkdir(resolve('docs/evidence'), { recursive: true });
await writeFile(resolve(`docs/evidence/gateway-evaluation-tls-canary-${suffix}.json`), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(resolve(`docs/evidence/gateway-evaluation-tls-canary-${suffix}.log`), `${gatewayLogs}\n`);
await writeFile(resolve('docs/evidence/gateway-evaluation-tls-canary.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(resolve('docs/evidence/gateway-evaluation-tls-canary.log'), `${gatewayLogs}\n`);
console.log(JSON.stringify({ result: report.result, passed: report.passed, failed, sandbox, fatal, cleanup }));
process.exitCode = fatal || failed || Object.values(cleanup).some((x) => !x) ? 1 : 0;
