import 'server-only';
import type { Pool } from 'pg';
import { LIMITS } from '@core/contracts/limits.ts';
import { admitRun } from '@core/ledger/runs.ts';
import { RunContractSchema, demoTargetContract } from '@core/contracts/contract.ts';
import { enqueueRun } from '@core/queue/queue.ts';
import { db, mayScanVerifiedSites, type AppUser } from './server';

/** Only verified API hosts enter a run's scope; an added but unverified host stays a public resource. */
export async function verifiedApiOrigins(pool: Pick<Pool, 'query'>, projectId: string, siteOrigin: string) {
  const rows = (await pool.query<{ origin: string; revision: number; verified: boolean }>(
    `SELECT DISTINCT ON (origin) origin, revision, verified FROM site_verifications WHERE project_id = $1 AND origin <> $2 ORDER BY origin, revision DESC`,
    [projectId, siteOrigin])).rows;
  return rows.filter((a) => a.verified).map((a) => ({ origin: a.origin, verificationRevision: a.revision }));
}

/** When a run admitted now must be over: the wall-clock backstop from its contract. */
export const runExpiry = () => new Date(Date.now() + LIMITS.runWallClockMs).toISOString();

export type Started = { ok: true; runId: string } | { ok: false; status: number; error: string; reason?: string };

/**
 * Retest a run's verified findings. The caller has already established that `actor` may control the run.
 * Demo runs retest against the corrected demo build; a verified site is retested on its own origin.
 */
export async function startRetest(parent: { id: string; mode: string; owner_id: string | null }, user: AppUser | null, principal: string): Promise<Started> {
  if (parent.mode === 'retest') return { ok: false, status: 409, error: 'A retest cannot itself be retested.' };
  const verified = await db().query(`SELECT count(*)::int AS n FROM findings WHERE run_id = $1 AND verification = 'verified' AND category = 'verified_issue'`, [parent.id]);
  if (!verified.rows[0].n) return { ok: false, status: 409, error: 'This run has no verified findings to retest.' };
  const row = (await db().query('SELECT contract, project_id FROM runs WHERE id = $1', [parent.id])).rows[0];
  let contract = RunContractSchema.parse(row.contract);
  if (parent.mode === 'demo_target') {
    const fixedOrigin = process.env.DEMO_TARGET_FIXED_ORIGIN;
    if (!fixedOrigin) return { ok: false, status: 503, error: 'The corrected demo build is not configured.' };
    contract = demoTargetContract(fixedOrigin);
  } else {
    if (!user || !mayScanVerifiedSites(user)) return { ok: false, status: 403, error: 'Verified-site retests are invite-only for now.' };
    // A handed-over session cannot be replayed without the owner signing in again.
    if (contract.handoff.enabled) return { ok: false, status: 409, error: 'This run used your own sign-in, which a retest cannot repeat. After deploying the fix, start a new run with the sign-in handoff instead.' };
    contract = { ...contract, expiresAt: runExpiry() };
  }
  const result = await admitRun(db(), {
    principal: `${principal}:retest`, ownerId: parent.owner_id, projectId: row.project_id, mode: 'retest', contract,
    spendAccount: 'public', parentRunId: parent.id,
  });
  if (!result.ok) return { ok: false, status: 429, error: `Retest not admitted (${result.reason.replace(/_/g, ' ')}).`, reason: result.reason };
  await enqueueRun(result.runId, 'retest');
  return { ok: true, runId: result.runId };
}

/** A new run of a verified site with a finished run's exact contract, re-pinned to the current ownership proof. */
export async function startRunAgain(parentId: string, user: AppUser): Promise<Started> {
  if (!mayScanVerifiedSites(user)) return { ok: false, status: 403, error: 'Verified-site scanning is invite-only for now.' };
  const parent = (await db().query<{ contract: unknown; project_id: string }>(`SELECT contract, project_id FROM runs WHERE id = $1 AND mode = 'verified_site'`, [parentId])).rows[0];
  const project = parent && (await db().query<{ origin: string }>('SELECT origin FROM projects WHERE id = $1 AND owner_id = $2', [parent.project_id, user.id])).rows[0];
  if (!parent || !project) return { ok: false, status: 404, error: 'Not found' };
  const sv = (await db().query<{ revision: number; method: string; last_checked_at: Date }>(
    'SELECT revision, method, last_checked_at FROM site_verifications WHERE project_id = $1 AND origin = $2 AND verified ORDER BY revision DESC LIMIT 1', [parent.project_id, project.origin])).rows[0];
  if (!sv) return { ok: false, status: 409, error: 'The site is no longer verified. Check ownership again on the project page first.' };
  const previous = RunContractSchema.parse(parent.contract);
  const contract = RunContractSchema.parse({
    ...previous,
    target: { ...previous.target, apiOrigins: await verifiedApiOrigins(db(), parent.project_id, project.origin), verification: { kind: 'owner_verified', method: sv.method, revision: sv.revision, checkedAt: new Date(sv.last_checked_at).toISOString() } },
    expiresAt: runExpiry(),
  });
  const result = await admitRun(db(), { principal: `user:${user.id}`, ownerId: user.id, projectId: parent.project_id, mode: 'verified_site', contract, spendAccount: 'public' });
  if (!result.ok) return { ok: false, status: 429, error: `Run not admitted: ${result.reason.replace(/_/g, ' ')}.`, reason: result.reason };
  await enqueueRun(result.runId, 'verified_site');
  return { ok: true, runId: result.runId };
}
