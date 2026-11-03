// Start a run on a verified site from the owner-approved run contract (MVP §17).
import { z } from 'zod';
import { currentUser, db, isUuid, json, mayScanVerifiedSites } from '@/lib/server';
import { admitRun } from '@core/ledger/runs.ts';
import { RunContractSchema, DEFAULT_DENIED_PATH_KEYWORDS, DEFAULT_DENIED_OPERATIONS, HANDOFF_DENIED_OPERATIONS, SIGN_OUT_KEYWORDS, withBaselineRules, type RunContract } from '@core/contracts/contract.ts';
import { storeCredential } from '@core/ledger/credentials.ts';
import { enqueueRun } from '@core/queue/queue.ts';
import { runExpiry, verifiedApiOrigins } from '@/lib/admission';

const Body = z.object({
  testMode: z.enum(['active', 'observation_only']),
  productionWritesAcknowledged: z.boolean().default(false),
  goals: z.array(z.string().trim().min(3).max(300)).max(8).default([]),
  // A user's bug report to reproduce first; untrusted text, fenced in the prompt by the agent core.
  report: z.string().trim().min(10).max(4000).optional(),
  rules: z.array(z.string().trim().min(3).max(400)).max(20).default([]),
  allowRegistration: z.boolean(),
  emailDomain: z.string().trim().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/).default('example.test'),
  secondActor: z.boolean().default(false),
  devices: z.array(z.enum(['desktop', 'mobile'])).min(1).max(2),
  deniedPathPrefixes: z.array(z.string().trim().startsWith('/')).max(30).default([]),
  deniedPathKeywords: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/)).max(60).default(DEFAULT_DENIED_PATH_KEYWORDS),
  deniedOperations: z.array(z.string().trim().max(200)).max(20).default(DEFAULT_DENIED_OPERATIONS),
  handoff: z.object({ enabled: z.boolean(), startPath: z.string().trim().startsWith('/').max(200).default('/login') }).default({ enabled: false, startPath: '/login' }),
  account: z.object({ username: z.string().min(1).max(200), password: z.string().min(1).max(200), label: z.string().max(80).default('Owner test account') }).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user || !isUuid(id)) return json({ error: 'Not found' }, 404);
  if (!mayScanVerifiedSites(user)) return json({ error: 'Verified-site scanning is invite-only for now.' }, 403);
  const project = (await db().query('SELECT id, origin, environment, description FROM projects WHERE id = $1 AND owner_id = $2', [id, user.id])).rows[0];
  if (!project) return json({ error: 'Not found' }, 404);
  const sv = (await db().query('SELECT revision, method, verified, last_checked_at FROM site_verifications WHERE project_id = $1 AND origin = $2 ORDER BY revision DESC LIMIT 1', [id, project.origin])).rows[0];
  if (!sv?.verified) return json({ error: 'Verify that you own this site before starting a run.' }, 409);
  const apiOrigins = await verifiedApiOrigins(db(), id, project.origin);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Check the run settings.', issues: parsed.error.issues }, 400);
  const b = parsed.data;
  if (project.environment === 'production' && b.testMode === 'active' && !b.productionWritesAcknowledged) {
    return json({ error: 'Active testing on production needs your explicit acknowledgement that test writes will happen.' }, 400);
  }
  const accounts: RunContract['accounts'] = [];
  if (b.account) {
    const ref = await storeCredential(db(), { projectId: id, label: b.account.label, username: b.account.username, secret: b.account.password });
    accounts.push({ ref, role: 'user', label: b.account.label });
  }
  const writes = b.testMode === 'active';
  const contract = RunContractSchema.parse({
    version: 1,
    target: { origin: project.origin, environment: project.environment, apiOrigins, verification: { kind: 'owner_verified', method: sv.method, revision: sv.revision, checkedAt: new Date(sv.last_checked_at).toISOString() } },
    testMode: b.testMode,
    productionWritesAcknowledged: b.productionWritesAcknowledged,
    description: project.description || 'No description provided.',
    goals: b.goals,
    ...(b.report ? { report: b.report } : {}),
    rules: withBaselineRules(b.rules.map((text, i) => ({ id: `R${i + 1}`, text, source: 'owner' as const }))),
    capabilities: { register: writes && b.allowRegistration, login: true, createRecords: writes, editRecords: writes, cancelRecords: writes, boundaryValues: true, repeatSubmission: writes, unusualOrder: true, crossAccountRead: b.secondActor && !b.handoff.enabled },
    accounts,
    registration: { allowed: writes && b.allowRegistration, emailDomain: b.emailDomain, maxIdentities: 3 },
    deniedPathPrefixes: b.deniedPathPrefixes,
    // Signing out would end the owner's handed-over session, so it is blocked only then.
    deniedPathKeywords: b.handoff.enabled ? [...new Set([...b.deniedPathKeywords, ...SIGN_OUT_KEYWORDS])].slice(0, 60) : b.deniedPathKeywords,
    deniedOperations: [...b.deniedOperations, ...(b.handoff.enabled ? HANDOFF_DENIED_OPERATIONS : [])].slice(0, 20),
    handoff: b.handoff,
    devices: b.devices,
    expiresAt: runExpiry(),
  });
  // An admin working on a local development build spends the development allocation (MVP §20), not
  // the public one, so it does not use up the public per-user daily quota. Never in production.
  const devOperator = user.isAdmin && process.env.NODE_ENV !== 'production' && process.env.ODDHOUND_DEV_LOGIN === '1';
  const result = await admitRun(db(), { principal: `user:${user.id}`, ownerId: user.id, projectId: id, mode: 'verified_site', contract, spendAccount: devOperator ? 'development' : 'public' });
  if (!result.ok) return json({ error: `Run not admitted: ${result.reason.replace(/_/g, ' ')}.`, reason: result.reason }, 429);
  await enqueueRun(result.runId);
  return json({ runId: result.runId }, 201);
}
