import 'server-only';
import { db } from './server';
import { runSpend } from '@core/ledger/spend.ts';
import { loadProofChain, type ProofChain } from '@core/reports/proof-chain.ts';
import { pageName } from '@/app/runs/[id]/trail-data';
import { withBuildNames } from './proof';
import { placeOf, type CourseStop } from '@/ui/course';

/** The page a saved assertion tests (form page or checked path). Setup pages such as sign-up or lists do not count. */
function testedPlace(assertion: unknown): string | null {
  const a = assertion as { form?: { path?: unknown }; path?: unknown } | null;
  const p = typeof a?.form?.path === 'string' ? a.form.path : typeof a?.path === 'string' ? a.path : null;
  return p && p.startsWith('/') ? placeOf(p) : null;
}

export type LandingRun = {
  runId: string;
  model: string | null;
  provider: string | null;
  offline: boolean;
  stops: CourseStop[];
  actions: number;
  places: number;
  verified: number;
  minutes: number | null;
  spendUsd: number;
  featured: ProofChain | null;
};

/** The recorded run the landing page shows, read from saved records only. Null when none exists. */
export async function loadLandingRun(runId: string | null): Promise<LandingRun | null> {
  if (!runId) return null;
  const pool = db();
  const run = (await pool.query(`SELECT id, provider, model, started_at, finished_at FROM runs WHERE id = $1`, [runId])).rows[0];
  if (!run) return null;
  const [places, findings, actions, spend] = await Promise.all([
    pool.query<{ route: string; title: string }>(`SELECT route, (array_agg(title ORDER BY first_seen_at))[1] AS title FROM graph_states WHERE run_id = $1 GROUP BY route ORDER BY min(first_seen_at) LIMIT 10`, [runId]),
    pool.query<{ id: string; impact: string; assertion: unknown; control_scenario_id: string | null; retests: number }>(
      `SELECT f.id, f.impact, s.assertion, f.control_scenario_id,
        (SELECT count(*)::int FROM scenario_executions e WHERE e.scenario_id = f.scenario_id AND e.kind = 'retest') AS retests
       FROM findings f JOIN scenarios s ON s.id = f.scenario_id
       WHERE f.run_id = $1 AND f.verification = 'verified' AND f.category = 'verified_issue'
       ORDER BY CASE f.impact WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, f.created_at`, [runId]),
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM actions WHERE run_id = $1`, [runId]),
    runSpend(pool, runId),
  ]);
  const broken = new Set<string>();
  for (const f of findings.rows) { const p = testedPlace(f.assertion); if (p) broken.add(p); }
  const stops: CourseStop[] = places.rows.map((p) => ({ key: p.route, route: p.route, label: pageName(p.route), title: p.title || pageName(p.route), failed: broken.has(placeOf(p.route)) }));
  // Feature the finding with the fullest proof: a valid-case control and a retest, then by impact.
  const best = [...findings.rows].sort((a, b) => (Number(Boolean(b.control_scenario_id)) + Number(b.retests > 0)) - (Number(Boolean(a.control_scenario_id)) + Number(a.retests > 0)))[0];
  const minutes = run.started_at && run.finished_at ? Math.max(1, Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 60000)) : null;
  return {
    runId, model: run.model, provider: run.provider, offline: run.provider === 'test-double',
    stops, actions: actions.rows[0]?.n ?? 0, places: places.rows.length, verified: findings.rows.length, minutes,
    spendUsd: spend.settled / 1e6,
    featured: best ? await loadProofChain(pool, best.id).then((c) => (c ? withBuildNames(c) : null)) : null,
  };
}
