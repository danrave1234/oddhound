// Real local browser, policy and PostgreSQL ledgers. Scripted zero-price provider, no Meta calls.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { admitRun } from '../../packages/core/ledger/runs.ts';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { executeRun } from '../../packages/core/agent/execute-run.ts';
import { LocalBrowserRuntime } from '../../packages/core/browser/runtime.ts';
import type { ChatProvider, ChatRequest, ChatResult } from '../../packages/core/providers/types.ts';

const db = getPool();
let site: Server, outsider: Server, origin: string, offOrigin: string, port: number;
const arrivals: string[] = [];
let offArrivals = 0, writes = 0;
const independent = ['/catalog/entry', '/organizations/entry', '/articles/entry'];
const listen = async (server: Server) => { await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); return (server.address() as { port: number }).port; };

beforeAll(async () => {
  await migrate(db);
  await db.query(`UPDATE settings SET value='false'::jsonb WHERE key='kill_switch'`);
  outsider = createServer((_req, res) => { offArrivals++; res.end('Outside scope'); });
  offOrigin = `http://127.0.0.1:${await listen(outsider)}`;
  site = createServer((req, res) => {
    arrivals.push(req.url ?? '/');
    if (req.method !== 'GET') { writes++; return void res.end('Unexpected write'); }
    if (req.url === '/robots.txt') return void res.end(`Sitemap: ${origin}/sitemap.xml`);
    if (req.url === '/sitemap.xml') return void res.end(`<urlset>${independent.map(path => `<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>`);
    const path = req.url ?? '/', section = /^\/preferences\/section-(\d+)$/.exec(path);
    const next = section && Number(section[1]) < 3 ? Number(section[1]) + 1 : path === '/' ? 0 : null;
    const moreDestination = path === '/articles/entry' ? '/analysis/late-detail' : '/preferences/section-0';
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><body>
      <header>
        <button id="more" aria-haspopup="menu">More</button>
        <button id="account" aria-haspopup="menu">Open account menu</button>
        <button id="sidebar" aria-expanded="false">Toggle navigation</button>
        <button id="search">Search</button><button id="theme">Theme</button>
        <button id="notifications" aria-haspopup="menu">Notifications</button>
        <button id="quick">Open resources</button>
      </header>
      <aside><div id="revealed"></div>
        ${next === null ? '' : `<a href="/preferences/section-${next}">Next preference section</a>`}
        <a href="/denied">Excluded operation</a><a href="${offOrigin}/outside">External destination</a>
      </aside>
      <main><h1>${path}</h1><p>${'Ordinary synthetic page content for discovery and planning. '.repeat(12)}</p><output id="state"></output></main>
      <script>
        for(const id of ['account','sidebar','search','theme','notifications']) document.getElementById(id).onclick=()=>{
          document.getElementById('state').textContent=id+' panel opened';
          if(id==='sidebar')document.getElementById(id).setAttribute('aria-expanded','true');
        };
        document.getElementById('more').onclick=()=>setTimeout(()=>{
          if(!document.getElementById('late-link'))document.getElementById('revealed').innerHTML='<a id="late-link" href="${moreDestination}">Additional destination</a>';
        },120);
        document.getElementById('quick').onclick=()=>location.assign('/utilities/entry');
      </script></body></html>`);
  });
  port = await listen(site); origin = `http://127.0.0.1:${port}`;
});
afterAll(async () => { site?.close(); outsider?.close(); await closePool(); });

class FairnessPlanner implements ChatProvider {
  readonly id = 'test-double'; readonly model = 'heuristic-planner'; readonly isMetaModel = false;
  readonly label = 'Recorded repeated-shell exploration provider';
  readonly capability = { tools: true, images: false, imagesInToolMessages: false, toolChoiceValues: ['auto'] as const, structuredOutput: false };
  calls = 0;
  async chat(request: ChatRequest): Promise<ChatResult> {
    if (++this.calls > 45) throw new Error('Fixture watchdog: discovery did not drain');
    const last = [...request.messages].reverse().find(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('EXPLORATION FRONTIER:'));
    const drained = typeof last?.content === 'string' && /; 0 unvisited routes; 0 navigation controls unopened;/.test(last.content);
    const name = this.calls <= 3 || drained ? 'finish_run' : 'explore_next';
    const args = name === 'finish_run' ? { summary: 'Navigation-only fixture; control effects remain unchecked and scope exclusions remain gaps.' } : { count: 8 };
    return { message: { role: 'assistant', content: null, tool_calls: [{ id: `fair_${this.calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }, finishReason: 'tool_calls', requestId: null, model: this.model };
  }
}

it('reaches unrelated branches before repeated shell controls and retains late and onclick-only navigation', async () => {
  await db.query('TRUNCATE runs CASCADE');
  const contract = demoTargetContract(origin);
  contract.description = 'Owned multi-branch synthetic navigation fixture'; contract.goals = [];
  contract.testMode = 'observation_only'; contract.registration.allowed = false;
  contract.deniedPathPrefixes = ['/denied'];
  const admission = await admitRun(db, { principal: `test:fairness:${randomUUID()}`, ownerId: null, projectId: null, mode: 'demo_target', contract, spendAccount: 'development' });
  if (!admission.ok) throw new Error(admission.reason);
  expect(await executeRun({ db, runtime: new LocalBrowserRuntime(), providers: [new FairnessPlanner()], workerId: 'fairness-test', allowOfflineTestDouble: true,
    lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } }, admission.runId)).toBe('completed');
  const events = (await db.query('SELECT type,payload FROM run_events WHERE run_id=$1 ORDER BY seq', [admission.runId])).rows;
  const actions = (await db.query('SELECT seq,tool,args,url_after FROM actions WHERE run_id=$1 ORDER BY seq', [admission.runId])).rows;
  for (const path of independent) {
    const first = actions.find(a => new URL(a.url_after).pathname === path);
    expect(first, `actual arrival at independent branch ${path}`).toBeDefined();
    expect(first.seq, `independent branch ${path} reached before shell churn`).toBeLessThanOrEqual(10);
    expect(arrivals).toContain(path);
  }
  for (const path of ['/analysis/late-detail', '/utilities/entry']) expect(arrivals).toContain(path);
  expect(offArrivals).toBe(0); expect(arrivals).not.toContain('/denied'); expect(writes).toBe(0);
  const updates = events.filter(e => e.type === 'exploration.updated');
  const entries = new Map<string, any>();
  for (const update of updates) for (const entry of update.payload.changes) entries.set(entry.id, entry);
  const articles = [...entries.values()].filter(e => e.kind === 'control' && e.path === '/articles/entry');
  expect(articles.map(e => e.label)).toEqual(expect.arrayContaining(['Open account menu', 'Search', 'Theme', 'Notifications', 'More', 'Open resources']));
  expect(articles.every(e => !e.checked)).toBe(true);
  // After breadth, repeated per-page controls are still inventory; no global click claimed them tested.
  const early = updates.find(e => e.payload.summary.visited >= 4);
  expect(early.payload.summary.pendingControls).toBeGreaterThan(10);
  expect(updates.at(-1).payload.summary).toMatchObject({ pendingRoutes: 0, pendingControls: 0, outcomeChecked: 0, excluded: 1 });
  expect(events.filter(e => e.type === 'finish.refused').length).toBeGreaterThanOrEqual(3);
  expect(events.filter(e => e.type === 'coverage.updated').at(-1).payload.outcomeChecked).toBe(0);
  expect(events.some(e => e.type === 'browser.ready' && e.payload.sandbox === 'sandbox_on')).toBe(true);
}, 150_000);
