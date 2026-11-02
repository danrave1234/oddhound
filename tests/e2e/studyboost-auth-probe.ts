// Explicit owner diagnostic: existing synthetic account, freshly verified origins, no model call.
import { randomUUID } from 'node:crypto';
import { ModalClient } from 'modal';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { ModalSandboxRuntime, MODAL_RUN_TAG, publicIpv4Cidrs } from '../../packages/core/browser/modal-runtime.ts';
import { gatewayEvaluationPolicy } from '../../packages/core/browser/gateway-evaluation.ts';
import { newScopedContext } from '../../packages/core/browser/runtime.ts';
import { attachScope, policyFromContract } from '../../packages/core/browser/scope.ts';
import { RunContractSchema } from '../../packages/core/contracts/contract.ts';
import { verifyOwnership, type VerificationMethod } from '../../packages/core/verification/ownership.ts';
import { fillAndSubmit } from '../../packages/core/verifier/scenario.ts';

const id = randomUUID(), projectId = '20711898-fb35-44ae-8a06-c8d27951c9b9';
const origin = 'https://preview.studyboost.com', api = 'https://preview.api.studyboost.com';
const db = getPool(), client = new ModalClient(), checks: unknown[] = [];
const report: Record<string, unknown> = { id, at: new Date().toISOString(), diagnostic: 'authentication prerequisite only', modelCalls: 0, targetWrites: 'two authorized sign-ins only', checks };
let guest: Awaited<ReturnType<ModalSandboxRuntime['provisionDetailed']>> | undefined;
let secret = '';
try {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length > 4096) throw new Error('Credential bound'); }
  const account = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (account.username !== 'oddhound_qa_1030_292260ee@example.test' || typeof account.secret !== 'string' || account.secret.length < 16) throw new Error('Exact prepared account required');
  secret = account.secret;
  const row = (await db.query(`SELECT r.contract FROM runs r JOIN projects p ON p.id=r.project_id JOIN "user" u ON u.id=p.owner_id WHERE r.id=$1 AND p.id=$2 AND p.origin=$3 AND p.owner_id=$4 AND NOT u.revoked`, ['883c2266-0b91-4cc6-bb3b-fa4fd111cd80', projectId, origin, 'SOFDRITxFaXPsmEoQ7pMJG6IxOmxFTn7'])).rows[0];
  if (!row) throw new Error('Existing owner scope unavailable');
  const proofs = (await db.query(`SELECT DISTINCT ON(origin) origin,method,token,verified,revision FROM site_verifications WHERE project_id=$1 AND origin=ANY($2::text[]) ORDER BY origin,revision DESC`, [projectId, [origin, api]])).rows;
  if (proofs.length !== 2 || proofs.some(p => !p.verified)) throw new Error('Two current ownership proofs required');
  for (const p of proofs) {
    const result = await verifyOwnership(p.origin, p.token, p.method as VerificationMethod);
    checks.push({ ownership: p.origin, verified: result.verified });
    if (!result.verified) throw new Error('Ownership recheck failed');
  }
  const contract = RunContractSchema.parse({ ...row.contract, expiresAt: new Date(Date.now() + 180_000).toISOString(), capabilities: { ...row.contract.capabilities, createRecords: false, editRecords: false, cancelRecords: false } });
  const image = process.env.EVALUATION_GATEWAY_IMAGE;
  if (image !== 'im-VFVycsDf9x78A5ZYAg47E0') throw new Error('Pinned approved evaluation gateway required');
  const runtime = new ModalSandboxRuntime({ appName: 'oddhound-browser-preflight', imageId: image, client, sandboxRuntime: 'vm', connect: 'token', outboundCidrAllowlist: publicIpv4Cidrs(), timeoutMs: 180_000, evaluationPolicy: gatewayEvaluationPolicy(id, contract, Date.parse(contract.expiresAt)) });
  guest = await runtime.provisionDetailed({ runId: id });
  report.sandboxId = guest.sandbox.sandboxId; report.sandboxVerdict = guest.provisioned.sandboxVerdict; report.chromium = guest.provisioned.browser.version(); report.node = process.version;
  if (guest.provisioned.sandboxVerdict !== 'sandbox_on') throw new Error('Sandbox unavailable');
  for (const path of ['/login', '/login?next=%2F']) {
    const context = await newScopedContext(guest.provisioned.browser, 'desktop');
    const blocks: string[] = [], responses: { path: string; status: number }[] = [];
    try {
      await attachScope(context, policyFromContract(contract), d => { if (!d.allowed) blocks.push(d.reason ?? 'denied'); });
      const page = await context.newPage();
      page.on('response', response => { const u = new URL(response.url()); if (u.origin === api && u.pathname === '/auth/login') responses.push({ path: u.pathname, status: response.status() }); });
      await fillAndSubmit(page, origin, { path, fields: { 'Email or Username': '{email}', Password: '{password}' }, submit: 'Sign In' }, { email: account.username, password: secret });
      const started = Date.now(); let reached = false;
      while (Date.now() - started < 15_000) {
        const body = await page.locator('body').innerText().catch(() => '');
        reached = body.includes('Study notes, guides and past exams for your courses') && new URL(page.url()).pathname !== '/login' && await page.locator('input[type=password]:visible').count() === 0;
        if (reached) break;
        await page.waitForTimeout(100);
      }
      checks.push({ authPath: path, landedPath: new URL(page.url()).pathname, savedSuccessTextReached: reached, elapsedMs: Date.now() - started, loginResponses: responses, policyBlocks: blocks });
      if (path.includes('?') && (!reached || !responses.some(r => r.status === 200))) throw new Error('Correctly recorded authentication did not succeed');
    } finally { await context.close(); }
  }
  report.pass = true;
} catch (e) {
  report.pass = false; report.error = (e as Error).message.replaceAll(secret || '\0', '[redacted]').replace(/wss?:\/\/\S+/g, '[control-redacted]').slice(0, 500);
  process.exitCode = 1;
} finally {
  if (guest) report.cleanup = await guest.provisioned.destroy();
  const app = await client.apps.fromName('oddhound-browser-preflight', { createIfMissing: false });
  const unconfirmed: string[] = [];
  for await (const sb of client.sandboxes.list({ appId: app.appId, tags: { [MODAL_RUN_TAG]: id } })) {
    await sb.terminate(); if (await sb.poll() === null) unconfirmed.push(sb.sandboxId);
  }
  report.independentUnconfirmed = unconfirmed;
  if (unconfirmed.length || !(report.cleanup as { confirmed?: boolean })?.confirmed) { report.pass = false; process.exitCode = 1; }
  await closePool(); console.log(`AUTH_PROBE_RESULT ${JSON.stringify(report)}`);
}
