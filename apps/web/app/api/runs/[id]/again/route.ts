// Run again: a new run of a verified site with the finished run's exact contract (goals, rules, denied
// areas, capabilities, devices, accounts, handoff), re-pinned to the site's current ownership proof.
import { canControlRun, currentUser, json, loadRunForAccess, db, mayScanVerifiedSites } from '@/lib/server';
import { admitRun } from '@core/ledger/runs.ts';
import { RunContractSchema } from '@core/contracts/contract.ts';
import { enqueueRun } from '@core/queue/queue.ts';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await loadRunForAccess(id);
  const user = await currentUser();
  if (!run || !user || run.mode !== 'verified_site' || !(await canControlRun(user, run))) return json({ error: 'Not found' }, 404);
  if (!mayScanVerifiedSites(user)) return json({ error: 'Verified-site scanning is invite-only for now.' }, 403);
  const parent = (await db().query<{ contract: unknown; project_id: string }>('SELECT contract, project_id FROM runs WHERE id = $1', [id])).rows[0];
  const project = parent && (await db().query<{ origin: string }>('SELECT origin FROM projects WHERE id = $1 AND owner_id = $2', [parent.project_id, user.id])).rows[0];
  if (!parent || !project) return json({ error: 'Not found' }, 404);
  const sv = (await db().query<{ revision: number; method: string; last_checked_at: Date }>(
    'SELECT revision, method, last_checked_at FROM site_verifications WHERE project_id = $1 AND origin = $2 AND verified ORDER BY revision DESC LIMIT 1', [parent.project_id, project.origin])).rows[0];
  if (!sv) return json({ error: 'The site is no longer verified. Check ownership again on the project page first.' }, 409);
  const apiOrigins = (await db().query<{ origin: string; revision: number; verified: boolean }>(
    `SELECT DISTINCT ON (origin) origin, revision, verified FROM site_verifications WHERE project_id = $1 AND origin <> $2 ORDER BY origin, revision DESC`,
    [parent.project_id, project.origin])).rows.filter((a) => a.verified).map((a) => ({ origin: a.origin, verificationRevision: a.revision }));
  const previous = RunContractSchema.parse(parent.contract);
  const contract = RunContractSchema.parse({
    ...previous,
    target: { ...previous.target, apiOrigins, verification: { kind: 'owner_verified', method: sv.method, revision: sv.revision, checkedAt: new Date(sv.last_checked_at).toISOString() } },
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  const result = await admitRun(db(), { principal: `user:${user.id}`, ownerId: user.id, projectId: parent.project_id, mode: 'verified_site', contract, spendAccount: 'public' });
  if (!result.ok) return json({ error: `Run not admitted: ${result.reason.replace(/_/g, ' ')}.`, reason: result.reason }, 429);
  await enqueueRun(result.runId);
  return json({ runId: result.runId }, 201);
}
