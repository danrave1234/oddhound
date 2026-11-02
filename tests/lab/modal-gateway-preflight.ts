// Explicit cloud startup/lifecycle proof only. No target navigation, account or model invocation.
// node --env-file-if-exists=.env tests/lab/modal-gateway-preflight.ts --image im-...
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ModalClient } from 'modal';
import { ModalSandboxRuntime, MODAL_RUN_TAG, publicIpv4Cidrs } from '../../packages/core/browser/modal-runtime.ts';
import type { GatewayEvaluationPolicy } from '../../packages/core/browser/gateway-evaluation.ts';

const imageId = process.argv[process.argv.indexOf('--image') + 1];
if (!imageId || !/^im-[A-Za-z0-9]+$/.test(imageId)) throw new Error('An explicit pinned --image is required');
const runId = randomUUID();
const appName = 'oddhound-browser-preflight'; // Avoid the live worker's independent orphan reaper.
const policy: GatewayEvaluationPolicy = {
  version: 1, runId, primaryOrigin: 'https://preview.studyboost.com', apiOrigins: [], writes: false,
  deniedPathPrefixes: [], deniedPathKeywords: [], expiresAt: Date.now() + 3 * 60_000,
  limits: { requests: 100, concurrent: 6, resourceBytes: 8 * 1024 * 1024, totalBytes: 16 * 1024 * 1024 },
};
const client = new ModalClient();
const runtime = new ModalSandboxRuntime({ appName, imageId, client, sandboxRuntime: 'vm', connect: 'token',
  outboundCidrAllowlist: publicIpv4Cidrs(), timeoutMs: 3 * 60_000, evaluationPolicy: policy });
const checks: { check: string; pass: boolean; detail: unknown }[] = [];
const record = (check: string, pass: boolean, detail: unknown) => { checks.push({ check, pass, detail }); console.log(JSON.stringify({ check, pass, detail })); };
let detailed: Awaited<ReturnType<ModalSandboxRuntime['provisionDetailed']>> | undefined;
const evidence: Record<string, unknown> = {
  at: new Date().toISOString(), imageId, appName, runId, policyHash: createHash('sha256').update(JSON.stringify(policy)).digest('hex'),
  runtime: 'vm', control: 'token', outbound: 'canonical public IPv4', node: process.version,
  limitations: 'Startup/control/sandbox/teardown only. No target navigation, target credentials, model call, resource/authority canary or public-launch clearance.',
  checks,
};
try {
  detailed = await runtime.provisionDetailed({ runId });
  evidence.sandboxId = detailed.sandbox.sandboxId;
  evidence.startupMs = detailed.startupMs;
  record('frozen policy hash attested before authenticated browser connection', true, 'Runtime required the exact SHA256 policy hash before connecting');
  record('Chromium sandbox', detailed.provisioned.sandboxVerdict === 'sandbox_on', detailed.provisioned.sandboxVerdict);
  record('browser version', true, detailed.provisioned.browser.version());
  const ctx = await detailed.provisioned.browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  record('blank context only', page.url() === 'about:blank', page.url());
  await ctx.close();
} catch (e) {
  const message = (e as Error).message.replace(/wss?:\/\/\S+|\/pw-[A-Za-z0-9_-]+/g, '[control-redacted]');
  record('startup and authenticated browser connection', false, message.slice(0, 800));
} finally {
  if (detailed) {
    const teardown = await detailed.provisioned.destroy();
    record('sandbox termination confirmed', teardown.confirmed, teardown.detail);
  }
  // Independent run-tag lookup also covers a startup failure before the runtime returned its handle.
  try {
    const app = await client.apps.fromName(appName, { createIfMissing: false });
    const leftovers: string[] = [];
    for await (const sb of client.sandboxes.list({ appId: app.appId, tags: { [MODAL_RUN_TAG]: runId } })) {
      await sb.terminate();
      const deadline = Date.now() + 30_000;
      let code = await sb.poll();
      while (code === null && Date.now() < deadline) { await new Promise(r => setTimeout(r, 500)); code = await sb.poll(); }
      if (code === null) leftovers.push(sb.sandboxId);
    }
    record('independent cleanup of this run tag', leftovers.length === 0, { unconfirmed: leftovers });
  } catch { record('independent cleanup of this run tag', false, 'Could not confirm the tagged sandbox inventory'); }
  mkdirSync('docs/evidence', { recursive: true });
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const path = `docs/evidence/modal-gateway-preflight-${date}-${runId}.json`;
  evidence.pass = checks.length > 1 && checks.every(c => c.pass);
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ evidence: path, pass: evidence.pass }));
  if (!evidence.pass) process.exitCode = 1;
}
