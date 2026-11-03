// The owner creates (or rotates) the project's deploy hook token, shown once, or removes it.
import { currentUser, db, isUuid, json, mayScanVerifiedSites } from '@/lib/server';
import { hashHookToken, newHookToken } from '@/lib/deploy-hook';

async function ownedProject(id: string) {
  const user = await currentUser();
  if (!user || !isUuid(id)) return null;
  const p = (await db().query<{ id: string }>('SELECT id FROM projects WHERE id = $1 AND owner_id = $2', [id, user.id])).rows[0];
  return p ? { user, project: p } : null;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const owned = await ownedProject((await ctx.params).id);
  if (!owned) return json({ error: 'Not found' }, 404);
  if (!mayScanVerifiedSites(owned.user)) return json({ error: 'Verified-site scanning is invite-only for now.' }, 403);
  const token = newHookToken();
  await db().query(`INSERT INTO project_hooks (project_id, token_hash) VALUES ($1, $2)
    ON CONFLICT (project_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = now(), last_used_at = NULL`, [owned.project.id, hashHookToken(token)]);
  await db().query(`INSERT INTO audit_log (actor, action, origin, detail) VALUES ($1, 'deploy_hook_created', NULL, $2)`, [`user:${owned.user.id}`, JSON.stringify({ projectId: owned.project.id })]);
  return json({ token }, 201);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const owned = await ownedProject((await ctx.params).id);
  if (!owned) return json({ error: 'Not found' }, 404);
  await db().query('DELETE FROM project_hooks WHERE project_id = $1', [owned.project.id]);
  await db().query(`INSERT INTO audit_log (actor, action, origin, detail) VALUES ($1, 'deploy_hook_removed', NULL, $2)`, [`user:${owned.user.id}`, JSON.stringify({ projectId: owned.project.id })]);
  return json({ ok: true });
}
