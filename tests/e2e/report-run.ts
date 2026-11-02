// Bug-report reproduction on the local demo target with real Meta inference (costs a few cents).
//   1. run the demo target with a pasted user report (contributor tier: synthetic data only);
//   2. print the trusted report.verdict and the verified findings;
//   3. retest against the corrected build with the unchanged assertions.
// Run: node --env-file=.env tests/e2e/report-run.ts      (needs: node tests/lab/lab.ts up, META_API_KEY)
// Writes docs/evidence/report-reproduction-meta-<date>.json.

import { writeFile } from 'node:fs/promises';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { admitRun } from '../../packages/core/ledger/runs.ts';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { executeRun } from '../../packages/core/agent/execute-run.ts';
import { runtimeFromEnv } from '../../packages/core/browser/select.ts';
import { labProfileFromEnv } from '../../packages/core/net/ip-policy.ts';
import { providersFromEnv } from '../../packages/core/providers/openai-compatible.ts';
import { runSpend } from '../../packages/core/ledger/spend.ts';

const vulnerable = process.env.DEMO_TARGET_ORIGIN ?? 'http://172.30.77.10:4310';
const fixedOrigin = process.env.DEMO_TARGET_FIXED_ORIGIN ?? 'http://172.30.77.11:4311';
const admins = [process.env.DEMO_TARGET_ADMIN_URL ?? 'http://127.0.0.1:4320', process.env.DEMO_TARGET_FIXED_ADMIN_URL ?? 'http://127.0.0.1:4321'];
const REPORT = process.env.REPORT_TEXT ?? 'Hi, my friend booked a table and typed only spaces in the name box because she was in a hurry. It went through and now there is a booking with no name on it in our list. Shouldn\'t the form stop that?';

const env = { ...process.env, META_MODEL_DEMO: process.env.META_MODEL_DEMO ?? 'muse-spark-1.3-contributor' };
const providers = providersFromEnv(env, { runKind: 'demo' });
if (!providers.length) throw new Error('META_API_KEY is not set');
const lab = labProfileFromEnv();
if (!lab) throw new Error('ODDHOUND_LAB_MODE=1 is required for the local lab');

const db = getPool();
try {
  for (const a of admins) await fetch(`${a}/__lab/reset`, { method: 'POST', headers: { 'x-lab-reset-token': process.env.ODDHOUND_FIXTURE_RESET_TOKEN ?? 'local-lab-reset' } });
  await migrate(db);
  await db.query(`UPDATE settings SET value = 'false'::jsonb WHERE key = 'kill_switch'`);
  const deps = { db, runtime: runtimeFromEnv(), providers, workerId: 'report-run', lab, allowOfflineTestDouble: false };

  const admitted = await admitRun(db, { principal: `test:report:${Date.now()}`, ownerId: null, projectId: null, mode: 'demo_target', contract: { ...demoTargetContract(vulnerable), report: REPORT }, spendAccount: 'development' });
  if (!admitted.ok) throw new Error(`admission refused: ${admitted.reason}`);
  const started = Date.now();
  const status = await executeRun(deps, admitted.runId);
  const runId = admitted.runId;
  const run = (await db.query('SELECT status, stop_reason, sandbox_verdict, browser_state, provider, model FROM runs WHERE id = $1', [runId])).rows[0];
  const verdict = (await db.query(`SELECT payload FROM run_events WHERE run_id = $1 AND type = 'report.verdict' ORDER BY seq`, [runId])).rows.map((r) => r.payload);
  const findings = (await db.query(`SELECT id, title, category, verification, rule_id FROM findings WHERE run_id = $1 ORDER BY category, rule_id`, [runId])).rows;
  const spend = await runSpend(db, runId);
  console.log(JSON.stringify({ runId, status, run, seconds: Math.round((Date.now() - started) / 1000), verdict, spendUsd: spend.settled / 1e6 }, null, 2));
  console.table(findings.map((f) => ({ rule: f.rule_id, category: f.category, verification: f.verification, title: f.title.slice(0, 70) })));

  let retest: Record<string, unknown> | null = null;
  if (findings.some((f) => f.category === 'verified_issue' && f.verification === 'verified')) {
    const r = await admitRun(db, { principal: `test:report-retest:${Date.now()}`, ownerId: null, projectId: null, mode: 'retest', contract: demoTargetContract(fixedOrigin), spendAccount: 'development', parentRunId: runId });
    if (!r.ok) throw new Error(`retest refused: ${r.reason}`);
    const rs = await executeRun(deps, r.runId);
    const lifecycles = (await db.query(`SELECT title, lifecycle FROM findings WHERE run_id = $1 AND category = 'verified_issue' ORDER BY title`, [runId])).rows;
    retest = { runId: r.runId, status: rs, lifecycles };
    console.log(JSON.stringify({ retest }, null, 2));
  }
  const out = { at: new Date().toISOString(), report: REPORT, runId, status, run, verdict, findings, spendUsd: spend.settled / 1e6, retest };
  await writeFile(`docs/evidence/report-reproduction-meta-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2));
} finally {
  await closePool();
}
