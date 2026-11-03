// Keeps exploration moving. On a real invoicing site the agent spent 308 of 344 actions on one form,
// re-checking a rule the site already enforced about 80 times. These helpers notice a settled
// question and a stuck area so the run can steer back to untested work.

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'on', 'in', 'for', 'with', 'via', 'per', 'then', 'is', 'be', 'it',
  'should', 'must', 'try', 'trying', 'check', 'checks', 'checking', 'test', 'testing', 'verify', 'again', 'still', 'if', 'that', 'this']);

/** Content words of a batch goal, lower-cased, with rule ids (R3, B8) kept. */
export function goalWords(goal: string): Set<string> {
  return new Set(goal.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));
}

/** True when two goals name essentially the same check (Jaccard similarity of their content words). */
export function sameGoal(a: string, b: string, threshold = 0.5): boolean {
  const x = goalWords(a), y = goalWords(b);
  if (x.size < 2 || y.size < 2) return false;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared) >= threshold;
}

/** How many of the recent goals repeat this one. */
export function repeatedGoal(goal: string, recent: readonly string[]): number {
  return recent.filter((g) => sameGoal(goal, g)).length;
}

/** Folds record ids (numbers, UUIDs, cuid/nanoid-style tokens) so two records' pages count as one route. */
export function routeTemplate(path: string): string {
  const p = (path.split(/[?#]/)[0] || '/');
  return p.split('/').map((seg) => (/^\d+$/.test(seg) || /^[a-f\d]{8}-[a-f\d-]{27,}$/i.test(seg) || (seg.length >= 12 && /\d/.test(seg) && /^[A-Za-z0-9_-]+$/.test(seg)) ? ':id' : seg)).join('/') || '/';
}

/** The area of the site a page belongs to: its first two path segments (/dashboard/documents/:id/edit -> /dashboard/documents). */
export function siteArea(path: string): string {
  const segs = routeTemplate(path).split('/').filter(Boolean).slice(0, 2);
  return `/${segs.join('/')}`;
}

/** The area that took most of the recent actions, when it took at least `share` of the last `window` (and the window is full). */
export function dominantArea(paths: readonly string[], window = 60, share = 0.75): { area: string; count: number; window: number } | null {
  if (paths.length < window) return null;
  const counts = new Map<string, number>();
  for (const p of paths.slice(-window)) { const a = siteArea(p); counts.set(a, (counts.get(a) ?? 0) + 1); }
  const [area, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return count >= Math.ceil(window * share) ? { area, count, window } : null;
}
