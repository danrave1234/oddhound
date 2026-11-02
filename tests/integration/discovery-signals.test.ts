// Real browser/worker/database with a scripted, zero-price provider; no external site or Meta calls.
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
const paths = [...'abcdefghijkl'].map(letter => `/fault/${letter}`);
let server: Server, origin: string, port: number;
beforeAll(async () => {
  await migrate(db);
  server = createServer((req, res) => {
    if (req.url === '/robots.txt' || req.url === '/sitemap.xml') return void res.writeHead(404).end();
    const fault = paths.includes(req.url ?? '');
    res.writeHead(fault ? 500 : 200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'" })
      .end(`<h1>${fault ? `Unavailable ${req.url}` : 'Fixture home'}</h1>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port; origin = `http://127.0.0.1:${port}`;
});
afterAll(async () => { server?.close(); await closePool(); });

class SignalProvider implements ChatProvider {
  readonly id = 'test-double'; readonly model = 'heuristic-planner'; readonly isMetaModel = false;
  readonly label = 'Scripted detector continuation fixture';
  readonly capability = { tools: true, images: false, imagesInToolMessages: false, toolChoiceValues: ['auto'] as const, structuredOutput: false };
  turn = 0;
  async chat(_request: ChatRequest): Promise<ChatResult> {
    const turn = this.turn++;
    if (turn > paths.length) throw new Error('Fixture watchdog: unexpected extra decision');
    const name = turn < paths.length ? 'navigate' : 'finish_run';
    const args = name === 'navigate' ? { path: paths[turn] } : { summary: 'All twelve distinct response failures were visited; verify the recorded signals.' };
    return { message: { role: 'assistant', content: null, tool_calls: [{ id: `signal_${turn}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }, finishReason: 'tool_calls', requestId: null, model: this.model };
  }
}

it('retains and independently replays distinct detector candidates beyond ten', async () => {
  const admission = await admitRun(db, { principal: `test:signals:${randomUUID()}`, ownerId: null, projectId: null,
    mode: 'verified_site', contract: demoTargetContract(origin), spendAccount: 'development' });
  if (!admission.ok) throw new Error(admission.reason);
  const status = await executeRun({ db, providers: [new SignalProvider()], runtime: new LocalBrowserRuntime(),
    workerId: 'signal-continuation', allowOfflineTestDouble: true, agentMode: 'batch',
    lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } }, admission.runId);
  expect(status).toBe('completed');
  const findings = (await db.query(`SELECT verification,category,observed FROM findings WHERE run_id=$1 AND rule_id='B1'`, [admission.runId])).rows;
  expect(findings).toHaveLength(12);
  expect(findings.every(f => f.verification === 'verified' && f.category === 'verified_issue')).toBe(true);
  for (const path of paths) expect(findings.some(f => String(f.observed).includes(path))).toBe(true);
  expect((await db.query('SELECT browser_state,sandbox_verdict FROM runs WHERE id=$1', [admission.runId])).rows[0])
    .toMatchObject({ browser_state: 'terminated', sandbox_verdict: 'sandbox_on' });
}, 180_000);
