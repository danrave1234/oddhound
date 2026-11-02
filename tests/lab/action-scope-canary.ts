// Local-only regression probe for the production attachScope implementation.
// Both origins and every recorded write/socket belong to this harness on loopback. No target site,
// provider, database, credentials or paid runtime is used. This is action-scope evidence only, not
// public-IP/egress containment proof. A forbidden arrival is a failed check, even if the page errors.
// Run: .tools/node26/node.exe tests/lab/action-scope-canary.ts
import { createServer, type Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { attachScope, type ScopeDecision, type ScopePolicy } from '../../packages/core/browser/scope.ts';
import { checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';

type Arrival = { origin: string; nonce: string; kind: 'http' | 'websocket'; method: string; path: string; body: string };
type Check = { id: string; name: string; expected: string; passed: boolean; nonce: string; arrivals: Arrival[]; decisions: ScopeDecision[]; browserResult: string };
const arrivals: Arrival[] = [];
const checks: Check[] = [];
const servers: Server[] = [];
let primary = '', resource = '';
let browser: Browser | undefined;

async function serve(label: string): Promise<string> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local.test');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const nonce = url.searchParams.get('nonce') ?? '';
    const body = Buffer.concat(chunks).toString();
    arrivals.push({ origin: label, nonce, kind: 'http', method: req.method ?? '', path: url.pathname, body });
    // An injected host extension cannot make these probe pages fetch a third origin.
    res.setHeader('content-security-policy', `default-src 'none'; script-src 'unsafe-inline'; connect-src ${primary} ${resource} ${primary.replace('http:', 'ws:')} ${resource.replace('http:', 'ws:')}; frame-src ${primary} ${resource}`);
    if (url.pathname.startsWith('/redirect')) {
      const code = Number(url.pathname.slice('/redirect'.length));
      const target = url.searchParams.get('to') === 'resource' ? resource : primary;
      res.writeHead(code, { location: `${target}/sink?nonce=${nonce}` }).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end('<!doctype html><html><body>Owned action-scope canary</body></html>');
  });
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url ?? '/', 'http://local.test');
    arrivals.push({ origin: label, nonce: url.searchParams.get('nonce') ?? '', kind: 'websocket', method: req.method ?? '', path: url.pathname, body: '' });
    const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.on('error', () => {});
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    // The handshake proves a connection arrived; no messages or external data are needed.
    setTimeout(() => socket.destroy(), 100);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No canary address');
  return `http://127.0.0.1:${address.port}`;
}

const policy = (): ScopePolicy => ({ primaryOrigin: primary, apiOrigins: new Set(), writes: true, deniedPathPrefixes: [], deniedPathKeywords: [], handoffActive: false });
const post = async (page: Page, url: string, nonce: string) => page.evaluate(async ({ url, nonce }) => {
  try { const response = await fetch(url, { method: 'POST', body: `synthetic=${nonce}`, mode: 'no-cors' }); return `response:${response.status}:${response.type}`; }
  catch (error) { return `error:${String(error)}`; }
}, { url, nonce });
const socket = async (page: Page, url: string) => page.evaluate((url) => new Promise<string>((done) => {
  const ws = new WebSocket(url);
  const timer = setTimeout(() => { ws.close(); done('timeout'); }, 2_000);
  ws.onopen = () => { clearTimeout(timer); ws.close(); done('opened'); };
  ws.onerror = () => { clearTimeout(timer); done('error'); };
}), url);

async function check(name: string, expected: string, scope: boolean, op: (page: Page, nonce: string, context: BrowserContext) => Promise<string>, judge: (a: Arrival[]) => boolean) {
  const nonce = randomUUID();
  const decisions: ScopeDecision[] = [];
  const context = await browser!.newContext({ serviceWorkers: 'block', acceptDownloads: false });
  try {
    if (scope) await attachScope(context, policy(), (d) => {
      // Host antivirus may inject unrelated resource URLs. Keep evidence limited to owned listeners.
      try { const u = new URL(d.url); if ([primary, resource].includes(u.origin.replace(/^ws:/, 'http:'))) decisions.push(d); } catch {}
    });
    const page = await context.newPage();
    await page.goto(`${primary}/page`, { waitUntil: 'load' });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const browserResult = await Promise.race([
      op(page, nonce, context),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Canary operation timed out: ${name}`)), 5_000); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    const matched = arrivals.filter((a) => a.nonce === nonce);
    const passed = judge(matched);
    checks.push({ id: `AS-${String(checks.length + 1).padStart(2, '0')}`, name, expected, passed, nonce, arrivals: matched, decisions, browserResult });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name} (${matched.filter((a) => a.path === '/sink' || a.kind === 'websocket').length} target arrival(s))`);
  } finally { await context.close(); }
}

const sink = (a: Arrival[], origin: string) => a.filter((x) => x.origin === origin && x.path === '/sink' && x.method === 'POST');
let fatal: string | undefined;
let sandbox = 'not_run', chromiumVersion = 'not_run';
try {
  primary = await serve('primary');
  resource = await serve('resource');
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true, args: ['--disable-background-networking'] });
  sandbox = await checkChromiumSandbox(browser);
  chromiumVersion = browser.version();
  await check('allowed same-origin POST', 'one primary POST', true, (p, n) => post(p, `${primary}/sink?nonce=${n}`, n), (a) => sink(a, 'primary').length === 1);
  await check('off-origin listener positive control (no scope)', 'one resource POST', false, (p, n) => post(p, `${resource}/sink?nonce=${n}`, n), (a) => sink(a, 'resource').length === 1);
  await check('direct off-origin POST denied', 'no resource POST', true, (p, n) => post(p, `${resource}/sink?nonce=${n}`, n), (a) => sink(a, 'resource').length === 0);
  await check('allowed same-origin 307 POST redirect', 'one primary POST with original body', true, (p, n) => post(p, `${primary}/redirect307?nonce=${n}`, n), (a) => sink(a, 'primary').some((x) => x.body === `synthetic=${x.nonce}`));
  for (const code of [307, 308]) {
    await check(`off-origin ${code} POST redirect denied`, 'no resource POST/body', true, (p, n) => post(p, `${primary}/redirect${code}?to=resource&nonce=${n}`, n), (a) => sink(a, 'resource').length === 0);
  }
  await check('resource frame cannot borrow primary write authority', 'resource frame loaded, no primary POST', true, async (page, nonce) => {
    await page.evaluate((url) => new Promise<void>((done) => { const frame = document.createElement('iframe'); frame.src = url; frame.onload = () => done(); document.body.append(frame); }), `${resource}/frame?nonce=${nonce}`);
    const frame = page.frames().find((f) => f.url().startsWith(`${resource}/frame`));
    if (!frame) throw new Error('Resource frame did not load');
    return frame.evaluate(async ({ target, nonce }) => {
      try { const r = await fetch(target, { method: 'POST', body: `synthetic=${nonce}`, mode: 'no-cors' }); return `response:${r.status}:${r.type}`; }
      catch (e) { return `error:${String(e)}`; }
    }, { target: `${primary}/sink?nonce=${nonce}`, nonce });
  }, (a) => a.some((x) => x.origin === 'resource' && x.path === '/frame') && sink(a, 'primary').length === 0);
  await check('socket listener positive control (no scope)', 'one resource socket handshake', false, (p, n) => socket(p, `${resource.replace('http:', 'ws:')}/socket?nonce=${n}`), (a) => a.filter((x) => x.origin === 'resource' && x.kind === 'websocket').length === 1);
  await check('off-origin socket denied', 'no resource socket handshake', true, (p, n) => socket(p, `${resource.replace('http:', 'ws:')}/socket?nonce=${n}`), (a) => !a.some((x) => x.origin === 'resource' && x.kind === 'websocket'));
} catch (error) {
  fatal = (error as Error).stack ?? String(error);
} finally {
  await browser?.close();
  await Promise.all(servers.map((s) => new Promise<void>((done) => { s.closeAllConnections(); s.close(() => done()); })));
}

const failed = checks.filter((c) => !c.passed).length;
const report = { at: new Date().toISOString(), node: process.version, playwright: (createRequire(import.meta.url)('playwright/package.json') as { version: string }).version, chromium: chromiumVersion, sandbox, profile: `local ${process.platform} Chromium; two owned loopback HTTP origins; action scope only`, provider: 'none', mocked: 'synthetic canary HTML/endpoints only; real Chromium, HTTP listeners and attachScope', result: fatal ? 'incomplete' : failed ? 'failed' : 'passed', passed: checks.length - failed, failed, fatal, checks };
const dir = resolve('docs/evidence');
await mkdir(dir, { recursive: true });
const path = resolve(dir, 'action-scope-local-canary.json');
await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ result: report.result, passed: report.passed, failed, sandbox, report: path, fatal }));
process.exitCode = failed || fatal ? 1 : 0;
