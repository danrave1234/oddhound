// Compares a run's findings with the previous completed run of the same site, so a tester after a
// deploy reads only what is new. Findings are matched by the rule they broke (the agent's exact steps
// differ from run to run, so scenario fingerprints do not match); detector observations by fingerprint.
// "Not seen" never means fixed: only a retest replays the pinned assertion.

export type CompareFinding = {
  id: string; title: string; category: string; verification: string; fingerprint: string;
  rule_id?: string | null; rule_source?: string | null; impact?: string | null;
};
export type Comparison = {
  previousRunId: string; previousAt: string | null;
  /** For each established finding of the current run: first seen now, or also established last run. */
  changes: Record<string, 'new' | 'repeat'>;
  /** Established last run, not established this run. Not a fix: the assertion was not replayed. */
  notSeen: { title: string; ruleId: string | null; impact: string | null }[];
};

/** Verified issues and detector observations count; unverified candidates are too noisy to compare. */
export const established = (f: CompareFinding) =>
  (f.category === 'verified_issue' && f.verification === 'verified') || f.category === 'configuration_observation';

function matchKey(f: CompareFinding): string {
  if (f.category === 'verified_issue' && f.rule_id && f.rule_source !== 'agent hypothesis') return `rule:${f.rule_id}`;
  return `fp:${f.fingerprint}`;
}

export function compareFindings(current: CompareFinding[], previous: CompareFinding[], meta: { previousRunId: string; previousAt: string | null }): Comparison {
  const before = new Map<string, CompareFinding>();
  for (const f of previous.filter(established)) if (!before.has(matchKey(f))) before.set(matchKey(f), f);
  const now = new Set(current.filter(established).map(matchKey));
  const changes: Comparison['changes'] = {};
  for (const f of current.filter(established)) changes[f.id] = before.has(matchKey(f)) ? 'repeat' : 'new';
  const notSeen = [...before.entries()].filter(([k]) => !now.has(k)).map(([, f]) => ({ title: f.title, ruleId: f.rule_id ?? null, impact: f.impact ?? null }));
  return { previousRunId: meta.previousRunId, previousAt: meta.previousAt, changes, notSeen };
}
