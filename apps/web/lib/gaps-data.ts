import 'server-only';
import type { Db } from '@core/db/pool.ts';
import { setupHints, untestedChecklist, type DiscoveryEntry, type CoverageRoute, type GapItem } from '@core/reports/gaps.ts';

type Change = { id: string; kind: 'route' | 'control'; path: string; label?: string; status: 'pending' | 'visited' | 'blocked'; visited: boolean; excluded?: boolean; reason?: string };

/** Folds the saved frontier deltas and deferrals of a run into the pages and controls it never tested. */
export async function loadGaps(pool: Db, runId: string, routes: CoverageRoute[] | null, siteOrigin: string | null = null): Promise<GapItem[]> {
  const [updates, deferred, edges] = await Promise.all([
    pool.query<{ payload: { changes?: Change[] } }>(`SELECT payload FROM run_events WHERE run_id = $1 AND type = 'exploration.updated' ORDER BY seq`, [runId]),
    pool.query<{ payload: { path: string; status: 'blocked' | 'skipped'; reason: string } }>(`SELECT payload FROM run_events WHERE run_id = $1 AND type = 'exploration.deferred' ORDER BY seq`, [runId]),
    // Owner-site runs only: where the run hit the edge of its scope, so the owner knows what setup to add.
    siteOrigin ? pool.query<{ type: string; payload: { url?: string; reason?: string; kind?: string } }>(
      `SELECT type, payload FROM run_events WHERE run_id = $1 AND (type = 'scope.denied' OR (type = 'recipe.unavailable' AND payload->>'kind' = 'register')) ORDER BY seq LIMIT 2000`, [runId]) : Promise.resolve({ rows: [] }),
  ]);
  const setup = siteOrigin ? setupHints({
    origin: siteOrigin,
    leftTo: edges.rows.filter((e) => e.payload.reason === 'main_frame_left_verified_origin' && e.payload.url).map((e) => e.payload.url!),
    deniedWrites: edges.rows.filter((e) => e.type === 'scope.denied' && e.payload.reason !== 'main_frame_left_verified_origin' && e.payload.url).map((e) => e.payload.url!),
    signUpUnavailable: edges.rows.some((e) => e.type === 'recipe.unavailable'),
  }) : [];
  const latest = new Map<string, Change>();
  for (const u of updates.rows) for (const c of u.payload.changes ?? []) if (c.kind === 'route' && !c.excluded) latest.set(c.id, c); // last delta per entry wins
  // The agent may defer '/orders/?x=1' while the frontier stored '/orders'; compare by pathname only.
  const key = (p: string) => { try { return new URL(p, 'http://x').pathname.replace(/\/+$/, '') || '/'; } catch { return p; } };
  const reasons = new Map(deferred.rows.map((d) => [key(d.payload.path), d.payload]));
  const entries: DiscoveryEntry[] = [...latest.values()].map((c) => {
    const d = reasons.get(key(c.path));
    return { path: c.path, visited: c.visited, ...(d ? { disposition: d.status, reason: d.reason } : c.status === 'blocked' ? { disposition: 'blocked' as const, reason: c.reason ?? 'blocked by the run contract' } : {}) };
  });
  return untestedChecklist({ entries, routes, setup });
}
