import 'server-only';
import { headers, cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { getPool } from '@core/db/pool.ts';
import { auth } from './auth';

export const db = () => getPool();

/** The public origin for links in API responses. Behind Modal the request URL is the container's own address. */
export const publicOrigin = (req: Request) => (process.env.BETTER_AUTH_URL ?? new URL(req.url).origin).replace(/\/+$/, '');

export type AppUser = { id: string; name: string; email: string; isAdmin: boolean; allowlisted: boolean; revoked: boolean };

export async function currentUser(): Promise<AppUser | null> {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  return session?.user ? loadAppUser(session.user.id) : null;
}

/** A user by id with their permissions; null when unknown or revoked. */
export async function loadAppUser(id: string): Promise<AppUser | null> {
  const r = await db().query<{ id: string; name: string; email: string; is_admin: boolean; allowlisted: boolean; revoked: boolean }>(
    'SELECT id, name, email, is_admin, allowlisted, revoked FROM "user" WHERE id = $1', [id]);
  const u = r.rows[0];
  if (!u || u.revoked) return null;
  const adminEmails = (process.env.ODDHOUND_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { id: u.id, name: u.name, email: u.email, isAdmin: u.is_admin || adminEmails.includes(u.email.toLowerCase()), allowlisted: u.allowlisted, revoked: u.revoked };
}

/** Verified-site mode is allowlisted until the public-launch gate passes (MVP §16). */
export function mayScanVerifiedSites(user: AppUser): boolean {
  return process.env.ODDHOUND_PUBLIC_VERIFIED_SITES === '1' || user.allowlisted || user.isAdmin;
}

/** Stable anonymous principal for sign-in-free demo requests (friction, not a Sybil guarantee). */
export async function anonymousPrincipal(): Promise<string> {
  const jar = await cookies();
  let id = jar.get('oh_anon')?.value;
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    id = randomBytes(18).toString('base64url');
    jar.set('oh_anon', id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
  }
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'local';
  return `anon:${id}:${ip}`;
}

type RunAccessRow = { owner_id: string | null; mode: string; principal: string; parent_mode?: string | null; shared?: boolean };

/** Demo-target runs contain synthetic data only and are public; everything else is owner/admin only. */
export function canViewRun(user: AppUser | null, run: RunAccessRow): boolean {
  if (run.mode === 'demo_target') return true;
  if (run.mode === 'retest' && run.parent_mode === 'demo_target') return true; // retest of a public demo run
  if (run.shared) return true; // the viewer opened the owner's read-only share link for this run or its parent
  return Boolean(user && (user.isAdmin || run.owner_id === user.id));
}

export async function canControlRun(user: AppUser | null, run: RunAccessRow): Promise<boolean> {
  if (user && (user.isAdmin || (run.owner_id && run.owner_id === user.id))) return true;
  // Demo runs (and their retests) have no owner; whoever started them controls them.
  if (user && (run.principal === `user:${user.id}` || run.principal.startsWith(`user:${user.id}:`))) return true;
  if (run.principal.startsWith('anon:')) {
    const jar = await cookies();
    const mine = jar.get('oh_anon')?.value;
    return Boolean(mine) && run.principal.split(':')[1] === mine;
  }
  return false;
}

/** Cheap shape check for route ids before any query. */
export const isUuid = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export async function loadRunForAccess(runId: string) {
  if (!isUuid(runId)) return null;
  const r = await db().query<RunAccessRow & { id: string; project_id: string | null; status: string; origin: string; parent_run_id: string | null }>(
    `SELECT r.id, r.owner_id, r.mode, r.principal, r.project_id, r.status, r.origin, r.parent_run_id, p.mode AS parent_mode
     FROM runs r LEFT JOIN runs p ON p.id = r.parent_run_id WHERE r.id = $1`, [runId]);
  const row = r.rows[0];
  if (!row) return null;
  const tokens = await shareTokens();
  if (tokens.length) {
    const hit = await db().query(`SELECT 1 FROM run_shares WHERE token_hash = ANY($1) AND revoked_at IS NULL AND run_id = ANY($2) LIMIT 1`,
      [tokens.map(hashShareToken), [row.id, row.parent_run_id].filter(Boolean)]);
    row.shared = hit.rows.length > 0;
  }
  return row;
}

// ---- Read-only share links. The token is shown once; only its hash is stored. Opening /s/<token>
// remembers it in an httpOnly cookie, which then lets that browser view the run and its retests.
const SHARE_COOKIE = 'oh_share';
export const hashShareToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const newShareToken = () => `ohs_${randomBytes(24).toString('base64url')}`;
const isShareToken = (t: string) => /^ohs_[A-Za-z0-9_-]{32}$/.test(t);

async function shareTokens(): Promise<string[]> {
  const raw = (await cookies()).get(SHARE_COOKIE)?.value ?? '';
  return raw.split('.').filter(isShareToken).slice(0, 10);
}

/** Remembers a share token in this browser (most recent first, at most ten). */
export async function rememberShareToken(token: string): Promise<void> {
  if (!isShareToken(token)) return;
  const kept = [token, ...(await shareTokens()).filter((t) => t !== token)].slice(0, 10);
  (await cookies()).set(SHARE_COOKIE, kept.join('.'), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
}

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
