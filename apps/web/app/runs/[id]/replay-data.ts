export type ReplayEvent = { seq: number; at: string; type: string; payload: Record<string, any> };
type HistoryPage = { rows: ReplayEvent[]; hasMore: boolean; nextBefore: number | null };

/** Load the recording through bounded authorized pages, rather than treating a recent window as complete. */
export async function completeReplayEvents(
  initial: ReplayEvent[], hasMore: boolean,
  loadPage: (before: number, signal: AbortSignal) => Promise<HistoryPage>, signal: AbortSignal,
): Promise<ReplayEvent[]> {
  const rows = new Map(initial.map(row => [Number(row.seq), { ...row, seq: Number(row.seq) }]));
  let before = Math.min(...rows.keys());
  while (hasMore) {
    signal.throwIfAborted();
    if (!Number.isSafeInteger(before) || before < 1) throw new Error('Recording has no valid history cursor.');
    const page = await loadPage(before, signal);
    if (!Array.isArray(page.rows) || page.rows.length > 100 || typeof page.hasMore !== 'boolean') throw new Error('Invalid recording history page.');
    for (const row of page.rows) {
      const seq = Number(row.seq);
      if (!Number.isSafeInteger(seq) || seq < 1 || seq >= before || !Number.isFinite(Date.parse(row.at))
        || typeof row.type !== 'string' || !row.payload || typeof row.payload !== 'object') throw new Error('Invalid recording history row.');
      rows.set(seq, { ...row, seq });
    }
    const next = page.rows.length ? Math.min(...page.rows.map(row => Number(row.seq))) : null;
    if (page.hasMore && (next === null || next >= before || Number(page.nextBefore) !== next)) throw new Error('Recording history did not advance.');
    hasMore = page.hasMore;
    if (next !== null) before = next;
  }
  signal.throwIfAborted();
  return [...rows.values()].sort((a, b) => a.seq - b.seq);
}
