// A retest replays every verified finding of a run. This folds its saved events into one release
// answer: fixed, still failing, or not decided. Nothing here is inferred; each row is one event.

export type RetestEvent = { type: string; at?: string; payload: Record<string, unknown> };
export type ReleaseRow = { findingId: string; title: string; state: 'fixed' | 'still_failing' | 'undecided'; detail: string };
export type ReleaseCheck = { rows: ReleaseRow[]; fixed: number; stillFailing: number; undecided: number; ready: boolean };

export function releaseCheck(events: RetestEvent[]): ReleaseCheck {
  const rows: ReleaseRow[] = [];
  for (const e of events) {
    const p = e.payload;
    const findingId = String(p.findingId ?? '');
    const title = String(p.title ?? findingId);
    if (e.type === 'retest.blocked') {
      rows.push({ findingId, title, state: 'undecided', detail: `not replayed (${String(p.reason ?? 'blocked').replace(/_/g, ' ')})` });
    } else if (e.type === 'retest.finished') {
      const outcome = String(p.outcome ?? ''), control = String(p.control ?? 'not_run'), lifecycle = String(p.lifecycle ?? '');
      if (lifecycle === 'fixed') rows.push({ findingId, title, state: 'fixed', detail: control === 'passed' ? 'assertion held twice, valid case passed' : 'assertion held twice' });
      else if (outcome === 'failed') rows.push({ findingId, title, state: 'still_failing', detail: lifecycle === 'regressed' ? 'failed again after an earlier fix' : 'assertion still breaks the rule' });
      else rows.push({ findingId, title, state: 'undecided', detail: outcome === 'passed' ? `assertion held but the valid case ${control}` : `replay ${outcome.replace(/_/g, ' ')}` });
    }
  }
  const fixed = rows.filter((r) => r.state === 'fixed').length;
  const stillFailing = rows.filter((r) => r.state === 'still_failing').length;
  const undecided = rows.filter((r) => r.state === 'undecided').length;
  return { rows, fixed, stillFailing, undecided, ready: rows.length > 0 && stillFailing === 0 && undecided === 0 };
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 160);

export function releaseNoteMarkdown(c: ReleaseCheck, meta: { origin: string; runUrl: string; at: string }): string {
  const lines = [
    `## Oddhound release check: ${meta.origin}`,
    `${c.ready ? 'Ready: every verified finding is fixed.' : c.rows.length ? 'Not ready.' : 'Nothing was replayed.'} ${c.fixed} fixed, ${c.stillFailing} still failing, ${c.undecided} undecided. Each check replays the original, hash-pinned assertion twice in fresh sessions.`,
    `Retest run: ${meta.runUrl} (${meta.at})`,
    '',
  ];
  const section = (title: string, state: ReleaseRow['state'], mark: string) => {
    const rows = c.rows.filter((r) => r.state === state);
    if (!rows.length) return;
    lines.push(`### ${title}`);
    for (const r of rows) lines.push(`- ${mark} ${oneLine(r.title)}: ${r.detail}`);
    lines.push('');
  };
  section('Still failing', 'still_failing', '[x]');
  section('Undecided', 'undecided', '[ ]');
  section('Fixed', 'fixed', '[✓]');
  lines.push('Finding titles are quoted from the tested site and are untrusted text.');
  return lines.join('\n');
}
