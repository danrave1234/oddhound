// The verdict a CI job reads after a deploy. A retest passes only when its release check is ready
// (every verified finding fixed, each assertion held twice); a new exploration passes when it verified
// no bug that the previous run had not already found. Anything the run could not decide is never a pass.

import { releaseCheck, type RetestEvent } from './release-check.ts';
import type { Comparison } from './run-compare.ts';

export type GateFinding = { id: string; title: string; category: string; verification: string };
export type GateInput = {
  kind: 'retest' | 'explore';
  status: string; stopReason?: string | null;
  retestEvents?: RetestEvent[]; expected?: number;
  findings?: GateFinding[]; comparison?: Comparison | null;
};
export type Gate = {
  verdict: 'pending' | 'pass' | 'fail' | 'undecided';
  summary: string;
  fixed?: number; stillFailing?: number; undecided?: number;
  newBugs?: string[]; knownBugs?: number;
};

const ACTIVE = ['queued', 'provisioning', 'running', 'waiting_for_input', 'stopping', 'finalizing'];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function deployGate(g: GateInput): Gate {
  if (ACTIVE.includes(g.status)) return { verdict: 'pending', summary: `Oddhound is ${g.status.replace(/_/g, ' ')}.` };
  // A stopped run still verified what it found (the clock or budget ended exploration, not verification).
  if (g.status !== 'completed' && g.status !== 'stopped') {
    return { verdict: 'undecided', summary: `The run ended ${g.status}${g.stopReason ? ` (${g.stopReason.replace(/_/g, ' ')})` : ''}, so this deploy was not judged.` };
  }
  if (g.kind === 'retest') {
    const rc = releaseCheck(g.retestEvents ?? [], g.expected);
    const counts = { fixed: rc.fixed, stillFailing: rc.stillFailing, undecided: rc.undecided };
    if (rc.ready) return { verdict: 'pass', summary: `All ${plural(rc.fixed, 'verified bug')} fixed: each original assertion held twice in fresh sessions.`, ...counts };
    if (rc.stillFailing) return { verdict: 'fail', summary: `${plural(rc.stillFailing, 'verified bug')} still failing, ${rc.fixed} fixed, ${rc.undecided} undecided.`, ...counts };
    return { verdict: 'undecided', summary: `${rc.fixed} fixed, ${rc.undecided} could not be decided${g.expected && rc.rows.length < g.expected ? `, ${g.expected - rc.rows.length} not replayed` : ''}.`, ...counts };
  }
  const verified = (g.findings ?? []).filter((f) => f.category === 'verified_issue' && f.verification === 'verified');
  // With no earlier run to compare against, every verified bug is new.
  const fresh = verified.filter((f) => !g.comparison || g.comparison.changes[f.id] === 'new');
  const known = verified.length - fresh.length;
  if (fresh.length) return { verdict: 'fail', summary: `${plural(fresh.length, 'new verified bug')}: ${fresh.slice(0, 3).map((f) => f.title.replace(/\s+/g, ' ').slice(0, 80)).join('; ')}.`, newBugs: fresh.map((f) => f.title), knownBugs: known };
  return { verdict: 'pass', summary: `No new verified bugs${known ? ` (${plural(known, 'known bug')} from the previous run still open)` : ''}. A run that verifies nothing has not shown the site is bug-free; it tested what it reached.`, newBugs: [], knownBugs: known };
}
