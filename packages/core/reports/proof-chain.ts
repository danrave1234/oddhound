// Proof chain: the saved record of why a finding is verified, and whether the fix held.
// Built only from stored scenario executions; trusted code decides every leg and the verdict.

import type { Db } from '../db/pool.ts';
import { fenceUntrusted } from './fix-brief.ts';

export type ExecutionRow = {
  scenario_id: string; run_id: string; kind: 'verify' | 'retest'; assertion_hash: string;
  outcome: string; observed: { observed?: string } | null; evidence_ids: string[]; at: Date | string;
};

export type ProofLeg = {
  stage: 'verify' | 'retest';
  role: 'replay' | 'control';
  /** 1-based count within its stage and role, e.g. replay 2 of the verify stage. */
  n: number;
  runId: string;
  outcome: string;
  /** What this leg means for the finding, in plain words. */
  reading: string;
  /** True when this leg ran the same assertion (same hash) that was pinned at verification. */
  pinned: boolean;
  observed: string;
  evidenceIds: string[];
  at: string;
};

export type ProofChain = {
  findingId: string;
  title: string;
  ruleId: string | null;
  ruleText: string | null;
  expected: string;
  observed: string;
  lifecycle: string | null;
  verification: string;
  assertionHash: string | null;
  /** Every replay leg used the pinned assertion. A control has its own, separately pinned hash. */
  unchanged: boolean;
  legs: ProofLeg[];
  verdict: { state: 'verified' | 'not_verified' | 'fixed' | 'still_failing' | 'regressed' | 'retest_inconclusive'; text: string };
  retestOrigins: Record<string, string>;
};

function reading(role: ProofLeg['role'], outcome: string): string {
  if (role === 'replay') {
    if (outcome === 'failed') return 'Rule broken again';
    if (outcome === 'passed') return 'Rule held';
  } else {
    if (outcome === 'passed') return 'Valid case accepted';
    if (outcome === 'failed') return 'Valid case also failed';
  }
  if (outcome === 'blocked') return 'Could not run';
  return 'Could not judge';
}

/** Pure: order the executions into legs and compute the verdict. */
export function buildProofChain(input: {
  finding: { id: string; title: string; rule_id: string | null; expected: string; observed: string; lifecycle: string | null; verification: string; scenario_id: string | null; control_scenario_id: string | null };
  scenario: { assertion_hash: string; rule_text: string } | null;
  controlHash: string | null;
  executions: ExecutionRow[];
  retestOrigins?: Record<string, string>;
}): ProofChain {
  const { finding: f, scenario } = input;
  const sorted = [...input.executions].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const counters = new Map<string, number>();
  const legs: ProofLeg[] = [];
  for (const e of sorted) {
    const role: ProofLeg['role'] = e.scenario_id === f.scenario_id ? 'replay' : 'control';
    if (role === 'control' && e.scenario_id !== f.control_scenario_id) continue;
    const key = `${e.kind}:${role}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    const expectedHash = role === 'replay' ? scenario?.assertion_hash : input.controlHash;
    legs.push({
      stage: e.kind, role, n, runId: e.run_id, outcome: e.outcome, reading: reading(role, e.outcome),
      pinned: Boolean(expectedHash) && e.assertion_hash === expectedHash,
      observed: String(e.observed?.observed ?? ''), evidenceIds: e.evidence_ids ?? [],
      at: new Date(e.at).toISOString(),
    });
  }
  const unchanged = legs.every((l) => l.pinned);
  const verify = legs.filter((l) => l.stage === 'verify');
  const verifyFails = verify.filter((l) => l.role === 'replay' && l.outcome === 'failed').length;
  const controlOk = verify.some((l) => l.role === 'control' && l.outcome === 'passed');
  const lastRetest = [...legs].reverse().find((l) => l.stage === 'retest' && l.role === 'replay');
  const lastRetestControl = lastRetest && legs.filter((l) => l.stage === 'retest' && l.role === 'control' && l.runId === lastRetest.runId).at(-1);

  let verdict: ProofChain['verdict'];
  if (f.verification !== 'verified') {
    verdict = { state: 'not_verified', text: 'Not verified: fresh replays did not confirm this candidate.' };
  } else if (!lastRetest) {
    verdict = { state: 'verified', text: `Verified: the rule broke in ${verifyFails} fresh ${verifyFails === 1 ? 'replay' : 'replays'}${controlOk ? ' while a valid case still passed' : ''}. No retest yet.` };
  } else if (!unchanged) {
    verdict = { state: 'retest_inconclusive', text: 'The assertion changed after verification, so this retest does not count.' };
  } else if (lastRetest.outcome === 'passed' && (!lastRetestControl || lastRetestControl.outcome === 'passed')) {
    verdict = { state: 'fixed', text: 'Fixed: the same, unchanged assertion now holds' + (lastRetestControl ? ' and the valid case still passes.' : '.') };
  } else if (lastRetest.outcome === 'failed') {
    verdict = f.lifecycle === 'regressed'
      ? { state: 'regressed', text: 'Regressed: the unchanged assertion fails again after an earlier fix.' }
      : { state: 'still_failing', text: 'Still failing: the unchanged assertion breaks the rule on the retested build.' };
  } else {
    verdict = { state: 'retest_inconclusive', text: `The retest could not judge the fix (${lastRetest.outcome}${lastRetestControl && lastRetestControl.outcome !== 'passed' ? `; valid case ${lastRetestControl.outcome}` : ''}).` };
  }

  return {
    findingId: f.id, title: f.title, ruleId: f.rule_id, ruleText: scenario?.rule_text ?? null,
    expected: f.expected, observed: f.observed, lifecycle: f.lifecycle, verification: f.verification,
    assertionHash: scenario?.assertion_hash ?? null, unchanged, legs, verdict, retestOrigins: input.retestOrigins ?? {},
  };
}

/** Loads the chain for one finding. Caller must already have authorised access to its run. */
export async function loadProofChain(db: Db, findingId: string): Promise<ProofChain | null> {
  const f = (await db.query(`SELECT id, title, rule_id, expected, observed, lifecycle, verification, scenario_id, control_scenario_id FROM findings WHERE id = $1`, [findingId])).rows[0];
  if (!f) return null;
  const scenario = f.scenario_id ? (await db.query<{ assertion_hash: string; rule_text: string }>('SELECT assertion_hash, rule_text FROM scenarios WHERE id = $1', [f.scenario_id])).rows[0] ?? null : null;
  const controlHash = f.control_scenario_id ? (await db.query<{ assertion_hash: string }>('SELECT assertion_hash FROM scenarios WHERE id = $1', [f.control_scenario_id])).rows[0]?.assertion_hash ?? null : null;
  const ids = [f.scenario_id, f.control_scenario_id].filter(Boolean);
  const executions = ids.length ? (await db.query<ExecutionRow>(
    `SELECT scenario_id, run_id, kind, assertion_hash, outcome, observed, evidence_ids, at FROM scenario_executions WHERE scenario_id = ANY($1::uuid[]) ORDER BY at`, [ids])).rows : [];
  const retestRuns = [...new Set(executions.filter((e) => e.kind === 'retest').map((e) => e.run_id))];
  const origins = retestRuns.length ? (await db.query<{ id: string; origin: string }>('SELECT id, origin FROM runs WHERE id = ANY($1::uuid[])', [retestRuns])).rows : [];
  return buildProofChain({ finding: f, scenario, controlHash, executions, retestOrigins: Object.fromEntries(origins.map((r) => [r.id, r.origin])) });
}

export const legName = (l: ProofLeg) => l.stage === 'verify'
  ? (l.role === 'replay' ? `Verification replay ${l.n}` : 'Valid case')
  : (l.role === 'replay' ? `Retest ${l.n}` : `Retest ${l.n}, valid case`);

/** Markdown for a pull request description: what broke, the pinned check, and what the retest saw. */
export function fixReceiptMarkdown(c: ProofChain, links: { run: string }): string {
  const lines = [
    `### Oddhound fix receipt: ${fenceUntrusted(c.title)}`,
    '',
    `**${c.verdict.text}**`,
    '',
    c.ruleId ? `Rule ${c.ruleId}${c.ruleText ? `: ${fenceUntrusted(c.ruleText)}` : ''}` : 'Rule: none recorded',
    `Assertion \`${c.assertionHash ?? 'none'}\`, ${c.unchanged ? 'unchanged in every check below' : 'CHANGED after verification (retest does not count)'}.`,
    '',
    '| Check | Result | Target | When (UTC) |',
    '|---|---|---|---|',
    ...c.legs.map((l) => `| ${legName(l)} | ${l.reading} (${l.outcome}) | ${l.stage === 'retest' ? (c.retestOrigins[l.runId] ?? 'retested build') : 'original build'} | ${l.at.slice(0, 16).replace('T', ' ')} |`),
    '',
    `Expected: ${fenceUntrusted(c.expected)}`,
    '',
    `Evidence and replays: ${links.run}`,
    '',
    '_Checked by Oddhound in fresh browser sessions. A pass means the rule held in the tested scope, not that the app has no other defects._',
  ];
  return lines.join('\n');
}
