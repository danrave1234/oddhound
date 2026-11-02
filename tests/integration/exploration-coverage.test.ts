// Real local Chromium, scope policy, worker and PostgreSQL ledgers. The planner is an explicitly
// scripted, zero-price test provider: this proves exploration mechanics, not Meta reasoning quality.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { admitRun } from '../../packages/core/ledger/runs.ts';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { executeRun } from '../../packages/core/agent/execute-run.ts';
import { LocalBrowserRuntime } from '../../packages/core/browser/runtime.ts';
import type { ChatMessage, ChatProvider, ChatRequest, ChatResult } from '../../packages/core/providers/types.ts';
import { EXPLORATION_ROUTE_COUNT, startExplorationSite, type ExplorationSite } from '../fixtures/exploration-site.ts';

const db = getPool();
let site: ExplorationSite;
beforeAll(async () => {
  await migrate(db);
  await db.query("UPDATE settings SET value = 'false'::jsonb WHERE key = 'kill_switch'");
  site = await startExplorationSite();
});
afterAll(async () => { await site?.close(); await closePool(); });

type Seen = { path: string; content: string; controls: { ref: string; label: string; attrs: string }[] };
function observations(messages: ChatMessage[]): Seen[] {
  const seen: Seen[] = [];
  for (const message of messages) {
    if (message.role === 'assistant' || message.role === 'system' || typeof message.content !== 'string') continue;
    // explore_next (including finish-refusal recovery) reports several pages in one tool result.
    // Remember each reported stop; only the final one supplies refs for the current live page.
    const pages = [...message.content.matchAll(/^PAGE v\d+: (\S+)/gm)];
    for (const [index, match] of pages.entries()) {
      const content = message.content.slice(match.index, pages[index + 1]?.index);
      const controls = content.split('\n').flatMap((line) => {
        const m = /^\[(e\d+)\]\s+\S+\s+("(?:\\.|[^"\\])*")\s*(.*)$/.exec(line);
        return m ? [{ ref: m[1]!, label: JSON.parse(m[2]!) as string, attrs: m[3]! }] : [];
      });
      seen.push({ path: match[1]!, content, controls });
    }
  }
  return seen;
}
const lastTool = (messages: ChatMessage[]) => [...messages].reverse().find((m) => m.role === 'tool')?.content ?? '';

/** Follows only observed hrefs and visible menu affordances; no fixture route list is supplied. */
class ObservedNavigationPlanner implements ChatProvider {
  readonly id = 'test-double';
  readonly model = 'heuristic-planner';
  readonly label = 'Scripted observed-navigation fixture planner';
  readonly isMetaModel = false;
  readonly capability = { tools: true, images: false, imagesInToolMessages: false, toolChoiceValues: ['auto'] as const, structuredOutput: false };
  readonly finishResponses: string[] = [];
  readonly notebooks = new Set<string>();
  readonly visited = new Set<string>();
  readonly requested = new Set<string>();
  readonly discovered = new Set<string>();
  readonly clicked = new Set<string>();
  #turn = 0;
  #needsObserve = false;
  #previousTool = '';
  #checkedRedirect = false;
  readonly origin: string;
  constructor(origin: string) { this.origin = origin; }

  async chat(req: ChatRequest): Promise<ChatResult> {
    if (++this.#turn > 320) throw new Error('Fixture planner exceeded its bounded test watchdog');
    if (this.#previousTool === 'finish_run') this.finishResponses.push(lastTool(req.messages));
    for (const m of req.messages) if (m.role === 'user' && typeof m.content === 'string' && m.content.includes('NOTEBOOK (kept by Oddhound')) this.notebooks.add(m.content);
    const reportedPages = observations(req.messages);
    const seen = reportedPages.at(-1);
    for (const reported of reportedPages) {
      this.visited.add(reported.path);
      for (const match of reported.content.matchAll(/href=([^\s]+)/g)) {
        const url = new URL(match[1]!, this.origin);
        if (url.origin !== this.origin || url.pathname.startsWith('/denied')) continue;
        this.discovered.add(`${url.pathname}${url.search}`);
      }
    }
    let name: string, args: unknown;
    if (this.#turn === 1) { name = 'observe'; args = {}; }
    else if (this.#turn <= 4) { name = 'finish_run'; args = { summary: 'Premature finish must be refused while observed navigation is pending.' }; }
    else if (this.#needsObserve) {
      // A real user may look again after asynchronous UI changes. No page evaluation or hidden-route access.
      await new Promise((resolve) => setTimeout(resolve, 260));
      this.#needsObserve = false; name = 'observe'; args = {};
    } else {
      const menu = seen?.controls.find((c) => /menu$/i.test(c.label) && !this.clicked.has(`${seen.path}|${c.label}`));
      const next = [...this.discovered].find((path) => !this.visited.has(path) && !this.requested.has(path));
      if (menu && seen) {
        this.clicked.add(`${seen.path}|${menu.label}`); this.#needsObserve = true;
        name = 'click'; args = { ref: menu.ref };
      } else if (this.visited.has('/redirect-final') && !this.#checkedRedirect) {
        if (seen?.path === '/redirect-final') {
          this.#checkedRedirect = true;
          name = 'check_state'; args = { expect: { path: '/redirect-final', text_visible: 'Redirect final destination' } };
        } else {
          // An intermediate discovery stop is a visit, not an assertion. Return and check it.
          this.#needsObserve = true; name = 'navigate'; args = { path: '/redirect-final' };
        }
      } else if (next) {
        this.requested.add(next); this.#needsObserve = true;
        name = 'navigate'; args = { path: next };
      } else {
        name = 'finish_run'; args = { summary: 'Visited the discovered fixture routes and checked the redirect outcome. The record form was visited but not functionally tested.' };
      }
    }
    this.#previousTool = name;
    return {
      message: { role: 'assistant', content: null, tool_calls: [{ id: `call_${randomUUID()}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, finishReason: 'tool_calls', requestId: null, model: this.model,
    };
  }
}

describe('continuing exploration across navigation and history boundaries', () => {
  it('keeps late/header/sidebar/redirect discoveries, refuses repeated premature finish and distinguishes visits from checked outcomes', async () => {
    await db.query('TRUNCATE runs CASCADE');
    const contract = demoTargetContract(site.origin);
    contract.deniedPathPrefixes = ['/denied'];
    const admitted = await admitRun(db, { principal: `test:exploration:${randomUUID()}`, ownerId: null, projectId: null, mode: 'demo_target', contract, spendAccount: 'development' });
    if (!admitted.ok) throw new Error(admitted.reason);
    const planner = new ObservedNavigationPlanner(site.origin);
    const status = await executeRun({ db, runtime: new LocalBrowserRuntime(), providers: [planner], workerId: 'exploration-test', allowOfflineTestDouble: true,
      agentMode: 'per_step', lab: { allowedEndpoints: new Set([`127.0.0.1:${site.port}`]) } }, admitted.runId);
    expect(status).toBe('completed');
    const events = (await db.query<{ type: string; payload: any }>('SELECT type, payload FROM run_events WHERE run_id = $1 ORDER BY seq', [admitted.runId])).rows;
    const exploration = events.filter((e) => e.type === 'exploration.updated');
    const entries = new Map<string, any>();
    for (const e of exploration) for (const change of e.payload.changes) entries.set(change.id, change);
    const routes = [...entries.values()].filter((e) => e.kind === 'route');
    const final = exploration.at(-1)!.payload.summary;
    const expectedPaths = [
      ...Array.from({ length: EXPLORATION_ROUTE_COUNT }, (_, i) => `/area/section-${String(i + 1).padStart(3, '0')}`),
      '/header/deep', '/late-discovery', '/redirect-final', '/variants?tab=one', '/variants?tab=two', '/visited-only',
    ];
    // Preserve actual worker/destination evidence even if a later fixture assertion fails.
    await mkdir('test-results', { recursive: true });
    await writeFile(`test-results/exploration-${admitted.runId}.json`, JSON.stringify({ at: new Date().toISOString(), runId: admitted.runId,
      status, provider: 'test-double/heuristic-planner', node: process.version, expectedPaths, plannerObserved: [...planner.visited].sort(),
      arrivals: site.arrivals, writes: site.writes(), routes, finalSummary: final,
      contextRebases: events.filter(e => e.type === 'model.context_rebased').length,
      finishRefusals: events.filter(e => e.type === 'finish.refused').length,
      recoveryBatches: events.filter(e => e.type === 'exploration.recovery').length,
      checkedStates: events.filter(e => e.type === 'state.checked').map(e => e.payload),
      timing: events.find(e => e.type === 'run.timings')?.payload,
      note: 'Owned synthetic fixture; actual browser/server events. Test verdict is recorded by Vitest.',
    }, null, 2));
    expect(events.filter((e) => e.type === 'finish.refused').length).toBeGreaterThanOrEqual(3);
    expect(planner.finishResponses.slice(0, 3)).toHaveLength(3);
    expect(planner.finishResponses.slice(0, 3).every((text) => text !== 'Finishing.')).toBe(true);
    for (const path of expectedPaths) {
      expect(planner.visited.has(path), `planner received ${path}`).toBe(true);
      expect(routes.find(route => route.path === path), `frontier visited ${path}`).toMatchObject({ status: 'visited' });
      expect(site.arrivals.some(arrival => arrival.method === 'GET' && arrival.path === path), `destination received GET ${path}`).toBe(true);
    }
    expect(site.arrivals.some((a) => a.path.startsWith('/denied'))).toBe(false);
    expect(site.arrivals.some((a) => a.path === '/redirect-middle')).toBe(true);
    expect(site.writes()).toBe(0);
    expect(events.some((e) => e.type === 'model.context_rebased')).toBe(true);
    expect([...planner.notebooks].some((text) => text.includes('EXPLORATION FRONTIER'))).toBe(true);

    expect(exploration.length).toBeGreaterThan(80);
    expect(final).toMatchObject({ pendingRoutes: 0, pendingControls: 0 });
    expect(final.visited).toBeGreaterThan(80);
    expect(routes.find((e) => e.path === '/visited-only')).toMatchObject({ status: 'visited', checked: false });
    expect(routes.find((e) => e.path === '/redirect-final')).toMatchObject({ status: 'visited', checked: true });
    expect(routes.some((e) => e.path.includes('outside.invalid'))).toBe(false);
    expect(routes.find((e) => e.path.startsWith('/denied'))).toMatchObject({ status: 'blocked', excluded: true, checked: false, attempts: 0 });
    expect(final.outcomeChecked).toBeLessThan(final.visited);
    const timing = events.find((e) => e.type === 'run.timings')!.payload;
    expect(timing.clock).toBe('monotonic');
    expect(timing.model.calls).toBeGreaterThan(80);
    expect(timing.browser.actions).toBeGreaterThan(80);
    expect(timing.browser.elapsedMs).toBeGreaterThan(0);
    expect(timing.observation.count).toBeGreaterThan(80);
    expect(timing.observation.elapsedMs).toBeGreaterThan(0);
    expect(timing.totalElapsedMs).toBeGreaterThan(timing.model.elapsedMs);
    const run = (await db.query('SELECT sandbox_verdict FROM runs WHERE id = $1', [admitted.runId])).rows[0];
    expect(run.sandbox_verdict).toBe('sandbox_on');
  }, 180_000);
});
