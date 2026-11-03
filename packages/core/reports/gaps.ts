// What a run saw but did not test, as a checklist a tester can take over by hand. Built only from
// the saved discovery inventory and control coverage; every line names a real page or control count.

export type DiscoveryEntry = { path: string; family?: string; visited: boolean; disposition?: 'blocked' | 'skipped'; reason?: string };
export type CoverageRoute = { route: string; total: number; exercised: number; blocked: number };
export type GapItem = { kind: 'setup' | 'not_opened' | 'blocked' | 'skipped' | 'controls'; path: string; text: string };

import { getDomain } from 'tldts';
import { oneLine } from './fix-brief.ts';

export function untestedChecklist(input: { entries?: DiscoveryEntry[] | null; routes?: CoverageRoute[] | null; setup?: GapItem[]; limit?: number }): GapItem[] {
  const items: GapItem[] = [...(input.setup ?? [])];
  const seen = new Set<string>();
  for (const e of input.entries ?? []) {
    if (e.visited && !e.disposition) continue;
    const key = `${e.disposition ?? 'pending'}:${e.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.disposition === 'blocked') items.push({ kind: 'blocked', path: e.path, text: `${e.path}: blocked, ${oneLine(e.reason ?? 'no reason recorded', 140)}` });
    else if (e.disposition === 'skipped') items.push({ kind: 'skipped', path: e.path, text: `${e.path}: skipped by the agent, ${oneLine(e.reason ?? 'no reason recorded', 140)}` });
    else if (!e.visited) items.push({ kind: 'not_opened', path: e.path, text: `${e.path}: discovered, never opened` });
  }
  for (const r of input.routes ?? []) {
    const untried = r.total - r.exercised - r.blocked;
    if (untried > 0) items.push({ kind: 'controls', path: r.route, text: `${r.route}: ${untried} of ${r.total} controls never tried${r.blocked ? ` (${r.blocked} blocked by the run contract)` : ''}` });
  }
  const order: GapItem['kind'][] = ['setup', 'blocked', 'not_opened', 'controls', 'skipped'];
  items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.path.localeCompare(b.path));
  return items.slice(0, input.limit ?? 200);
}

export function checklistMarkdown(items: GapItem[], meta: { origin: string; runUrl: string }): string {
  const lines = [`## Not tested by Oddhound on ${meta.origin}`, `From run ${meta.runUrl}. A reached page is not a tested page; these are the gaps the run recorded.`, ''];
  if (!items.length) lines.push('- No gaps were recorded. This does not mean everything was tested; only that the run left no pending pages or untried controls.');
  for (const i of items) lines.push(`- [ ] ${i.text}`);
  return lines.join('\n');
}

/** What the run recorded at the edge of its scope (main-frame exits and refused writes). */
export type ScopeEdges = { origin: string; leftTo: string[]; deniedWrites: string[]; signUpUnavailable: boolean };

const SIGN_IN_PROVIDERS: [RegExp, string][] = [
  [/accounts\.google\.com|provider=google/i, 'Google'], [/github\.com\/login\/oauth|provider=github/i, 'GitHub'],
  [/facebook\.com\/.*oauth|provider=facebook/i, 'Facebook'], [/appleid\.apple\.com|provider=apple/i, 'Apple'],
  [/login\.microsoftonline\.com|provider=azure/i, 'Microsoft'],
];
const BOT_CHECKS: [RegExp, string][] = [[/google\.com\/recaptcha|recaptcha\.net/i, 'reCAPTCHA'], [/hcaptcha\.com/i, 'hCaptcha'], [/challenges\.cloudflare\.com/i, 'Cloudflare Turnstile']];

/** Setup the owner can do so the next run reaches the app: built only from recorded scope edges, never guessed. */
export function setupHints(e: ScopeEdges): GapItem[] {
  const out: GapItem[] = [];
  let home: string | null = null;
  try { home = getDomain(new URL(e.origin).hostname, { allowPrivateDomains: true }); } catch { /* unparsable origin: no sibling hints */ }
  const siblings = new Map<string, number>();
  for (const u of e.leftTo) {
    try {
      const url = new URL(u);
      if (!/^https?:$/.test(url.protocol) || url.origin === e.origin) continue;
      if (home && getDomain(url.hostname, { allowPrivateDomains: true }) === home) siblings.set(url.origin, (siblings.get(url.origin) ?? 0) + 1);
    } catch { /* not a URL */ }
  }
  for (const [o, n] of [...siblings.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    out.push({ kind: 'setup', path: o, text: `${o}: the site sent the browser here ${n === 1 ? 'once' : `${n} times`}, but it is not a verified address, so Oddhound stopped at its edge. If your app lives here, verify it as its own site and run there.` });
  }
  const edges = [...e.leftTo, ...e.deniedWrites];
  const provider = SIGN_IN_PROVIDERS.find(([re]) => edges.some((u) => re.test(u)))?.[1];
  const bot = BOT_CHECKS.find(([re]) => edges.some((u) => re.test(u)))?.[1];
  if (provider || bot || e.signUpUnavailable) {
    const why = [provider && `sign-in hands off to ${provider}`, bot && `a ${bot} bot check guards the forms`].filter(Boolean).join(' and ') || 'Oddhound could not complete sign-up on its own';
    out.push({ kind: 'setup', path: e.origin, text: `${e.origin}: ${why}, so the signed-in part of the app went untested. Start the next run with "I'll sign in myself first" to hand over your own session.` });
  }
  return out;
}
