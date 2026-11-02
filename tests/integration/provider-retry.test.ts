// A transient model error (HTTP 500) is retried as an explicit, budgeted attempt instead of ending the run.
// Real worker pipeline (local Chromium runtime, ledgers in oddhound_test); SCRIPTED provider, not Meta inference.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { admitRun } from '../../packages/core/ledger/runs.ts';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { executeRun } from '../../packages/core/agent/execute-run.ts';
import { LocalBrowserRuntime } from '../../packages/core/browser/runtime.ts';
import { ProviderError, type ChatProvider, type ChatRequest, type ChatResult } from '../../packages/core/providers/types.ts';

const db = getPool();
let server: Server; let origin = ''; let port = 0; let recoveryMode = false; let sitemapMode = false; let brokenLinkMode = false;
const sitemapArrivals: string[] = [];
const brokenLinkArrivals: string[] = [];

beforeAll(async () => {
  await migrate(db);
  await db.query(`UPDATE settings SET value = 'false'::jsonb WHERE key = 'kill_switch'`);
  server = createServer((req, res) => {
    if (brokenLinkMode) {
      brokenLinkArrivals.push(req.url ?? '/');
      if (req.url === '/missing-api') return void res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
      if (req.url === '/missing-image') return void res.writeHead(404, { 'content-type': 'image/png' }).end();
      if (req.url === '/advertised-missing' || req.url === '/guessed-missing') return void res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Page unavailable</h1><img src="/missing-image" alt="Missing"><script>fetch("/missing-api")</script>');
      if (req.url === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end('<header><a href="/advertised-missing">Missing advertised destination</a></header><h1>Home</h1>');
    }
    if (sitemapMode) {
      sitemapArrivals.push(req.url ?? '/');
      if (req.url === '/robots.txt') return void res.end(`Sitemap: ${origin}/sitemap.xml`);
      if (req.url === '/sitemap.xml') return void res.end(`<sitemapindex>${[1, 2, 3, 4, 5, 6].map(n => `<sitemap><loc>${origin}/map-${n}.xml</loc></sitemap>`).join('')}<sitemap><loc>${origin}/must-not-fetch.xml?auth_token=synthetic-url-secret</loc></sitemap></sitemapindex>`);
      const map = /^\/map-(\d+)\.xml$/.exec(req.url ?? '');
      if (map) return void res.end(`<urlset><url><loc>${origin}/section-${map[1]}</loc></url><url><loc>${origin}/private?refresh_token=synthetic-url-secret</loc></url>${map[1] === '6' ? ' '.repeat(530_000) : ''}</urlset>`);
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><body><main><h1>${req.url === '/next' ? 'Next page' : 'Home'}</h1>${recoveryMode && req.url === '/' ? '<a href="/next">Next page</a>' : ''}</main></body></html>`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const a = server.address();
  port = typeof a === 'object' && a ? a.port : 0;
  origin = `http://127.0.0.1:${port}`;
});
afterAll(async () => { server?.close(); await closePool(); });

/** SCRIPTED TEST PROVIDER — not Meta inference. Fails its first call with a server error, then finishes. */
class FlakyOnce implements ChatProvider {
  readonly id = 'test-double';
  readonly model = 'heuristic-planner';
  readonly isMetaModel = false;
  readonly label = 'Scripted test provider (not Meta inference)';
  readonly capability = { tools: true, images: false, imagesInToolMessages: false, toolChoiceValues: ['auto'] as const, structuredOutput: false };
  calls = 0;
  async chat(_req: ChatRequest): Promise<ChatResult> {
    if (++this.calls === 1) throw new ProviderError('http', 'HTTP 500: internal server error', true, 500);
    return {
      message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_finish', type: 'function', function: { name: 'finish_run', arguments: JSON.stringify({ summary: 'Recovered after a server error.' }) } }] },
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, finishReason: 'tool_calls', requestId: null, model: this.model,
    };
  }
}

class StuckPlanner extends FlakyOnce {
  readonly leaveOpenCharter: boolean;
  constructor(leaveOpenCharter = false) { super(); this.leaveOpenCharter = leaveOpenCharter; }
  override async chat(_req: ChatRequest): Promise<ChatResult> {
    if (++this.calls > 12) throw new Error('Test watchdog: no-progress recovery failed');
    const name = this.leaveOpenCharter && this.calls === 1 ? 'plan_tests' : 'finish_run';
    const args = name === 'plan_tests' ? { charters: [{ id: 'open', area: 'Record persistence', risk: 'high', technique: 'Save and reload', status: 'not_run' }] } : { summary: 'Repeated unsupported finish request' };
    return { message: { role: 'assistant', content: null, tool_calls: [{ id: `call_${this.calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, finishReason: 'tool_calls', requestId: null, model: this.model };
  }
}

class InvalidPlanner extends FlakyOnce {
  recover = false;
  override async chat(_req: ChatRequest): Promise<ChatResult> {
    if (++this.calls > 8) throw new Error('Invalid-call test watchdog');
    const name = this.recover && this.calls === 3 ? 'observe' : 'finish_run';
    const args = name === 'observe' ? {} : { summary: this.recover && this.calls === 6 ? 'Arguments corrected; no navigation remained.' : 'done' };
    return { message: { role: 'assistant', content: null, tool_calls: [{ id: `invalid_${this.calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, finishReason: 'tool_calls', requestId: null, model: this.model };
  }
}

class BrokenLinkPlanner extends FlakyOnce {
  override async chat(_req: ChatRequest): Promise<ChatResult> {
    const steps = [{ name: 'navigate', args: { path: '/guessed-missing' } }, { name: 'explore_next', args: { count: 8 } }, { name: 'finish_run', args: { summary: 'Visited the advertised link and distinguished it from an invented URL.' } }];
    const step = steps[this.calls++] ?? steps.at(-1)!;
    if (this.calls > 8) throw new Error('Broken-link test watchdog');
    return { message: { role: 'assistant', content: null, tool_calls: [{ id: `link_${this.calls}`, type: 'function', function: { name: step.name, arguments: JSON.stringify(step.args) } }] }, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, finishReason: 'tool_calls', requestId: null, model: this.model };
  }
}

describe('transient model errors', () => {
  it('records an advertised navigation 404 while suppressing a guessed-URL 404', async () => {
    brokenLinkMode = true; brokenLinkArrivals.length = 0;
    try {
      await db.query('TRUNCATE runs CASCADE');
      const provider = new BrokenLinkPlanner();
      const admitted = await admitRun(db, { principal: `test:advertised404:${Date.now()}`, ownerId: null, projectId: null, mode: 'demo_target', contract: demoTargetContract(origin), spendAccount: 'development' });
      if (!admitted.ok) throw new Error(admitted.reason);
      expect(await executeRun({ db, runtime: new LocalBrowserRuntime(), providers: [provider], workerId: 'link-test', allowOfflineTestDouble: true, lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } }, admitted.runId)).toBe('completed');
      const events = (await db.query('SELECT type,payload FROM run_events WHERE run_id=$1 ORDER BY seq', [admitted.runId])).rows;
      const signals = events.filter(e => e.type === 'signal.detected' && e.payload.kind === 'http_404');
      expect(signals).toHaveLength(1);
      expect(signals[0].payload.detail).toContain('/advertised-missing');
      expect(signals[0].payload.detail).not.toContain('/guessed-missing');
      expect(brokenLinkArrivals).toContain('/missing-api');
      expect(brokenLinkArrivals).toContain('/missing-image');
      expect(events.filter(e => e.type === 'finding.candidate' && e.payload.ruleId === 'B6')).toHaveLength(1);
      const findings = (await db.query('SELECT title FROM findings WHERE run_id=$1', [admitted.runId])).rows;
      expect(findings.some(f => f.title.includes('/advertised-missing'))).toBe(true);
      expect(findings.some(f => f.title.includes('/guessed-missing'))).toBe(false);
    } finally { brokenLinkMode = false; }
  }, 30_000);
  it.each([false, true])('handles repeated invalid arguments without burning the allowance (recovery=%s)', async (recover) => {
    await db.query('TRUNCATE runs CASCADE');
    const provider = new InvalidPlanner(); provider.recover = recover;
    const admitted = await admitRun(db, { principal: `test:invalid:${recover}:${Date.now()}`, ownerId: null, projectId: null, mode: 'demo_target', contract: demoTargetContract(origin), spendAccount: 'development' });
    if (!admitted.ok) throw new Error(admitted.reason);
    expect(await executeRun({ db, runtime: new LocalBrowserRuntime(), providers: [provider], workerId: 'invalid-test', allowOfflineTestDouble: true, lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } }, admitted.runId)).toBe(recover ? 'completed' : 'stopped');
    expect(provider.calls).toBe(recover ? 6 : 3);
    const events = (await db.query('SELECT type,payload FROM run_events WHERE run_id=$1 ORDER BY seq', [admitted.runId])).rows;
    expect(events.some(e => e.type === 'exploration.stalled' && e.payload.reason === 'repeated_invalid_tool_arguments')).toBe(!recover);
    if (!recover) {
      expect(events.find(e => e.type === 'coverage.gaps')?.payload.reason).toBe('exploration_stalled');
      expect(events.some(e => e.type === 'run.completed')).toBe(false);
    }
  }, 30_000);
  it('retries an HTTP 500 once, logged and budgeted, and the run completes', async () => {
    await db.query('TRUNCATE runs CASCADE');
    const provider = new FlakyOnce();
    const admitted = await admitRun(db, { principal: `test:retry:${Date.now()}`, ownerId: null, projectId: null, mode: 'demo_target', contract: demoTargetContract(origin), spendAccount: 'development' });
    if (!admitted.ok) throw new Error(admitted.reason);
    const deps = { db, runtime: new LocalBrowserRuntime(), providers: [provider], workerId: 'retry-test', allowOfflineTestDouble: true, agentMode: 'batch' as const, lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } };
    expect(await executeRun(deps, admitted.runId)).toBe('completed');
    expect(provider.calls).toBe(2);
    const events = (await db.query<{ type: string; payload: any }>('SELECT type, payload FROM run_events WHERE run_id = $1 ORDER BY seq', [admitted.runId])).rows;
    expect(events.find((e) => e.type === 'provider.retry')?.payload).toMatchObject({ reason: 'http_500', billed: true });
    expect(events.some((e) => e.type === 'provider.error')).toBe(false);
    expect(events.find(e => e.type === 'run.timings')?.payload.model).toMatchObject({ calls: 2 });
    expect(events.find(e => e.type === 'run.timings')?.payload.model.retryWaitMs).toBeGreaterThanOrEqual(1_900);
    // The failed attempt may have been billed, so it stays counted; the retry had its own reservation.
    const rows = (await db.query<{ request_key: string; state: string }>('SELECT request_key, state FROM spend_reservations WHERE run_id = $1 ORDER BY created_at', [admitted.runId])).rows;
    expect(rows.map((x) => [x.request_key.split(':').slice(1).join(':'), x.state])).toEqual([['turn:0', 'unknown'], ['turn:0:retry1', 'settled']]);
  }, 120_000);

  it('recovers repeated finish calls by actually visiting known scoped pages', async () => {
    recoveryMode = true;
    try {
      await db.query('TRUNCATE runs CASCADE');
      const provider = new StuckPlanner();
      const admitted = await admitRun(db, { principal: `test:recovery:${Date.now()}`, ownerId: null, projectId: null, mode: 'demo_target', contract: demoTargetContract(origin), spendAccount: 'development' });
      if (!admitted.ok) throw new Error(admitted.reason);
      expect(await executeRun({ db, runtime: new LocalBrowserRuntime(), providers: [provider], workerId: 'recovery-test', allowOfflineTestDouble: true, lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } }, admitted.runId)).toBe('completed');
      const events = (await db.query('SELECT type,payload FROM run_events WHERE run_id=$1 ORDER BY seq', [admitted.runId])).rows;
      expect(events.filter(e => e.type === 'finish.refused')).toHaveLength(3);
      expect(events.some(e => e.type === 'exploration.recovery')).toBe(true);
      const last = events.filter(e => e.type === 'exploration.updated').at(-1).payload.summary;
      expect(last).toMatchObject({ visited: 2, pendingRoutes: 0, outcomeChecked: 0 });
      expect(provider.calls).toBe(4);
    } finally { recoveryMode = false; }
  }, 30_000);

  it('stops truthfully with preserved gaps when repeated finish requests leave an open charter', async () => {
    await db.query('TRUNCATE runs CASCADE');
    const provider = new StuckPlanner(true);
    const admitted = await admitRun(db, { principal: `test:stalled:${Date.now()}`, ownerId: null, projectId: null, mode: 'demo_target', contract: demoTargetContract(origin), spendAccount: 'development' });
    if (!admitted.ok) throw new Error(admitted.reason);
    expect(await executeRun({ db, runtime: new LocalBrowserRuntime(), providers: [provider], workerId: 'stalled-test', allowOfflineTestDouble: true, lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } }, admitted.runId)).toBe('stopped');
    const events = (await db.query('SELECT type,payload FROM run_events WHERE run_id=$1 ORDER BY seq', [admitted.runId])).rows;
    expect(events.find(e => e.type === 'coverage.gaps')?.payload).toMatchObject({ reason: 'exploration_stalled', open: ['open'] });
    expect(events.some(e => e.type === 'run.completed')).toBe(false);
  }, 30_000);

  it('continues beyond four sitemap documents, reaches a later branch and reports truncation without leaking token URLs', async () => {
    sitemapMode = true; sitemapArrivals.length = 0;
    try {
      await db.query('TRUNCATE runs CASCADE');
      const provider = new StuckPlanner();
      const admitted = await admitRun(db, { principal: `test:sitemaps:${Date.now()}`, ownerId: null, projectId: null, mode: 'demo_target', contract: demoTargetContract(origin), spendAccount: 'development' });
      if (!admitted.ok) throw new Error(admitted.reason);
      expect(await executeRun({ db, runtime: new LocalBrowserRuntime(), providers: [provider], workerId: 'sitemap-test', allowOfflineTestDouble: true, lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } }, admitted.runId)).toBe('completed');
      expect(sitemapArrivals).toContain('/map-6.xml');
      expect(sitemapArrivals).toContain('/section-6');
      expect(sitemapArrivals.some(path => path.includes('synthetic-url-secret'))).toBe(false);
      const events = (await db.query('SELECT type,payload FROM run_events WHERE run_id=$1 ORDER BY seq', [admitted.runId])).rows;
      expect(JSON.stringify(events)).not.toContain('synthetic-url-secret');
      expect(events.find(e => e.type === 'site.discovery_incomplete')?.payload.remainingSitemaps).toBe(3);
      expect(events.find(e => e.type === 'site.discovery_progress')?.payload).toMatchObject({ read: 7, remainingSitemaps: 0, truncatedDocuments: 1 });
      expect(events.find(e => e.type === 'coverage.gaps')?.payload.discoveryLimits).toMatchObject({ remainingSitemaps: 0, truncatedDocuments: 1 });
    } finally { sitemapMode = false; }
  }, 30_000);
});
