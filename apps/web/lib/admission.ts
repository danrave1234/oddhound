import 'server-only';
import type { Pool } from 'pg';
import { LIMITS } from '@core/contracts/limits.ts';

/** Only verified API hosts enter a run's scope; an added but unverified host stays a public resource. */
export async function verifiedApiOrigins(pool: Pick<Pool, 'query'>, projectId: string, siteOrigin: string) {
  const rows = (await pool.query<{ origin: string; revision: number; verified: boolean }>(
    `SELECT DISTINCT ON (origin) origin, revision, verified FROM site_verifications WHERE project_id = $1 AND origin <> $2 ORDER BY origin, revision DESC`,
    [projectId, siteOrigin])).rows;
  return rows.filter((a) => a.verified).map((a) => ({ origin: a.origin, verificationRevision: a.revision }));
}

/** When a run admitted now must be over: the wall-clock backstop from its contract. */
export const runExpiry = () => new Date(Date.now() + LIMITS.runWallClockMs).toISOString();
