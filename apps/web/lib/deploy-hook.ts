import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { db, loadAppUser, type AppUser } from './server';
import { previousRunComparison } from './run-data';
import { deployGate, type Gate, type GateFinding } from '@core/reports/deploy-gate.ts';
import type { CompareFinding } from '@core/reports/run-compare.ts';

// A deploy hook token is a bearer secret with the owner's authority over one project only: it can start
// a retest or a new run of that project's verified site (still re-verified, budgeted and paced like any
// run) and read those runs' verdicts. It is stored as a SHA-256 hash and shown once.

const TOKEN = /^ohk_[A-Za-z0-9_-]{43}$/;
export const newHookToken = () => `ohk_${randomBytes(32).toString('base64url')}`;
export const hashHookToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** The project and owner a bearer token belongs to, or null. Marks the hook as used. */
export async function hookFromRequest(req: Request): Promise<{ project: { id: string; name: string; origin: string }; owner: AppUser } | null> {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || !TOKEN.test(token)) return null;
  const row = (await db().query<{ id: string; name: string; origin: string; owner_id: string }>(
    `UPDATE project_hooks h SET last_used_at = now() FROM projects p WHERE h.token_hash = $1 AND p.id = h.project_id RETURNING p.id, p.name, p.origin, p.owner_id`,
    [hashHookToken(token)])).rows[0];
  const owner = row && (await loadAppUser(row.owner_id));
  return row && owner ? { project: { id: row.id, name: row.name, origin: row.origin }, owner } : null;
}

export type DeployAction = { kind: 'retest' | 'explore'; parent: { id: string; mode: string; owner_id: string | null } };

/**
 * After a deploy: retest the latest exploration that still has open verified bugs (the fix is what changed);
 * otherwise explore again with the latest exploration's exact contract.
 */
export async function chooseDeployAction(projectId: string, mode: 'auto' | 'retest' | 'explore'): Promise<DeployAction | null> {
  const open = mode === 'explore' ? undefined : (await db().query<{ id: string; mode: string; owner_id: string | null }>(
    `SELECT r.id, r.mode, r.owner_id FROM runs r WHERE r.project_id = $1 AND r.mode = 'verified_site' AND r.status IN ('completed', 'stopped')
       AND EXISTS (SELECT 1 FROM findings f WHERE f.run_id = r.id AND f.verification = 'verified' AND f.category = 'verified_issue' AND coalesce(f.lifecycle, 'open') <> 'fixed')
     ORDER BY r.queued_at DESC LIMIT 1`, [projectId])).rows[0];
  if (open) return { kind: 'retest', parent: open };
  if (mode === 'retest') return null;
  const latest = (await db().query<{ id: string; mode: string; owner_id: string | null }>(
    `SELECT id, mode, owner_id FROM runs WHERE project_id = $1 AND mode = 'verified_site' AND status IN ('completed', 'stopped', 'failed', 'blocked') ORDER BY queued_at DESC LIMIT 1`, [projectId])).rows[0];
  return latest ? { kind: 'explore', parent: latest } : null;
}

/** The CI verdict for a run started by this project's hook. */
export async function hookRunGate(projectId: string, runId: string): Promise<(Gate & { kind: 'retest' | 'explore'; status: string }) | null> {
  const run = (await db().query<{ id: string; mode: string; project_id: string | null; status: string; stop_reason: string | null; parent_run_id: string | null; queued_at: Date }>(
    'SELECT id, mode, project_id, status, stop_reason, parent_run_id, queued_at FROM runs WHERE id = $1 AND project_id = $2', [runId, projectId])).rows[0];
  if (!run) return null;
  if (run.mode === 'retest') {
    const [events, expected] = await Promise.all([
      db().query(`SELECT type, payload FROM run_events WHERE run_id = $1 AND type IN ('retest.finished', 'retest.blocked') ORDER BY seq`, [run.id]),
      db().query<{ n: number }>(`SELECT count(*)::int AS n FROM findings WHERE run_id = $1 AND verification = 'verified' AND category = 'verified_issue'`, [run.parent_run_id]),
    ]);
    return { kind: 'retest', status: run.status, ...deployGate({ kind: 'retest', status: run.status, stopReason: run.stop_reason, retestEvents: events.rows, expected: expected.rows[0]?.n }) };
  }
  const findings = (await db().query<CompareFinding & GateFinding>('SELECT id, title, category, verification, fingerprint, rule_id, rule_source, impact FROM findings WHERE run_id = $1', [run.id])).rows;
  const comparison = await previousRunComparison(db(), run, findings);
  return { kind: 'explore', status: run.status, ...deployGate({ kind: 'explore', status: run.status, stopReason: run.stop_reason, findings, comparison }) };
}
