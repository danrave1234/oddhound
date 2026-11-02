// Discovered URLs are work, not coverage. This queue is maintained outside the model and survives
// conversation compaction through the notebook. No discovered origin can expand the run's grant.
import { pagePath } from '../browser/site-map.ts';
import type { Observation } from '../browser/snapshot.ts';

export type DiscoveryEntry = { path: string; family: string; visited: boolean; disposition?: 'blocked' | 'skipped'; reason?: string };
export type ExplorationSummary = { discovered: number; visited: number; pending: number; blocked: number; skipped: number; overflow: boolean; entries: DiscoveryEntry[] };
export class Exploration {
  readonly entries = new Map<string, DiscoveryEntry>();
  overflow = false;
  readonly origin: string;
  readonly allowed: (path: string) => boolean;
  readonly capacity: number;
  constructor(origin: string, allowed: (path: string) => boolean, capacity = 5000) {
    this.origin = origin; this.allowed = allowed; this.capacity = capacity;
  }
  add(href: string, base = this.origin): void {
    let url: URL;
    try { url = new URL(href, base); } catch { return; }
    if (url.username || url.password || /(?:token|secret|password|code|session|signature|key)=/i.test(url.search)) return;
    const path = pagePath(url.href, this.origin);
    if (!path || path.length > 300 || this.entries.has(path)) return;
    if (this.entries.size >= this.capacity) { this.overflow = true; return; }
    const family = url.pathname.replace(/\/(?:\d+|[a-f\d]{8}-[a-f\d-]{27,})(?=\/|$)/gi, '/:id');
    this.entries.set(path, { path, family, visited: false, ...(!this.allowed(path) ? { disposition: 'blocked' as const, reason: 'Denied by run contract' } : {}) });
  }
  observe(o: Observation): void {
    this.add(o.url);
    const path = pagePath(o.url, this.origin);
    const current = path ? this.entries.get(path) : undefined;
    if (current) current.visited = true;
    for (const e of o.elements) if (e.kind === 'link' && e.href) this.add(e.href, o.url);
  }
  dispose(path: string, disposition: 'blocked' | 'skipped', reason: string): boolean {
    const entry = this.entries.get(path);
    if (!entry || reason.trim().length < 5) return false;
    entry.disposition = disposition; entry.reason = reason;
    return true;
  }
  // Breadth first across route families, then individual records. Sampling never marks siblings visited.
  next(count = 6): DiscoveryEntry[] {
    const seen = new Set([...this.entries.values()].filter(e => e.visited).map(e => e.family));
    const pending = [...this.entries.values()].filter(e => !e.visited && !e.disposition);
    const ordered: DiscoveryEntry[] = [];
    for (const e of pending) if (!seen.has(e.family)) { ordered.push(e); seen.add(e.family); }
    return [...ordered, ...pending.filter(e => !ordered.includes(e))].slice(0, count);
  }
  summary(): ExplorationSummary {
    const entries = [...this.entries.values()];
    return { discovered: entries.length, visited: entries.filter(e => e.visited).length,
      pending: entries.filter(e => !e.visited && !e.disposition).length,
      blocked: entries.filter(e => e.disposition === 'blocked').length,
      skipped: entries.filter(e => e.disposition === 'skipped').length, overflow: this.overflow, entries };
  }
  hint(): string {
    const s = this.summary();
    return `Discovery: ${s.visited}/${s.discovered} URLs visited; ${s.pending} pending; ${s.blocked} blocked; ${s.skipped} skipped.${s.overflow ? ' Discovery inventory reached its capacity; coverage is incomplete.' : ''} Next: ${this.next(12).map(e => e.path).join(', ') || 'none'}.`;
  }
}
