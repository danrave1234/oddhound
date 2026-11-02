import 'server-only';
import { db } from './server';
import { runSpend, spendAllowance } from '@core/ledger/spend.ts';

export type RunSnapshot = Awaited<ReturnType<typeof loadRunSnapshot>>;

export type ReportVerdict =
  | { verdict: 'reproduced'; findingId: string; title: string }
  | { verdict: 'not_reproduced'; text: string; actions?: number; pages?: number; candidates?: number };

/** Controls in observed pages and how many a browser action actually used (see packages/core/agent/coverage.ts). */
export type Coverage = {
  total: number; exercised: number; blocked: number; pages: number;
  routes: { route: string; total: number; exercised: number; blocked: number }[];
};

/** Everything the run workspace shows, read from saved records only (never invented). */
export async function loadRunSnapshot(runId: string) {
  const pool = db();
  const run = (await pool.query(`SELECT id, project_id, mode, origin, environment, test_mode, status, stop_reason, browser_state, browser_ref, sandbox_verdict,
      provider, model, queued_at, started_at, finished_at, expires_at, parent_run_id, contract->'goals' AS goals, contract->>'report' AS report, contract->'rules' AS rules, contract->'devices' AS devices, COALESCE((contract->'handoff'->>'enabled')::boolean, false) AS handoff_enabled
    FROM runs WHERE id = $1`, [runId])).rows[0];
  if (!run) return null;
  const [workflows, states, transitions, findings, events, actions, shot, spend, children, plan, detected, coverage, mode, exploration, preview, allowance, candidateCount, reportVerdict] = await Promise.all([
    pool.query('SELECT name, status, summary, updated_at FROM workflows WHERE run_id = $1 ORDER BY updated_at', [runId]),
    pool.query('SELECT id, route, title, actor, device, first_seen_at FROM graph_states WHERE run_id = $1 ORDER BY first_seen_at, id', [runId]),
    pool.query('SELECT id, from_state, to_state, label FROM graph_transitions WHERE run_id = $1', [runId]),
    pool.query(`SELECT id, title, category, verification, lifecycle, impact, confidence, rule_id, rule_source, expected, observed, device, actor, limitations, evidence_ids, scenario_id, created_at, updated_at
      FROM findings WHERE run_id = $1 ORDER BY CASE category WHEN 'verified_issue' THEN 0 WHEN 'needs_review' THEN 1 WHEN 'configuration_observation' THEN 2 ELSE 3 END, created_at`, [runId]),
    pool.query('SELECT seq, at, type, payload FROM run_events WHERE run_id = $1 ORDER BY seq DESC LIMIT 301', [runId]),
    pool.query('SELECT seq, actor, device, tool, state, url_after, intended_at FROM actions WHERE run_id = $1 ORDER BY seq DESC LIMIT 61', [runId]),
    pool.query(`SELECT id, label, created_at FROM artifacts WHERE run_id = $1 AND kind = 'screenshot' ORDER BY created_at DESC LIMIT 1`, [runId]),
    runSpend(pool, runId),
    pool.query(`SELECT id, mode, status, created_at FROM runs WHERE parent_run_id = $1 ORDER BY created_at DESC`, [runId]),
    // The agent's own test plan (latest version) and what the automatic detectors raised.
    pool.query(`SELECT payload FROM run_events WHERE run_id = $1 AND type = 'plan.updated' ORDER BY seq DESC LIMIT 1`, [runId]),
    pool.query(`SELECT count(*)::int AS n FROM run_events WHERE run_id = $1 AND type = 'signal.detected'`, [runId]),
    // Coverage of observed states (latest count) and how the model drove the browser.
    pool.query(`SELECT payload FROM run_events WHERE run_id = $1 AND type = 'coverage.updated' ORDER BY seq DESC LIMIT 1`, [runId]),
    pool.query(`SELECT payload FROM run_events WHERE run_id = $1 AND type = 'agent.mode' ORDER BY seq DESC LIMIT 1`, [runId]),
    pool.query(`SELECT payload FROM run_events WHERE run_id = $1 AND type = 'exploration.updated' ORDER BY seq DESC LIMIT 1`, [runId]),
    pool.query(`SELECT seq, state, reason, updated_at FROM run_owner_previews WHERE run_id = $1 AND expires_at > now()`, [runId]),
    spendAllowance(pool, runId),
    pool.query(`SELECT count(*)::int AS n FROM run_events WHERE run_id=$1 AND type='finding.candidate'`, [runId]),
    // Trusted outcome of a bug-report reproduction, written by the run worker (never model text).
    pool.query(`SELECT payload FROM run_events WHERE run_id = $1 AND type = 'report.verdict' ORDER BY seq DESC LIMIT 1`, [runId]),
  ]);
  return {
    run,
    workflows: workflows.rows,
    graph: { states: states.rows, transitions: transitions.rows },
    findings: findings.rows,
    events: events.rows.slice(0, 300).reverse(),
    actions: actions.rows.slice(0, 60),
    history: { eventsHasMore: events.rows.length > 300, actionsHasMore: actions.rows.length > 60 },
    latestScreenshot: shot.rows[0] ?? null,
    preview: preview.rows[0] ?? null,
    exploration: exploration.rows[0]?.payload ?? null,
    spend,
    allowance,
    retests: children.rows,
    plan: ((plan.rows[0]?.payload?.charters ?? []) as { id: string; area: string; risk: string; technique: string; status: string; note: string | null }[]),
    detectedSignals: detected.rows[0]?.n as number ?? 0,
    candidateCount: candidateCount.rows[0]?.n as number ?? 0,
    coverage: (coverage.rows[0]?.payload ?? null) as Coverage | null,
    agentMode: (mode.rows[0]?.payload?.mode ?? null) as string | null,
    reportVerdict: (reportVerdict.rows[0]?.payload ?? null) as ReportVerdict | null,
  };
}
