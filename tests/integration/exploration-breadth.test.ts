// Real local Chromium + PostgreSQL; recorded provider decisions, not paid Meta inference.
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
let server: Server, origin: string, port: number;
const arrivals = new Set<string>();
beforeAll(async () => {
  await migrate(db);
  server = createServer((req, res) => {
    if (req.url === '/robots.txt' || req.url === '/sitemap.xml') return void res.writeHead(404).end();
    if (req.url === '/' || /^\/page\/\d+$/.test(req.url ?? '')) arrivals.add(req.url!);
    const page = req.url === '/' ? 0 : Number(req.url?.slice(6));
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<h1>Section ${page}</h1>${page < 101 ? `<a href="/page/${page + 1}">Next section</a>` : ''}`);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port; origin = `http://127.0.0.1:${port}`;
});
afterAll(async () => { server?.close(); await closePool(); });

class BreadthProvider implements ChatProvider {
  readonly id = 'test-double'; readonly model = 'heuristic-planner'; readonly isMetaModel = false;
  readonly label = 'Recorded breadth fixture';
  readonly capability = { tools: true, images: false, imagesInToolMessages: false, toolChoiceValues: ['auto'] as const, structuredOutput: false };
  turn = 0;
  async chat(_req: ChatRequest): Promise<ChatResult> {
    const t = this.turn++;
    let calls: { name: string; args: unknown }[];
    if (t === 0) calls = [{ name: 'observe', args: {} }];
    else if (t <= 3) calls = [{ name: 'finish_run', args: { summary: 'Attempt to stop early, which the runner must refuse.' } }];
    else if (t <= 16) calls = [{ name: 'explore_next', args: { count: 8 } }];
    else if (t === 17) calls = [{ name: 'finish_run', args: { summary: 'Visited 102 discovered pages. This discovery regression did not check control outcomes; those remain coverage gaps.' } }];
    else throw new Error('Fixture failed to finish; do not loop indefinitely');
    return { message: { role: 'assistant', content: null, tool_calls: calls.map((c, i) => ({ id: `t${t}_${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }, finishReason: 'tool_calls', requestId: null, model: this.model };
  }
}

it('refuses repeated premature finishes and discovers 102 real pages in 13 model batches', async () => {
  const provider = new BreadthProvider();
  const admitted = await admitRun(db, { principal: `test:breadth:${randomUUID()}`, ownerId: null, projectId: null, mode: 'verified_site', contract: demoTargetContract(origin), spendAccount: 'development' });
  if (!admitted.ok) throw new Error(admitted.reason);
  const status = await executeRun({ db, providers: [provider], runtime: new LocalBrowserRuntime(), workerId: 'breadth-test', allowOfflineTestDouble: true,
    lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) }, agentMode: 'batch' }, admitted.runId);
  const events = (await db.query('SELECT type,payload FROM run_events WHERE run_id=$1 ORDER BY seq', [admitted.runId])).rows;
  expect(status).toBe('completed');
  expect(events.filter(e => e.type === 'finish.refused')).toHaveLength(3);
  const exploration = events.filter(e => e.type === 'exploration.updated');
  const discovery = exploration.at(-1).payload.summary;
  expect(discovery).toMatchObject({ discovered: 102, visited: 102, pendingRoutes: 0, pendingControls: 0, blocked: 0, outcomeChecked: 0, sampledVariants: 0 });
  const entries = new Map<string, { kind: string; path: string; status: string; checked: boolean }>();
  for (const event of exploration) for (const entry of event.payload.changes) entries.set(entry.id, entry);
  const routes = [...entries.values()].filter(entry => entry.kind === 'route');
  expect(routes).toHaveLength(102);
  for (const path of ['/', ...Array.from({ length: 101 }, (_, i) => `/page/${i + 1}`)]) {
    expect(arrivals.has(path), `actual destination arrival at ${path}`).toBe(true);
    expect(routes.find(entry => entry.path === path)).toMatchObject({ status: 'visited', checked: false });
  }
  const coverage = events.filter(e => e.type === 'coverage.updated').at(-1).payload;
  expect(coverage.exercised).toBe(0); // Visiting is never falsely counted as clicking the link.
  expect(events.filter(e => e.type === 'action.finished')).toHaveLength(101);
  expect(events.some(e => e.type === 'exploration.deferred')).toBe(false);
  expect(provider.turn).toBe(18);
}, 120_000);
