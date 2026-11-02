import type { Db } from '../db/pool.ts';

/** No public/demo/admin fallback: the current, non-revoked owner alone may fetch these pixels. */
export async function readOwnerPreview(db: Db, runId: string, userId: string | null): Promise<Buffer | null> {
  if (!userId) return null;
  const r = await db.query<{ frame: Buffer }>(`SELECT p.frame FROM run_owner_previews p
    JOIN runs r ON r.id = p.run_id JOIN "user" u ON u.id = r.owner_id
    WHERE p.run_id = $1 AND r.owner_id = $2 AND NOT u.revoked AND r.mode <> 'demo_target'
      AND p.expires_at > now() AND p.state = 'available'`, [runId, userId]);
  return r.rows[0]?.frame ?? null;
}
