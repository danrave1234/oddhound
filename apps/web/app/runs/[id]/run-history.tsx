'use client';
import { useState } from 'react';
import { Icon } from '@/ui/icons';

type Row = Record<string, any> & { seq: number };
type Event = { seq: number; at: string; type: string; payload: Record<string, any> };
const PAGE_SIZE = 100;
const ordered = (rows: Record<string, any>[]) => [...new Map(rows.map((r) => [Number(r.seq), { ...r, seq: Number(r.seq) }])).values()].sort((a, b) => b.seq - a.seq);

/** Stable, bounded display over keyset-paginated records. New activity never moves an older page. */
export function RunHistory({ runId, kind, initial, initialHasMore, describe }: {
  runId: string; kind: 'events' | 'actions'; initial: Record<string, any>[]; initialHasMore: boolean;
  describe?: (event: Event) => string | null;
}) {
  const [rows, setRows] = useState<Row[]>(() => ordered(initial));
  const [more, setMore] = useState(initialHasMore);
  const [page, setPage] = useState(0), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1), start = current * PAGE_SIZE;
  const shown = rows.slice(start, start + PAGE_SIZE);
  const latestSeq = initial.reduce((n, r) => Math.max(n, Number(r.seq)), 0);
  const newRecords = latestSeq > (rows[0]?.seq ?? 0);
  function latest() { setRows(ordered(initial)); setMore(initialHasMore); setPage(0); setError(null); }
  async function loadEarlier() {
    setBusy(true); setError(null);
    try {
      const before = rows.at(-1)?.seq;
      const res = await fetch(`/api/runs/${runId}/history?kind=${kind}&limit=100${before ? `&before=${before}` : ''}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error('History could not be loaded. Try again.');
      const data = await res.json();
      const merged = ordered([...rows, ...data.rows]);
      setRows(merged); setMore(data.hasMore); setPage(Math.max(0, Math.ceil(merged.length / PAGE_SIZE) - 1));
    } catch (e) { setError(e instanceof Error ? e.message : 'History could not be loaded.'); }
    finally { setBusy(false); }
  }
  return <div className="run-history">
    <div className="trail-pagination" role="group" aria-label={`${kind === 'events' ? 'Activity' : 'Action'} history pages`}>
      <button className="btn btn-sm" disabled={current === 0 && !newRecords} onClick={latest}>{newRecords ? 'New records — show latest' : 'Latest'}</button>
      <button className="btn btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Newer</button>
      <span className="tabular">Page {current + 1} of {pages}</span>
      <button className="btn btn-sm" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Older</button>
      <button className="btn btn-sm" disabled={!more || busy} onClick={loadEarlier} aria-busy={busy || undefined}>{busy ? 'Loading…' : 'Load earlier records'}</button>
      <span className="muted tabular" role="status">{rows.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length} loaded` : 'No records yet'}{more ? ' · earlier history available' : ' · start of history reached'}</span>
    </div>
    {error && <p className="status-line" role="alert"><Icon name="alert" />{error}</p>}
    {kind === 'events' ? <ol className="timeline" aria-label="Recorded activity" aria-live="off">{shown.map((e) => <li key={e.seq}><span className="t" suppressHydrationWarning>{new Date(e.at).toLocaleTimeString()}</span><span className="d" aria-hidden /><div className="break"><span>{describe?.(e as Event) ?? e.type}</span><details><summary className="muted">Recorded detail · #{e.seq}</summary><pre className="brief">{JSON.stringify(e.payload, null, 2)}</pre></details></div></li>)}</ol>
      : <ol className="list" aria-label="Recorded actions" style={{ listStyle: 'none', padding: 0 }}>{shown.map((a) => <li key={a.seq} className="list-row" style={{ gridTemplateColumns: 'auto minmax(0,1fr)', padding: '10px 0' }}><span className="chip tabular">#{a.seq}</span><span><strong className="mono">{a.tool}</strong><span className="meta">Actor {a.actor} · {a.device} · {a.state}</span><span className="mono break">{a.url_after}</span><span className="meta" suppressHydrationWarning>{new Date(a.intended_at).toLocaleString()}</span></span></li>)}</ol>}
  </div>;
}
