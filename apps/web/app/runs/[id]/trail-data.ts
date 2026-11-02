export type TrailPage = { key: string; route: string; title: string; actor?: string; device: string; first_seen_at?: string };
export type TrailStop<T extends TrailPage = TrailPage> = T & { visits: number; states: T[]; ordinal: number };
const isId = (s: string) => /^\d+$/.test(s) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s) || /-[0-9a-f]{6,}$/i.test(s) || s.startsWith(':');
export function pageName(route: string): string {
  const segs = route.split('?')[0]!.split('/').filter(Boolean);
  return segs.length ? segs.map((s) => { const w = s.replace(/[-_]+/g, ' ').trim(); return isId(s) ? 'one record' : w.charAt(0).toUpperCase() + w.slice(1); }).slice(-2).join(' › ') : 'Home';
}
/** Group adjacent discoveries only; keep every state, actor and device. */
export function trailStops<T extends TrailPage>(pages: T[]): TrailStop<T>[] {
  const out: TrailStop<T>[] = [];
  for (const p of pages) {
    const prev = out.at(-1);
    if (prev && prev.route === p.route && prev.device === p.device && prev.actor === p.actor) { prev.visits++; prev.states.push(p); }
    else out.push({ ...p, visits: 1, states: [p], ordinal: out.length + 1 });
  }
  return out;
}
export function filterTrail(stops: TrailStop[], query: string, actor: string, device: string): TrailStop[] {
  const term = query.trim().toLocaleLowerCase();
  return stops.filter((s) => (!actor || s.actor === actor) && (!device || s.device === device)
    && (!term || [s.route, s.actor, s.device, ...s.states.map((p) => p.title)].join(' ').toLocaleLowerCase().includes(term)));
}
/** Recent activity is a fallback for old snapshots; timestamped persisted discoveries are complete. */
export function trailAtTime(states: (Omit<TrailPage, 'key'> & { id: string })[], events: { seq: number; at: string; type: string; payload: Record<string, any> }[], until: number): TrailPage[] {
  if (states.length && (!Number.isFinite(until) || states.every((s) => s.first_seen_at))) return states.filter((s) => !Number.isFinite(until) || new Date(s.first_seen_at!).getTime() <= until).map((s) => ({ ...s, key: s.id }));
  return events.filter((e) => e.type === 'state.discovered' && new Date(e.at).getTime() <= until).map((e) => ({ key: `event-${e.seq}`, route: String(e.payload.route ?? '/'), title: String(e.payload.title ?? ''), actor: e.payload.actor, device: String(e.payload.device ?? ''), first_seen_at: e.at }));
}
