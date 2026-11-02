// Trusted discovery ledger. A visit is not an outcome check; neither claims complete app coverage.
// No browsing happens here. Every suggested destination must still pass the ordinary action policy.
import { createHash } from 'node:crypto';
import type { Observation, ObservedElement } from '../browser/snapshot.ts';
import { safeDiscoveryPath } from '../browser/site-map.ts';

export type FrontierEntry = {
  id: string; kind: 'route' | 'control'; path: string; label: string; source: string;
  status: 'pending' | 'visited' | 'blocked'; visited: boolean; checked: boolean; attempts: number; reason?: string;
  priority: number; discoveredFrom?: string; excluded?: boolean; listed?: boolean;
};
const DYNAMIC = /^(?:\d{4}-\d{2}(?:-\d{2})?|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{24,64}|[0-7][0-9A-HJKMNP-TV-Z]{25})$/i;
const REVEAL = /^(?:(?:open|toggle|show)\s+)?(?:menu|navigation|browse|more|sections|categories|workspace|account|profile)\b/i;
const idFor = (key: string) => createHash('sha256').update(key).digest('hex').slice(0, 16);

export class NavigationFrontier {
  readonly #origin: string;
  readonly #allowed: (path: string) => boolean;
  readonly #entries = new Map<string, FrontierEntry>();
  readonly #changes = new Map<string, FrontierEntry>();
  readonly #families = new Map<string, Set<string>>();
  #revision = 0;
  #sampledVariants = 0;
  readonly #sampled = new Set<string>();
  readonly #listedContexts = new Map<string, Set<string>>();
  readonly #controlKinds = new Map<string, { signature: string; reveal: boolean }>();
  readonly #openedControls = new Set<string>();
  readonly #continuations = new Set<string>();
  #continueOnPath: string | null = null;
  readonly #branchParts = new Map<string, string[]>();
  #context = 'A:desktop:0';
  #currentPath: string | null = null;
  #lastDiscoveryKind: 'route' | 'control' = 'control';
  constructor(origin: string, allowed: (path: string) => boolean) { this.#origin = new URL(origin).origin; this.#allowed = allowed; }

  path(href: string, from = `${this.#origin}/`): string | null {
    const path = this.#cleanPath(href, from);
    return path && this.#allowed(path) ? path : null;
  }
  #cleanPath(href: string, from = `${this.#origin}/`): string | null {
    return safeDiscoveryPath(href, this.#origin, from);
  }

  #changed(entry: FrontierEntry) { this.#revision++; this.#changes.set(entry.id, { ...entry }); }
  #family(path: string): string {
    const u = new URL(path, this.#origin);
    const part = (url: URL) => {
      const calendar = /\/(?:calendar|dates?|schedule)\//i.test(url.pathname);
      const segments = url.pathname.split('/').map(s => DYNAMIC.test(s) || (calendar && /^\d+$/.test(s)) ? ':value' : s);
      const query = [...url.searchParams].map(([k, v]) => `${k}=${/^(?:cursor|date|day|month|year|q|search)$/i.test(k) || DYNAMIC.test(v) || (/^(?:id|record_id|item_id)$/i.test(k) && /^\d+$/.test(v)) ? ':value' : v}`);
      return `${segments.join('/')}?${query.join('&')}`;
    };
    const hash = /^#!?\//.test(u.hash) ? `#${part(new URL(u.hash.replace(/^#!/, '').replace(/^#/, ''), this.#origin))}` : '';
    return `${part(u)}${hash}`;
  }

  discover(href: string, source: string, from?: string, label = '', context = 'A:desktop:0'): FrontierEntry | null {
    const path = this.#cleanPath(href, from);
    if (!path) return null;
    const id = idFor(`route:${path}`);
    const known = this.#entries.get(id);
    const listed = source === 'sitemap' || source.includes(':link') || source.includes('hidden-menu');
    if (known) {
      if (listed) this.#recordListing(id, context);
      if (listed && !known.listed) { known.listed = true; this.#changed(known); }
      return known;
    }
    if (!this.#allowed(path)) {
      const entry: FrontierEntry = { id, kind: 'route', path, label: label.slice(0, 120), source, listed, status: 'blocked', visited: false, checked: false, attempts: 0, priority: 0,
        excluded: true, reason: 'Excluded by the run contract; no navigation or action authority.' };
      this.#entries.set(id, entry); if (listed) this.#recordListing(id, context); this.#changed(entry); return entry;
    }
    const family = this.#family(path), representatives = this.#families.get(family) ?? new Set<string>();
    // Sample record/date/cursor/search variants, not distinct named pages or enum filter states.
    const evidence = ['navigation', 'redirect', 'popup', 'action', 'assertion'].includes(source);
    if (!evidence && !representatives.has(path) && representatives.size >= 3) { if (!this.#sampled.has(path)) { this.#sampled.add(path); this.#sampledVariants++; } return null; }
    if (evidence && this.#sampled.delete(path)) this.#sampledVariants--;
    representatives.add(path); this.#families.set(family, representatives);
    const entry: FrontierEntry = { id, kind: 'route', path, label: label.slice(0, 120), source, listed, status: 'pending', visited: false, checked: false, attempts: 0,
      priority: /(?:log.?out|sign.?out)/i.test(`${path} ${label}`) ? 10 : /header|nav|aside|menu|popup|redirect/.test(source) ? 90 : source === 'sitemap' ? 40 : 70, ...(from ? { discoveredFrom: this.path(from) ?? undefined } : {}) };
    this.#entries.set(id, entry); if (listed) this.#recordListing(id, context); this.#changed(entry); return entry;
  }

  #recordListing(id: string, context: string) {
    const contexts = this.#listedContexts.get(id) ?? new Set<string>();
    contexts.add(context); this.#listedContexts.set(id, contexts);
  }

  #control(o: Observation, el: ObservedElement): FrontierEntry | null {
    if (el.href || el.disabled || !el.label || !['button', 'widget', 'clickable'].includes(el.kind)) return null;
    const reveal = Boolean(el.hasPopup || el.expanded !== undefined || el.role === 'tab' || el.role === 'menuitem' || REVEAL.test(el.label));
    const navigation = reveal || ['header', 'nav', 'aside'].includes(el.region ?? '');
    if (!navigation || /log ?out|sign ?out|delete|remove|cancel|pay|buy/i.test(el.label)) return null;
    const path = this.path(o.url); if (!path) return null;
    const id = idFor(`control:${path}:${el.kind}:${el.label}`);
    this.#controlKinds.set(id, { reveal, signature: idFor(JSON.stringify([this.#context, el.region, el.kind, el.role, el.label, Boolean(el.hasPopup), el.expanded !== undefined])) });
    let entry = this.#entries.get(id);
    if (!entry) {
      entry = { id, kind: 'control', path, label: el.label, source: el.region ?? 'menu', status: 'pending', visited: false, checked: false, attempts: 0, priority: reveal ? 100 : 30 };
      // Follow newly revealed nested navigation before leaving would destroy its
      // prerequisite UI state. Existing repeated chrome still uses fair ordering.
      if (reveal && this.#continueOnPath === path) this.#continuations.add(id);
      this.#entries.set(id, entry); this.#changed(entry);
    }
    return entry;
  }

  observe(o: Observation, context = 'A:desktop:0') {
    this.#context = context; this.#currentPath = this.path(o.url);
    const current = this.discover(o.url, 'navigation');
    if (current && !current.excluded && (!current.visited || current.status === 'pending')) { current.visited = true; current.status = 'visited'; delete current.reason; this.#changed(current); }
    for (const link of o.navigationLinks ?? []) this.discover(link.href, `${link.region ?? 'page'}${link.hidden ? ':hidden-menu' : ':link'}`, o.url, link.label, context);
    for (const el of o.elements) {
      if (el.href) this.discover(el.href, `${el.region ?? 'page'}:link`, o.url, el.label, context);
      this.#control(o, el);
    }
    this.#continueOnPath = null;
  }

  navigation(url: string, source = 'redirect') {
    const entry = this.discover(url, source);
    if (entry && !entry.excluded && (!entry.visited || entry.status === 'pending')) { entry.visited = true; entry.status = 'visited'; this.#changed(entry); }
  }
  attempted(path: string, landed: string, error?: string | null) {
    const entry = this.discover(path, 'action'); if (!entry || entry.excluded) return;
    entry.attempts++;
    this.#lastDiscoveryKind = 'route';
    const authRequired = this.path(landed) !== entry.path && /\/(?:login|signin|sign-in|sign_in|auth)(?:[/?#]|$)/i.test(this.path(landed) ?? '');
    entry.status = error || authRequired ? 'blocked' : 'visited';
    entry.visited ||= !error && !authRequired;
    entry.reason = error?.slice(0, 180) ?? (authRequired ? 'Authentication prerequisite: revisit after sign-in.' : this.path(landed) !== entry.path ? `Redirected to ${this.path(landed) ?? 'a refused destination'}` : undefined);
    this.#changed(entry);
  }
  authenticated() {
    for (const entry of this.#entries.values()) if (entry.status === 'blocked' && entry.reason?.startsWith('Authentication prerequisite:')) {
      entry.status = 'pending'; delete entry.reason; this.#changed(entry);
    }
  }
  exercised(o: Observation, ref: string, error?: string | null) {
    const el = o.elements.find(e => e.ref === ref); if (!el) return;
    const entry = this.#control(o, el); if (!entry) return;
    this.#lastDiscoveryKind = 'control';
    const metadata = this.#controlKinds.get(entry.id);
    if (!error && metadata) this.#openedControls.add(metadata.signature);
    if (!error && metadata?.reveal) this.#continueOnPath = entry.path;
    entry.attempts++; entry.status = error ? 'blocked' : 'visited'; entry.visited ||= !error; entry.reason = error?.slice(0, 180); this.#changed(entry);
  }
  checked(url: string, detail: string) {
    const entry = this.discover(url, 'assertion'); if (!entry || entry.excluded) return;
    entry.checked = true; entry.reason = detail.slice(0, 180); this.#changed(entry);
  }
  block(id: string, reason: string): string {
    const entry = this.#entries.get(id);
    if (!entry) return 'Unknown frontier entry.';
    if (!entry.attempts) return 'Visit or attempt the navigation first; undiscovered capability or lack of time is not observed blocking evidence.';
    entry.status = 'blocked'; entry.reason = reason.slice(0, 180); this.#changed(entry);
    return `Recorded limitation for ${entry.path}: ${entry.reason}`;
  }
  #parts(path: string): string[] {
    const saved = this.#branchParts.get(path); if (saved) return saved;
    const url = new URL(path, this.#origin);
    const route = /^#!?\//.test(url.hash) ? `${url.pathname}/#${new URL(url.hash.replace(/^#!/, '').replace(/^#/, ''), this.#origin).pathname}` : url.pathname;
    // Root query/hash states are a branch too. An empty prefix otherwise always has
    // zero visits, letting a growing root pagination stream outrank every catalogue.
    const parts = route.split('/').filter(Boolean).map(part => DYNAMIC.test(part) ? ':record' : part);
    if (!parts.length) parts.push('@root');
    this.#branchParts.set(path, parts); return parts;
  }
  pending() {
    const all = [...this.#entries.values()];
    const visits = new Map<string, number>();
    for (const entry of all) if (entry.kind === 'route' && entry.visited) {
      const parts = this.#parts(entry.path);
      for (let depth = 1; depth <= parts.length; depth++) {
        const key = JSON.stringify(parts.slice(0, depth)); visits.set(key, (visits.get(key) ?? 0) + 1);
      }
    }
    const group = (entry: FrontierEntry) => {
      if (entry.kind === 'route') return this.#lastDiscoveryKind === 'route' ? 1 : 0;
      if (entry.path === this.#currentPath && this.#continuations.has(entry.id)) return -1;
      const metadata = this.#controlKinds.get(entry.id);
      if (metadata?.reveal && !this.#openedControls.has(metadata.signature)) return this.#lastDiscoveryKind === 'route' ? 0 : 1;
      return metadata?.reveal ? 2 : 3;
    };
    return all.filter(e => e.status === 'pending').sort((a, b) => {
      const grouped = group(a) - group(b); if (grouped) return grouped;
      if (a.kind === 'route' && b.kind === 'route') {
        // Prefer less-visited sibling branches at every depth, without target-specific path names.
        // This only schedules work: it never merges routes or claims sibling features were tested.
        const left = this.#parts(a.path), right = this.#parts(b.path);
        for (let depth = 1; depth <= Math.max(left.length, right.length); depth++) {
          const count = (parts: string[]) => depth > parts.length ? 0 : visits.get(JSON.stringify(parts.slice(0, depth))) ?? 0;
          const difference = count(left) - count(right); if (difference) return difference;
        }
      } else if (a.kind === 'control' && b.kind === 'control') {
        const current = Number(b.path === this.#currentPath) - Number(a.path === this.#currentPath); if (current) return current;
      }
      return b.priority - a.priority;
    });
  }
  wasListed(href: string, context = 'A:desktop:0') {
    const path = this.path(href);
    return path ? this.#listedContexts.get(idFor(`route:${path}`))?.has(context) === true : false;
  }
  next(count = 6) { return this.pending().slice(0, count); }
  hint() { return this.notebook(); }
  add(href: string, from?: string, context = 'A:desktop:0') { return this.discover(href, 'sitemap', from, '', context); }
  get entries() { return this.#entries; }
  dispose(path: string, disposition: 'blocked' | 'skipped', reason: string): boolean {
    const entry = [...this.#entries.values()].find(e => e.kind === 'route' && e.path === this.path(path));
    if (!entry || !entry.attempts || reason.trim().length < 5) return false;
    this.block(entry.id, `${disposition}: ${reason}`); return true;
  }
  summary() {
    const all = [...this.#entries.values()], routes = all.filter(e => e.kind === 'route'), pending = this.pending();
    return { revision: this.#revision, discovered: routes.length, visited: routes.filter(e => e.visited).length,
      outcomeChecked: routes.filter(e => e.checked).length, blocked: all.filter(e => e.status === 'blocked').length, excluded: routes.filter(e => e.excluded).length,
      pendingRoutes: pending.filter(e => e.kind === 'route').length, pendingControls: pending.filter(e => e.kind === 'control').length,
      sampledVariants: this.#sampledVariants, next: pending.slice(0, 12).map(e => ({ ...e })) };
  }
  drainChanges() { const changes = [...this.#changes.values()]; this.#changes.clear(); return changes; }
  notebook() {
    const s = this.summary();
    return `EXPLORATION FRONTIER: ${s.discovered} discovered routes; ${s.visited} visited; ${s.outcomeChecked} with an explicit checked outcome; ${s.pendingRoutes} unvisited routes; ${s.pendingControls} navigation controls unopened; ${s.blocked} blocked; ${s.sampledVariants} repeated record/date/query variants sampled. Visits are not functional coverage.\n${s.next.map(e => `- ${e.id} ${e.kind} ${JSON.stringify(e.path)} ${JSON.stringify(e.label)} via ${e.source}`).join('\n')}${s.pendingRoutes + s.pendingControls > s.next.length ? '\nMore pending entries remain and will be surfaced as these are handled.' : ''}`;
  }
}
