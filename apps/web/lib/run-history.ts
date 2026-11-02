import type { Pool } from 'pg';
export type HistoryKind = 'events' | 'actions';
export function historyQuery(params: URLSearchParams): { kind: HistoryKind; before: number | null; limit: number } | null {
  const kind = params.get('kind') ?? 'events';
  const before = params.has('before') ? Number(params.get('before')) : null;
  const limit = params.has('limit') ? Number(params.get('limit')) : 100;
  if (!['events', 'actions'].includes(kind) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || (before !== null && (!Number.isSafeInteger(before) || before < 1))) return null;
  return { kind: kind as HistoryKind, before, limit };
}
/** Authorize the run before calling. Bounded keyset pagination never crosses run IDs. */
export async function loadHistoryPage(pool: Pick<Pool, 'query'>, runId: string, options: NonNullable<ReturnType<typeof historyQuery>>) {
  const query = options.kind === 'events'
    ? 'SELECT seq, at, type, payload FROM run_events WHERE run_id = $1 AND ($2::bigint IS NULL OR seq < $2) ORDER BY seq DESC LIMIT $3'
    : 'SELECT seq, actor, device, tool, state, url_after, intended_at FROM actions WHERE run_id = $1 AND ($2::bigint IS NULL OR seq < $2) ORDER BY seq DESC LIMIT $3';
  const result = await pool.query(query, [runId, options.before, options.limit + 1]);
  const rows = result.rows.slice(0, options.limit);
  return { rows, hasMore: result.rows.length > options.limit, nextBefore: rows.at(-1)?.seq ?? null };
}
