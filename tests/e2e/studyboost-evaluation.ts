// Explicit owner-operated evaluation, never an HTTP entry point or an automatic test.
// Uses the existing verified project, real Meta adapter and production spend/action ledgers.
// Credentials arrive over stdin from the trusted controller and only vault references reach Meta.
import { createRequire } from 'node:module';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { spendAllowance } from '../../packages/core/ledger/spend.ts';
import { verifyOwnership, type VerificationMethod } from '../../packages/core/verification/ownership.ts';
import { RunContractSchema, withBaselineRules, DEFAULT_DENIED_PATH_KEYWORDS, DEFAULT_DENIED_OPERATIONS } from '../../packages/core/contracts/contract.ts';
import { storeCredential, redactKnownSecrets } from '../../packages/core/ledger/credentials.ts';
import { admitRun, appendEvent } from '../../packages/core/ledger/runs.ts';
import { executeRun } from '../../packages/core/agent/execute-run.ts';
import { providersFromEnv } from '../../packages/core/providers/openai-compatible.ts';
import { ModalSandboxRuntime, publicIpv4Cidrs } from '../../packages/core/browser/modal-runtime.ts';
import { gatewayEvaluationPolicy } from '../../packages/core/browser/gateway-evaluation.ts';

const origin = 'https://preview.studyboost.com';
const apiOrigin = 'https://preview.api.studyboost.com';
const db = getPool();
const broad = process.argv.includes('--broad-exploration');
let secret = '';
let timer: ReturnType<typeof setInterval> | undefined;
try {
  const project = (await db.query(`SELECT p.*, u.revoked FROM projects p JOIN "user" u ON u.id=p.owner_id WHERE p.id=$1 AND p.origin=$2`, ['20711898-fb35-44ae-8a06-c8d27951c9b9', origin])).rows[0];
  if (!project || project.environment !== 'staging' || project.revoked) throw new Error('The authorized staging project is unavailable');
  const proofs = (await db.query<{ origin: string; revision: number; method: VerificationMethod; token: string; verified: boolean }>(`SELECT DISTINCT ON (origin) origin, revision, method, token, verified FROM site_verifications WHERE project_id=$1 AND origin=ANY($2::text[]) ORDER BY origin, revision DESC`, [project.id, [origin, apiOrigin]])).rows;
  const primary = proofs.find(p => p.origin === origin);
  const api = proofs.find(p => p.origin === apiOrigin);
  if (!primary?.verified || !api?.verified || !primary.method || !api.method) throw new Error('Both UI and API need current verified ownership revisions');
  for (const proof of [primary, api]) {
    const result = await verifyOwnership(proof.origin, proof.token, proof.method, {}, proof === api ? primary.token : undefined);
    console.log(JSON.stringify({ check: 'fresh_ownership', origin: proof.origin, ...result }));
    if (!result.verified) throw new Error(`Ownership recheck failed for ${proof.origin}`);
  }
  if (!process.argv.includes('--run')) {
    console.log(JSON.stringify({ readyForEvaluation: true, projectId: project.id, model: process.env.META_MODEL, gatewayImageConfigured: Boolean(process.env.EVALUATION_GATEWAY_IMAGE) }));
  } else {
    if (!/^im-[A-Za-z0-9]+$/.test(process.env.EVALUATION_GATEWAY_IMAGE ?? '') || process.env.ODDHOUND_STUDYBOOST_EVALUATION !== '1') throw new Error('Explicit evaluation opt-in and pinned gateway image are required');
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length > 4096) throw new Error('Credential input exceeded bound'); }
    const account = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { username: string; secret: string };
    if (account.username !== 'oddhound_qa_1030_292260ee@example.test' || typeof account.secret !== 'string' || account.secret.length < 16) throw new Error('Only the prepared synthetic account is authorized');
    secret = account.secret;
    // Additive app schema only: old runs retain their original model allowance.
    await migrate(db);
    const orphan = (await db.query(`SELECT id FROM runs WHERE origin=$1 AND browser_state IN ('provisioning','ready','active','terminating') LIMIT 1`, [origin])).rows[0];
    if (orphan) throw new Error('An earlier browser requires confirmed cleanup before this evaluation');
    const providers = providersFromEnv();
    if (providers.length !== 1 || providers[0]?.id !== 'meta-direct' || providers[0]?.model !== 'muse-spark-1.3') throw new Error('This evaluation requires the real standard Muse Spark 1.3 provider');
    const credentialRef = await storeCredential(db, { projectId: project.id, label: 'Synthetic StudyBoost QA student (preview only)', username: account.username, secret });
    const contract = RunContractSchema.parse({
      version: 1,
      target: { origin, environment: 'staging', apiOrigins: [{ origin: apiOrigin, verificationRevision: api.revision }], verification: { kind: 'owner_verified', method: primary.method, revision: primary.revision, checkedAt: new Date().toISOString() } },
      testMode: 'active', productionWritesAcknowledged: false,
      description: 'StudyBoost is a study workspace. Use the supplied synthetic student account, already onboarded and email-verified by the owner in the preview database. Discover the UI yourself. ' + (broad ? 'Explore the full application available under this contract, expanding the plan after sign-in, menus, tabs and new destinations. Balance breadth with meaningful outcome checks. The account already has synthetic shelves and tasks and may be at its free-plan shelf limit; report that limit and exercise other available features. ' : 'This is a focused authenticated smoke test of personal notes, shelves and tasks. ') + 'All data in this account is disposable synthetic QA data. Gateway TLS interception is active; unsupported sockets are blocked; do not infer original TLS certificate findings.',
      goals: broad ? [
        'Sign in with the supplied account, discover every reachable permitted route family through headers, sidebars, menus, tabs, redirects and links, and continue as new destinations appear. Use explore_next for efficient breadth. Do not stop at the initial plan.',
        'Build and expand charters for each distinct feature found. Prioritize useful normal workflows, validation, search/filter behavior, data persistence and recovery. Reuse existing synthetic records if account limits prevent new creation.',
        'Check important visible outcomes using assertions and trusted scenario batches; a successful click or visited page is not a functional pass. Independently replay possible failures and retain passing neighboring checks.',
        'Check representative account workflows and navigation on mobile, and check logout protection with a subsequent successful login.',
        'Report every discovered area as outcome-checked, visited only, blocked, sampled or still pending, with reasons and next steps. Keep contract exclusions visible. Finish only when known authorized work is accounted for or a real resource boundary requires stopping.',
      ] : process.argv.includes('--auth-followup') ? [
        'Sign in with the supplied account and confirm its signed-in greeting and personal workspace.',
        'Create one NEW uniquely named QA shelf through the UI and add a uniquely named task. Reload and confirm both persist. Editing or reusing an existing shelf does not complete this goal. If creation is unavailable, explicitly report the blocked step.',
        'Sign out and confirm personal pages require sign-in. Sign in again with the supplied account, confirm the workspace returns, and finish this focused follow-up.',
      ] : [
        'Sign in with the supplied account and confirm access to its personal study workspace.',
        'Create a uniquely named QA shelf and task, edit the task, mark it complete, and check saved state after reload.',
        'Create a uniquely labelled QA note and check it remains after reload.',
        'Check the involved forms reject blank or whitespace-only required values, and that a valid neighbouring value still works.',
        'Check the same personal workflow on a phone-sized screen.',
        'Sign out, confirm personal pages require sign-in, then sign in again with the supplied account. Finish when this focused scope is covered; explicitly report blocked or untested steps.',
      ],
      rules: withBaselineRules([]),
      capabilities: { register: false, login: true, createRecords: true, editRecords: true, cancelRecords: false, boundaryValues: true, repeatSubmission: false, unusualOrder: true, crossAccountRead: false },
      accounts: [{ ref: credentialRef, role: 'STUDENT', label: 'Prepared synthetic QA student' }],
      registration: { allowed: false, emailDomain: 'example.test', maxIdentities: 0 },
      deniedPathPrefixes: ['/admin', '/api/admin', '/users/me/profile', '/users/me/avatar', '/users/me/notification-preferences', '/auth/signup', '/auth/oauth', '/auth/resend-verification', '/auth/verify-email'],
      deniedPathKeywords: [...DEFAULT_DENIED_PATH_KEYWORDS, 'upload', 'uploads', 'ai', 'generate', 'chat', 'message', 'messages', 'invite', 'invites', 'invitation', 'invitations', 'password', 'security', 'oauth'],
      deniedOperations: [...DEFAULT_DENIED_OPERATIONS, 'Do not change account email, password, role, plan or security settings.', 'Do not use payments, external sign-in, uploads, messages, invitations, or paid AI generation. Work only with this synthetic account and its own QA records.'],
      handoff: { enabled: false, startPath: '/' }, devices: ['desktop', 'mobile'],
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    const admission = await admitRun(db, { principal: `user:${project.owner_id}`, ownerId: project.owner_id, projectId: project.id, mode: 'verified_site', contract, spendAccount: 'public' });
    if (!admission.ok) throw new Error(`Evaluation admission refused: ${admission.reason}`);
    const runId = admission.runId;
    const allowance = await spendAllowance(db, runId);
    await db.query('UPDATE credentials SET run_id=$2 WHERE ref=$1', [credentialRef, runId]);
    await appendEvent(db, runId, 'evaluation.profile', { profile: 'gateway-evaluation', broadExploration: broad, allowance, image: process.env.EVALUATION_GATEWAY_IMAGE, interceptedTLS: true, sockets: 'disabled', suppliedAccount: true, emailVerification: 'owner-prepared in preview DB; delivery not tested', publicLaunchClearance: false });
    console.log(JSON.stringify({ event: 'evaluation.admitted', runId, url: `https://danravekeh123--oddhound-web.us-east.modal.run/runs/${runId}`, model: providers[0].model, node: process.version, playwright: createRequire(import.meta.url)('playwright/package.json').version, runtime: 'Modal VM; token control; gateway evaluation' }));
    let progressBusy = false;
    timer = setInterval(() => {
      if (progressBusy) return;
      progressBusy = true;
      void db.query(`SELECT status, (SELECT count(*)::int FROM actions WHERE run_id=runs.id) AS actions, (SELECT count(*)::int FROM findings WHERE run_id=runs.id) AS findings FROM runs WHERE id=$1`, [runId])
        .then(r => console.log(JSON.stringify({ event: 'evaluation.progress', runId, ...r.rows[0] })))
        .catch(() => {}).finally(() => { progressBusy = false; });
    }, 30_000);
    const runtime = new ModalSandboxRuntime({ appName: 'oddhound-browser', imageId: process.env.EVALUATION_GATEWAY_IMAGE!, sandboxRuntime: 'vm', connect: 'token', outboundCidrAllowlist: publicIpv4Cidrs(), evaluationPolicy: gatewayEvaluationPolicy(runId, contract, Date.parse(contract.expiresAt)) });
    const status = await executeRun({ db, runtime, providers, workerId: `studyboost-evaluation:${runId}`, hosted: true, agentMode: 'batch' }, runId);
    clearInterval(timer);
    const run = (await db.query('SELECT id,status,stop_reason,browser_state,browser_ref,sandbox_verdict,provider,model,started_at::text,finished_at::text FROM runs WHERE id=$1', [runId])).rows[0];
    const findings = (await db.query('SELECT id,title,category,verification,lifecycle,rule_id,observed FROM findings WHERE run_id=$1 ORDER BY created_at', [runId])).rows;
    const workflows = (await db.query('SELECT name,status,summary FROM workflows WHERE run_id=$1', [runId])).rows;
    const usage = (await db.query(`SELECT count(*)::int AS calls, COALESCE(SUM(actual_micros),0)::text AS settled_micros, COALESCE(SUM(CASE WHEN state IN ('reserved','unknown') THEN reserved_micros ELSE 0 END),0)::text AS outstanding_micros FROM spend_reservations WHERE run_id=$1`, [runId])).rows[0];
    const checks = (await db.query(`SELECT type,payload FROM run_events WHERE run_id=$1 AND type IN ('site.verified','recipe.recorded','run.summary','run.error','site.bot_challenge','browser.terminated','browser.destroy_unconfirmed','run.finished','coverage.gaps','exploration.completed','run.timings') ORDER BY seq`, [runId])).rows;
    const discovery = (await db.query(`SELECT payload FROM run_events WHERE run_id=$1 AND type='exploration.updated' ORDER BY seq DESC LIMIT 1`, [runId])).rows[0]?.payload;
    const coverage = (await db.query(`SELECT payload FROM run_events WHERE run_id=$1 AND type='coverage.updated' ORDER BY seq DESC LIMIT 1`, [runId])).rows[0]?.payload;
    const plan = (await db.query(`SELECT payload FROM run_events WHERE run_id=$1 AND type='plan.updated' ORDER BY seq DESC LIMIT 1`, [runId])).rows[0]?.payload;
    const scenarios = (await db.query(`SELECT payload->>'family' AS family, payload->>'outcome' AS outcome, count(*)::int AS count
      FROM run_events WHERE run_id=$1 AND type='scenario.finished' GROUP BY 1,2 ORDER BY 1,2`, [runId])).rows;
    const preview = (await db.query(`SELECT seq,state,reason,updated_at::text FROM run_owner_previews WHERE run_id=$1`, [runId])).rows[0];
    const previewEvidence = (await db.query(`SELECT seq,at::text,payload FROM run_events WHERE run_id=$1 AND type='preview.state' ORDER BY seq`, [runId])).rows;
    const measurement = (await db.query(`SELECT (SELECT count(DISTINCT route)::int FROM graph_states WHERE run_id=$1) AS reached_routes,
      count(*)::int AS browser_actions, COALESCE(SUM(EXTRACT(epoch FROM completed_at-intended_at)*1000),0)::bigint::text AS recorded_action_ms
      FROM actions WHERE run_id=$1`, [runId])).rows[0];
    console.log('EVALUATION_RESULT ' + JSON.stringify(redactKnownSecrets({ status, run, findings, workflows, usage, checks, discovery, coverage, plan, scenarios, preview, previewEvidence, measurement, allowance }, [secret])));
    if (status !== 'completed' || run.browser_state !== 'terminated') process.exitCode = 1;
  }
} catch (e) {
  console.error(JSON.stringify({ evaluationError: redactKnownSecrets((e as Error).message, secret ? [secret] : []) }));
  process.exitCode = 1;
} finally {
  if (timer) clearInterval(timer);
  await closePool();
}
