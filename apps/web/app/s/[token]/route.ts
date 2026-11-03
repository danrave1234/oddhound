// Opens a read-only share link: remembers the token in this browser and shows the shared run.
import { db, hashShareToken, rememberShareToken } from '@/lib/server';

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const share = (await db().query<{ run_id: string }>(`SELECT run_id FROM run_shares WHERE token_hash = $1 AND revoked_at IS NULL`, [hashShareToken(token)])).rows[0];
  const base = (process.env.BETTER_AUTH_URL ?? new URL(req.url).origin).replace(/\/+$/, '');
  if (!share) return new Response('This share link is not active. Ask the owner for a new one.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  await rememberShareToken(token);
  return new Response(null, { status: 303, headers: { location: `${base}/runs/${share.run_id}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
