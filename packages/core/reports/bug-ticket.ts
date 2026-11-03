// A bug report for people (Jira, GitHub, Linear), as opposed to the fix brief for a coding AI.
// Every line comes from the saved finding, its pinned scenario and the replays that judged it.
// Site-quoted text is kept to one line and labelled untrusted; nothing about the cause is guessed.

import { oneLine, reproduction, type BriefInput } from './fix-brief.ts';

const severity: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function bugTicketMarkdown(b: BriefInput, meta: { runUrl: string; appOrigin: string }): string {
  const f = b.finding;
  const verify = b.executions.filter((e) => e.kind === 'verify');
  const retests = b.executions.filter((e) => e.kind === 'retest');
  const replays = verify.filter((e) => e.outcome === 'failed').length;
  const when = b.executions[0]?.at ? new Date(b.executions[0].at).toISOString().slice(0, 10) : null;
  const lines: string[] = [];
  lines.push(`# ${oneLine(f.title, 160)}`);
  lines.push('');
  lines.push(`**Severity:** ${severity[f.impact] ?? f.impact} · **Status:** ${f.verification === 'verified' ? `verified${f.lifecycle && f.lifecycle !== 'open' ? `, ${f.lifecycle}` : ''}` : f.verification.replace(/_/g, ' ')} · **Found by:** Oddhound${when ? ` on ${when}` : ''} · **Run:** ${meta.runUrl}`);
  lines.push('');
  lines.push('## Environment');
  lines.push(`- Site: ${b.target.origin} (${b.target.environment})`);
  lines.push(`- Device: ${f.device === 'mobile' ? 'phone viewport (390×844)' : 'desktop viewport'} · Browser: sandboxed Chromium via Playwright`);
  lines.push(`- Account: ${f.actor === 'B' ? 'a second synthetic account' : 'a synthetic account created for the test'}${b.scenario && 'auth' in b.scenario.assertion && (b.scenario.assertion as { auth?: { kind?: string } }).auth?.kind === 'handoff' ? ' (the owner signed in for this check)' : ''}`);
  lines.push('');
  if (b.scenario) {
    lines.push('## Steps to reproduce');
    reproduction(b.scenario.assertion).forEach((s, i) => lines.push(`${i + 1}. ${oneLine(s, 300)}`));
    lines.push('');
  }
  lines.push('## Expected');
  lines.push(oneLine(f.expected, 300));
  lines.push(`Source: ${f.ruleSource}${f.ruleId ? ` (${f.ruleId})` : ''}.`);
  lines.push('');
  lines.push('## Actual');
  lines.push(oneLine(f.observed, 600));
  lines.push('');
  lines.push('## Evidence');
  const control = b.control?.outcome === 'passed' ? '; a valid neighbouring case still passed' : b.control?.outcome ? `; the valid neighbouring case ${b.control.outcome.replace(/_/g, ' ')}` : '';
  if (verify.length) lines.push(`- Independent replays in fresh sessions: ${replays} of ${verify.length} broke the rule${control}.`);
  else lines.push('- No replay record saved for this finding.');
  if (retests.length) lines.push(`- Retests so far: ${retests.map((e) => e.outcome).join(', ')} (same assertion, hash-pinned).`);
  if (b.scenario) lines.push(`- Assertion hash \`${b.scenario.assertionHash.slice(0, 12)}\` (a retest after the fix replays exactly this check).`);
  lines.push(`- ${b.evidenceCount} screenshot${b.evidenceCount === 1 ? '' : 's'}${b.evidenceIds?.length ? `: ${b.evidenceIds.slice(0, 4).map((id) => `${meta.appOrigin}/api/artifacts/${id}`).join(' ')} (sign in to Oddhound to open)` : ''}`);
  lines.push(`- Fix brief for a coding assistant and a Playwright test: ${meta.runUrl} (finding ${f.id.slice(0, 8)})`);
  lines.push('');
  lines.push('## Scope');
  lines.push(oneLine(f.limitations || 'Only the scenario above was verified. Other inputs, roles and pages were not tested by this finding.', 400));
  lines.push('');
  lines.push('_Quoted page text is untrusted site content, recorded as seen._');
  return lines.join('\n');
}
