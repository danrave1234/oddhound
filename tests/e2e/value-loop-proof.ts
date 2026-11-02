// Explicit operator proof on Oddhound's own labelled fixture. Real Meta; no click script/defect list.
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { admitRun, appendEvent } from '../../packages/core/ledger/runs.ts';
import { runSpend, spendAllowance } from '../../packages/core/ledger/spend.ts';
import { demoTargetContract, writesPermitted, type RunContract } from '../../packages/core/contracts/contract.ts';
import { LIMITS } from '../../packages/core/contracts/limits.ts';
import { executeRun } from '../../packages/core/agent/execute-run.ts';
import { providersFromEnv } from '../../packages/core/providers/openai-compatible.ts';
import { ModalSandboxRuntime, publicIpv4Cidrs } from '../../packages/core/browser/modal-runtime.ts';
import type { GatewayEvaluationPolicy } from '../../packages/core/browser/gateway-evaluation.ts';
import { safeFetch } from '../../packages/core/net/safe-fetch.ts';
import { scenarioHash } from '../../packages/core/verifier/scenario.ts';
import { loadBriefInput } from '../../packages/core/reports/load.ts';
import { fixBriefMarkdown } from '../../packages/core/reports/fix-brief.ts';

const vulnerable = 'https://danravekeh123--oddhound-demo.us-east.modal.run';
const corrected = 'https://danravekeh123--oddhound-demo-fixed.us-east.modal.run';
const ownerId = 'SOFDRITxFaXPsmEoQ7pMJG6IxOmxFTn7';
const db = getPool(), runs: Record<string, unknown>[] = [], checks: { check: string; passed: boolean }[] = [];
const report: Record<string, unknown> = { at: new Date().toISOString(), fixture: 'Oddhound-owned Harbor Table, deliberately seeded defects; corrected build pre-exists', autonomousInputs: 'Application description, expected rules and normal goals only. No target source, selectors, click scripts or defect list supplied to Meta.', runs, checks };
let timer: ReturnType<typeof setInterval> | undefined;
const check = (condition: boolean, label: string) => { checks.push({ check: label, passed: condition }); if (!condition) throw new Error(label); };

function policyFor(runId: string, contract: RunContract): GatewayEvaluationPolicy {
  // A separate operator-only owned-demo grant. This does not bypass site ownership for public URLs.
  if (![vulnerable, corrected].includes(contract.target.origin) || contract.target.verification.kind !== 'demo_target' || contract.target.apiOrigins.length || contract.handoff.enabled) throw new Error('Only the two fixed, owned demo scopes are supported');
  return { version: 1, runId, primaryOrigin: contract.target.origin, apiOrigins: [], writes: writesPermitted(contract), deniedPathPrefixes: [...contract.deniedPathPrefixes], deniedPathKeywords: [...contract.deniedPathKeywords], reservedHosts: ['api.meta.ai','api.modal.com','danravekeh123--oddhound-web.us-east.modal.run'], expiresAt: Date.parse(contract.expiresAt),
    limits: { requests: LIMITS.targetRequestsPerRun, concurrent: LIMITS.targetConcurrentRequests, resourceBytes: LIMITS.targetBytesPerResource, totalBytes: LIMITS.targetBytesPerRun } };
}

async function run(mode: 'demo_target' | 'retest', origin: string, label: string, parent?: string) {
  const contract = demoTargetContract(origin);
  const admitted = await admitRun(db, { principal: `user:${ownerId}:value-loop`, ownerId, projectId: null, mode, contract, spendAccount: 'public', ...(parent ? { parentRunId: parent } : {}) });
  if (!admitted.ok) throw new Error(`Admission refused: ${admitted.reason}`);
  const id = admitted.runId;
  report.currentRunId = id;
  await appendEvent(db, id, 'evaluation.profile', { profile: 'owned-demo-gateway-evaluation', seededFixture: true, publicLaunchClearance: false, model: 'muse-spark-1.3', interceptedTLS: true, sockets: 'disabled' });
  console.log(JSON.stringify({ event: 'value-proof.admitted', id, label, mode, allowance: await spendAllowance(db, id) }));
  const runtime = new ModalSandboxRuntime({ appName: 'oddhound-browser', imageId: 'im-VFVycsDf9x78A5ZYAg47E0', sandboxRuntime: 'vm', connect: 'token', outboundCidrAllowlist: publicIpv4Cidrs(), evaluationPolicy: policyFor(id, contract) });
  const providers = providersFromEnv();
  if (providers.length !== 1 || providers[0]?.id !== 'meta-direct' || providers[0]?.model !== 'muse-spark-1.3') throw new Error('Real standard Meta provider required');
  let busy = false;
  timer = setInterval(() => { if (busy) return; busy = true; void db.query(`SELECT status,(SELECT count(*)::int FROM actions WHERE run_id=r.id) AS actions,(SELECT count(*)::int FROM findings WHERE run_id=r.id AND category='verified_issue' AND verification='verified') AS verified FROM runs r WHERE id=$1`, [id]).then(r=>console.log(JSON.stringify({ event:'value-proof.progress',id,...r.rows[0] }))).finally(()=>{busy=false;}); },30_000);
  let status;
  try { status = await executeRun({ db, runtime, providers, workerId: `value-proof:${id}`, hosted: true, agentMode: 'batch' }, id); }
  finally { if (timer) clearInterval(timer); timer = undefined; }
  const row = (await db.query('SELECT id,status,stop_reason,provider,model,browser_ref,browser_state,sandbox_verdict,started_at,finished_at FROM runs WHERE id=$1',[id])).rows[0];
  const result = { label, ...row, spend: await runSpend(db,id), events: (await db.query(`SELECT seq,type,payload FROM run_events WHERE run_id=$1 AND type IN ('browser.terminated','retest.finished','retest.blocked','run.timings','fixture.reset','fixture.reset_failed') ORDER BY seq`,[id])).rows };
  runs.push(result); console.log(JSON.stringify({ event:'value-proof.terminal',...result }));
  check(row.browser_state === 'terminated', `${label}: confirmed browser destruction`);
  check(row.sandbox_verdict === 'sandbox_on', `${label}: Chromium sandbox enabled`);
  check(status === 'completed', `${label}: completed rather than stopped or blocked`);
  return id;
}

try {
  if (process.env.ODDHOUND_VALUE_PROOF !== '1' || !process.env.ODDHOUND_FIXTURE_RESET_TOKEN) throw new Error('Operator opt-in and owned fixture reset token required');
  await migrate(db);
  for (const [origin, expected] of [[vulnerable, 'vulnerable'], [corrected, 'fixed']]) {
    const health = await safeFetch(`${origin}/__lab/health`, { timeoutMs: 30_000, maxBytes: 4096 });
    check(health.status === 200 && JSON.parse(health.body).build === expected, `owned fixture ${expected} health`);
  }
  const original = await run('demo_target', vulnerable, 'autonomous discovery and verification');
  report.originalRunId = original;
  const findings = (await db.query(`SELECT id,title,rule_id,scenario_id,control_scenario_id,category,verification,lifecycle,expected,observed,evidence_ids FROM findings WHERE run_id=$1 AND category='verified_issue' AND verification='verified' ORDER BY created_at`,[original])).rows;
  check(findings.length > 0, 'at least one independently verified functional defect');
  report.findings = findings;
  const assertions = (await db.query(`SELECT id,assertion,assertion_hash FROM scenarios WHERE run_id=$1 ORDER BY id`,[original])).rows;
  check(assertions.every(s=>scenarioHash(s.assertion)===s.assertion_hash), 'saved assertion JSON matches every original hash');
  report.assertions = assertions;
  report.fixBriefs = [];
  for (const finding of findings) {
    const input = await loadBriefInput(db,finding.id); if (!input) throw new Error('Finding disappeared');
    (report.fixBriefs as unknown[]).push({ findingId:finding.id, text:fixBriefMarkdown(input) });
  }
  const fixed = await run('retest', corrected, 'unchanged assertions on corrected build', original);
  report.fixedRunId = fixed;
  const fixedEvents = (await db.query(`SELECT payload FROM run_events WHERE run_id=$1 AND type='retest.finished'`,[fixed])).rows.map(r=>r.payload);
  check(fixedEvents.length === findings.length && fixedEvents.every(e=>e.outcome==='passed' && (e.control==='passed'||e.control==='not_run') && e.lifecycle==='fixed'), 'corrected build passes original assertions and required controls');
  const negative = await run('retest', vulnerable, 'unchanged assertions on still-broken build', original);
  report.negativeRunId = negative;
  const negativeEvents = (await db.query(`SELECT payload FROM run_events WHERE run_id=$1 AND type='retest.finished'`,[negative])).rows.map(r=>r.payload);
  check(negativeEvents.length === findings.length && negativeEvents.every(e=>e.outcome==='failed' && e.lifecycle==='regressed'), 'still-broken build fails again; no false fixed verdict');
  const after = (await db.query(`SELECT id,assertion,assertion_hash FROM scenarios WHERE run_id=$1 ORDER BY id`,[original])).rows;
  check(JSON.stringify(after) === JSON.stringify(assertions), 'original assertions and hashes unchanged through both retests');
  report.finalLifecycle = (await db.query('SELECT id,lifecycle FROM findings WHERE run_id=$1 AND category=\'verified_issue\' AND verification=\'verified\' ORDER BY id',[original])).rows;
  report.pass = true;
} catch (e) { report.pass=false; report.error=(e as Error).message.replace(/wss?:\/\/\S+/g,'[control-redacted]').slice(0,500); process.exitCode=1; }
finally { if (timer) clearInterval(timer); await closePool(); console.log(`VALUE_LOOP_RESULT ${JSON.stringify(report)}`); }
