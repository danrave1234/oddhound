// Read-only share link for an owner-site run (and its retests), so a teammate or client without an
// account can see the proof. Creating a link replaces the previous one; DELETE stops sharing.
import { currentUser, db, hashShareToken, json, loadRunForAccess, newShareToken, publicOrigin } from '@/lib/server';

async function ownedShareable(id: string) {
  const [run, user] = await Promise.all([loadRunForAccess(id), currentUser()]);
  if (!run || !user || !(user.isAdmin || run.owner_id === user.id)) return { error: json({ error: 'Not found' }, 404) };
  if (run.mode === 'demo_target' || run.parent_mode === 'demo_target') return { error: json({ error: 'Demo runs are already public.' }, 409) };
  const handoff = (await db().query<{ on: boolean }>(`SELECT coalesce((contract->'handoff'->>'enabled')::boolean, false) AS on FROM runs WHERE id = $1`, [id])).rows[0]?.on;
  if (handoff) return { error: json({ error: 'This run used your own sign-in, so its frames may show your account. It cannot be shared.' }, 409) };
  return { run, user };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await ownedShareable(id);
  if ('error' in r) return r.error;
  const token = newShareToken();
  await db().query(
    `INSERT INTO run_shares (run_id, token_hash, created_by) VALUES ($1, $2, $3)
     ON CONFLICT (run_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_by = EXCLUDED.created_by, created_at = now(), revoked_at = NULL`,
    [id, hashShareToken(token), r.user.id]);
  return json({ url: `${publicOrigin(req)}/s/${token}` }, 201);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await ownedShareable(id);
  if ('error' in r) return r.error;
  await db().query(`UPDATE run_shares SET revoked_at = now() WHERE run_id = $1 AND revoked_at IS NULL`, [id]);
  return json({ revoked: true });
}
