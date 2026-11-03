'use client';
// The hound trail expands into a bounded, searchable history; no recorded state is discarded.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HOUND_PATH, HOUND_VIEWBOX, Icon } from '@/ui/icons';
import { filterTrail, pageName, trailStops, type TrailPage } from './trail-data';
export { pageName, trailStops, type TrailPage } from './trail-data';

const ROW_H = 94, PAD_X = 50, TOP = 40, COMPACT_STOPS = 24, PAGE_SIZE = 48;
const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const short = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 1)}…` : s;

export function TrailMap({ pages, live }: { pages: TrailPage[]; live: boolean }) {
  const wrap = useRef<HTMLDivElement>(null), contentId = useId();
  const expandButton = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(720);
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [query, setQuery] = useState(''), [actor, setActor] = useState(''), [device, setDevice] = useState('');
  const [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [stateIndex, setStateIndex] = useState(0);
  useIsoLayout(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e!.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const grouped = useMemo(() => trailStops(pages), [pages]);
  const filtered = useMemo(() => filterTrail(grouped, query, actor, device), [grouped, query, actor, device]);
  const actors = useMemo(() => [...new Set(pages.map((s) => s.actor).filter((a): a is string => Boolean(a)))], [pages]);
  const devices = useMemo(() => [...new Set(pages.map((s) => s.device))], [pages]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const offset = expanded ? currentPage * PAGE_SIZE : Math.max(0, grouped.length - COMPACT_STOPS);
  const shown = expanded ? filtered.slice(offset, offset + PAGE_SIZE) : grouped.slice(offset);
  const selected = grouped.find((s) => s.key === selectedKey);
  const currentStateIndex = Math.min(stateIndex, (selected?.states.length ?? 1) - 1);
  const selectedState = selected?.states[currentStateIndex];
  const perRow = Math.max(2, Math.min(7, Math.floor((width - PAD_X * 2) / 128) + 1));
  const gap = (width - PAD_X * 2) / (perRow - 1);
  const stops = shown.map((s, i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    return { ...s, x: PAD_X + (row % 2 === 0 ? col : perRow - 1 - col) * gap, y: TOP + row * ROW_H, row };
  });
  // Straight legs between controls, as on an orienteering course.
  const d = stops.map((s, i) => `${i ? 'L' : 'M'} ${s.x} ${s.y}`).join(' ');
  const height = TOP + (stops.at(-1)?.row ?? 0) * ROW_H + 52;
  const latest = stops.find((s) => s.key === grouped.at(-1)?.key);
  const labelChars = Math.max(8, Math.min(Math.floor(gap / 7.2), 16));
  function select(key: string) { setSelectedKey(key); setStateIndex(0); }

  return <div className={`tmap${expanded ? ' tmap-expanded' : ''}`} ref={wrap}>
    <div className="trail-tools">
      <span className="muted tabular">{expanded ? `${filtered.length} of ${grouped.length} stops` : `${shown.length === grouped.length ? 'All' : 'Latest ' + shown.length + ' of'} ${grouped.length} stops`} · {pages.length} recorded states</span>
      <button ref={expandButton} className="btn btn-sm" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((x) => !x)}><Icon name={expanded ? 'back' : 'trail'} />{expanded ? 'Collapse trail' : 'Expand trail'}</button>
    </div>
    {expanded && <div className="trail-tools trail-filters">
      <label className="trail-search">Search trail<input type="search" value={query} placeholder="Page, route or state title" onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
      <label>Actor<select aria-label="Actor" value={actor} onChange={(e) => { setActor(e.target.value); setPage(0); }}><option value="">All actors</option>{actors.map((a) => <option key={a}>{a}</option>)}</select></label>
      <label>Device<select aria-label="Device" value={device} onChange={(e) => { setDevice(e.target.value); setPage(0); }}><option value="">All devices</option>{devices.map((a) => <option key={a}>{a}</option>)}</select></label>
      <div className="segmented" role="group" aria-label="Trail layout"><button aria-pressed={view === 'map'} onClick={() => setView('map')}><Icon name="map" />Map</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="list" />List</button></div>
    </div>}
    <div id={contentId}>
      {expanded && <div className="trail-pagination" role="group" aria-label="Trail pages">
        <button className="btn btn-sm" disabled={currentPage === 0} onClick={() => setPage(0)}>First</button>
        <button className="btn btn-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <label>Page <input type="number" aria-label="Trail page" min={1} max={pageCount} value={currentPage + 1} onChange={(e) => setPage(Math.max(0, Math.min(pageCount - 1, Number(e.target.value) - 1)))} /> of {pageCount}</label>
        <button className="btn btn-sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
        <button className="btn btn-sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(pageCount - 1)}>Latest</button>
        <span className="muted tabular" role="status">{filtered.length ? `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, filtered.length)}` : 'No matching stops'}</span>
      </div>}
      {expanded && view === 'list' ? <ol className="trail-history" aria-label="Recorded trail stops" start={offset + 1}>{shown.map((s) => <li key={s.key}><button className="trail-history-stop" aria-pressed={selectedKey === s.key} onClick={() => select(s.key)}><span className="tabular muted">#{s.ordinal}</span><span><strong>{pageName(s.route)}</strong><span className="mono break">{s.route}</span><span className="muted">Actor {s.actor ?? 'not recorded'} · {s.device} · {s.visits} {s.visits === 1 ? 'state' : 'states'}</span></span><Icon name="chevron" /></button></li>)}</ol>
        : <div className="tmap-scroll" tabIndex={0} role="region" aria-label="Recorded trail map">
          <div className="tmap-canvas" style={{ width, height }}>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden focusable="false">
              <path d={d} className="tmap-path" />
              {stops.map((s) => <g key={s.key} transform={`translate(${s.x} ${s.y})`} className={`tmap-stop${s.key === latest?.key ? ' last' : ''}${selectedKey === s.key ? ' selected' : ''}${s.key === latest?.key && live ? ' fresh' : ''}`}>
                {s.ordinal === 1
                  ? <polygon points="0,-11 9.5,5.5 -9.5,5.5" className="tmap-dot tmap-start" />
                  : <circle r={9} className="tmap-dot" />}
                {s.key === latest?.key && !live && s.ordinal > 1 && <circle r={13} className="tmap-dot tmap-finish" />}
                {s.ordinal > 1 && <text x={12} y={-9} className="tmap-num">{s.ordinal - 1}</text>}
                {s.device === 'mobile' && <rect x={-2.5} y={-4} width={5} height={8} rx={1.2} className="tmap-phone" />}
                <text y={24} textAnchor="middle" className="tmap-title">{short(pageName(s.route), labelChars)}</text>
                <text y={38} textAnchor="middle" className="tmap-route">{short(s.visits > 1 ? `${s.route} ×${s.visits}` : s.route, labelChars + 2)}</text>
              </g>)}
              {latest && <g className="tmap-hound" style={{ transform: `translate(${latest.x}px, ${latest.y - 30}px)` }}><g style={{ transform: latest.row % 2 ? 'scaleX(-1)' : undefined }}><svg x={-14} y={-15} width={28} height={28} viewBox={HOUND_VIEWBOX}><path d={HOUND_PATH} fill="currentColor" fillRule="evenodd" /></svg></g></g>}
            </svg>
            {stops.map((s) => <button key={s.key} className="tmap-hit" style={{ left: s.x - 48, top: s.y - 14 }} aria-label={`Inspect stop ${s.ordinal}: ${pageName(s.route)}, actor ${s.actor ?? 'not recorded'}, ${s.device}, ${s.visits} states`} aria-pressed={selectedKey === s.key} onClick={() => select(s.key)} title={`${s.route} · Actor ${s.actor ?? 'not recorded'} · ${s.device}`} />)}
          </div>
        </div>}
      {!shown.length && <p className="muted">No stops match these filters. Change the search, actor or device to see more.</p>}
    </div>
    {selected && selectedState && <section className="trail-detail" aria-label="Selected trail state">
      <div className="trail-tools"><strong>Stop {selected.ordinal} · {pageName(selected.route)}</strong><button className="btn btn-ghost btn-sm" onClick={() => { (wrap.current?.querySelector<HTMLButtonElement>('.tmap-hit[aria-pressed=true], .trail-history-stop[aria-pressed=true]') ?? expandButton.current)?.focus(); setSelectedKey(null); }}>Close details</button></div>
      <div className="trail-pagination" role="group" aria-label="States at selected stop"><button className="btn btn-sm" disabled={currentStateIndex === 0} onClick={() => setStateIndex(currentStateIndex - 1)}>Previous state</button><label>State <input type="number" aria-label="State at selected stop" min={1} max={selected.visits} value={currentStateIndex + 1} onChange={(e) => setStateIndex(Math.max(0, Math.min(selected.visits - 1, Number(e.target.value) - 1)))} /> of {selected.visits}</label><button className="btn btn-sm" disabled={currentStateIndex + 1 >= selected.visits} onClick={() => setStateIndex(currentStateIndex + 1)}>Next state</button></div>
      <dl><dt>Page title</dt><dd>{selectedState.title || 'No title recorded'}</dd><dt>Route</dt><dd className="mono break">{selectedState.route}</dd><dt>Session</dt><dd>Actor {selectedState.actor ?? 'not recorded'} · {selectedState.device}</dd>{selectedState.first_seen_at && <><dt>First recorded</dt><dd><time dateTime={selectedState.first_seen_at} suppressHydrationWarning>{new Date(selectedState.first_seen_at).toLocaleString()}</time></dd></>}<dt>State ID</dt><dd className="mono break">{selectedState.key}</dd></dl>
    </section>}
    <p className="tmap-more">Stops group consecutive discoveries on the same route, actor and device. Select a stop to inspect every state. This is discovery order, not every revisit or whole-site coverage.</p>
  </div>;
}
