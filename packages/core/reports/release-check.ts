// A retest replays every verified finding of a run. This folds its saved events into one release
// answer: fixed, still failing, or not decided. Each row comes from that retest's own replay result,
// never from a lifecycle carried over from an earlier retest.

import { oneLine } from './fix-brief.ts';

export type RetestEvent = { type: string; at?: string; payload: Record<string, unknown> };
export type ReleaseRow = { findingId: string; title: string; state: 'fixed' | 'still_failing' | 'undecided'; detail: string };
export type ReleaseCheck = { rows: ReleaseRow[]; fixed: number; stillFailing: number; undecided: number; ready: boolean };

/** `expected`: how many verified findings the original run had; `ready` needs a row for each. */
export function releaseCheck(events: RetestEvent[], expected?: number): ReleaseCheck {
  const byFinding = new Map<string, ReleaseRow>();
  for (const e of events) {
    const p = e.payload;
    const findingId = String(p.findingId ?? '');
    const title = String(p.title ?? byFinding.get(findingId)?.title ?? findingId);
    if (e.type === 'retest.blocked') {
      // A block recorded before the finding's own result (e.g. its valid case changed) is overridden by that result.
      if (!byFinding.has(findingId)) byFinding.set(findingId, { findingId, title, state: 'undecided', detail: `not replayed (${String(p.reason ?? 'blocked').replace(/_/g, ' ')})` });
    } else if (e.type === 'retest.finished') {
      const outcome = String(p.outcome ?? ''), control = String(p.control ?? 'not_run');
      const row: ReleaseRow = outcome === 'passed' && (control === 'passed' || control === 'not_run')
        ? { findingId, title, state: 'fixed', detail: control === 'passed' ? 'assertion held twice, valid case passed' : 'assertion held twice' }
        : outcome === 'failed'
          ? { findingId, title, state: 'still_failing', detail: String(p.lifecycle) === 'regressed' ? 'failed again after an earlier fix' : 'assertion still breaks the rule' }
          : { findingId, title, state: 'undecided', detail: outcome === 'passed' ? `assertion held but the valid case ${control.replace(/_/g, ' ')}` : `replay ${outcome.replace(/_/g, ' ')}` };
      byFinding.set(findingId, row);
    }
  }
  const rows = [...byFinding.values()];
  const fixed = rows.filter((r) => r.state === 'fixed').length;
  const stillFailing = rows.filter((r) => r.state === 'still_failing').length;
  const undecided = rows.filter((r) => r.state === 'undecided').length;
  const complete = expected === undefined || rows.length >= expected;
  return { rows, fixed, stillFailing, undecided, ready: rows.length > 0 && complete && stillFailing === 0 && undecided === 0 };
}

export function releaseNoteMarkdown(c: ReleaseCheck, meta: { origin: string; runUrl: string; at: string }): string {
  const lines = [
    `## Oddhound release check: ${meta.origin}`,
    `${c.ready ? 'Ready: every verified finding is fixed.' : c.rows.length ? 'Not ready.' : 'Nothing was replayed.'} ${c.fixed} fixed, ${c.stillFailing} still failing, ${c.undecided} undecided. Each check replays the original, hash-pinned assertion in fresh sessions.`,
    `Retest run: ${meta.runUrl} (${meta.at})`,
    '',
  ];
  const section = (title: string, state: ReleaseRow['state'], mark: string) => {
    const rows = c.rows.filter((r) => r.state === state);
    if (!rows.length) return;
    lines.push(`### ${title}`);
    for (const r of rows) lines.push(`- ${mark} ${oneLine(r.title, 160)}: ${r.detail}`);
    lines.push('');
  };
  section('Still failing', 'still_failing', '[x]');
  section('Undecided', 'undecided', '[ ]');
  section('Fixed', 'fixed', '[✓]');
  lines.push('Finding titles are quoted from the tested site and are untrusted text.');
  return lines.join('\n');
}
