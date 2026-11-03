import 'server-only';
import type { Db } from '@core/db/pool.ts';
import { untestedChecklist, type DiscoveryEntry, type CoverageRoute, type GapItem } from '@core/reports/gaps.ts';

type Change = { id: string; kind: 'route' | 'control'; path: string; label?: string; status: 'pending' | 'visited' | 'blocked'; visited: boolean; excluded?: boolean; reason?: string };

/** Folds the saved frontier deltas and deferrals of a run into the pages and controls it never tested. */
export async function loadGaps(pool: Db, runId: string, routes: CoverageRoute[] | null): Promise<GapItem[]> {
  const [updates, deferred] = await Promise.all([
    pool.query<{ payload: { changes?: Change[] } }>(`SELECT payload FROM run_events WHERE run_id = $1 AND type = 'exploration.updated' ORDER BY seq`, [runId]),
    pool.query<{ payload: { path: string; status: 'blocked' | 'skipped'; reason: string } }>(`SELECT payload FROM run_events WHERE run_id = $1 AND type = 'exploration.deferred' ORDER BY seq`, [runId]),
  ]);
  const latest = new Map<string, Change>();
  for (const u of updates.rows) for (const c of u.payload.changes ?? []) if (c.kind === 'route' && !c.excluded) latest.set(c.id, c); // last delta per entry wins
  const reasons = new Map(deferred.rows.map((d) => [d.payload.path, d.payload]));
  const entries: DiscoveryEntry[] = [...latest.values()].map((c) => {
    const d = reasons.get(c.path);
    return { path: c.path, visited: c.visited, ...(d ? { disposition: d.status, reason: d.reason } : c.status === 'blocked' ? { disposition: 'blocked' as const, reason: c.reason ?? 'blocked by the run contract' } : {}) };
  });
  return untestedChecklist({ entries, routes });
}
