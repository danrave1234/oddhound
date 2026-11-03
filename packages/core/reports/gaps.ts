// What a run saw but did not test, as a checklist a tester can take over by hand. Built only from
// the saved discovery inventory and control coverage; every line names a real page or control count.

export type DiscoveryEntry = { path: string; family?: string; visited: boolean; disposition?: 'blocked' | 'skipped'; reason?: string };
export type CoverageRoute = { route: string; total: number; exercised: number; blocked: number };
export type GapItem = { kind: 'not_opened' | 'blocked' | 'skipped' | 'controls'; path: string; text: string };

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 140);

export function untestedChecklist(input: { entries?: DiscoveryEntry[] | null; routes?: CoverageRoute[] | null; limit?: number }): GapItem[] {
  const items: GapItem[] = [];
  const seen = new Set<string>();
  for (const e of input.entries ?? []) {
    if (e.visited && !e.disposition) continue;
    const key = `${e.disposition ?? 'pending'}:${e.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.disposition === 'blocked') items.push({ kind: 'blocked', path: e.path, text: `${e.path}: blocked, ${oneLine(e.reason ?? 'no reason recorded')}` });
    else if (e.disposition === 'skipped') items.push({ kind: 'skipped', path: e.path, text: `${e.path}: skipped by the agent, ${oneLine(e.reason ?? 'no reason recorded')}` });
    else if (!e.visited) items.push({ kind: 'not_opened', path: e.path, text: `${e.path}: discovered, never opened` });
  }
  for (const r of input.routes ?? []) {
    const untried = r.total - r.exercised - r.blocked;
    if (untried > 0) items.push({ kind: 'controls', path: r.route, text: `${r.route}: ${untried} of ${r.total} controls never tried${r.blocked ? ` (${r.blocked} blocked by the run contract)` : ''}` });
  }
  const order: GapItem['kind'][] = ['blocked', 'not_opened', 'controls', 'skipped'];
  items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.path.localeCompare(b.path));
  return items.slice(0, input.limit ?? 200);
}

export function checklistMarkdown(items: GapItem[], meta: { origin: string; runUrl: string }): string {
  const lines = [`## Not tested by Oddhound on ${meta.origin}`, `From run ${meta.runUrl}. A reached page is not a tested page; these are the gaps the run recorded.`, ''];
  if (!items.length) lines.push('- No gaps were recorded. This does not mean everything was tested; only that the run left no pending pages or untried controls.');
  for (const i of items) lines.push(`- [ ] ${i.text}`);
  return lines.join('\n');
}
