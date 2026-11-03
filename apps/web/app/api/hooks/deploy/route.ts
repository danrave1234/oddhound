// Deploy hook for CI. POST after a deploy: Oddhound retests the open verified bugs of the project (or,
// with none open, explores again with the last run's contract). GET ?run=<id>: the pass/fail verdict.
// Authorization: Bearer <project hook token>. The token reaches only its own project's runs.
import { z } from 'zod';
import { db, isUuid, json, publicOrigin } from '@/lib/server';
import { startRetest, startRunAgain } from '@/lib/admission';
import { chooseDeployAction, hookFromRequest, hookRunGate } from '@/lib/deploy-hook';

const Body = z.object({
  mode: z.enum(['auto', 'retest', 'explore']).default('auto'),
  // The deployed commit; a retried CI job for the same commit gets the run already started for it.
  sha: z.string().trim().regex(/^[A-Za-z0-9._-]{4,80}$/).optional(),
}).default({ mode: 'auto' });

const runUrl = (req: Request, id: string) => `${publicOrigin(req)}/runs/${id}`;

export async function POST(req: Request) {
  const hook = await hookFromRequest(req);
  if (!hook) return json({ error: 'Unknown or missing deploy hook token.' }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return json({ error: 'Body must be {"mode":"auto"|"retest"|"explore","sha":"<commit>"} or empty.' }, 400);
  const { mode, sha } = parsed.data;
  if (sha) {
    const seen = (await db().query<{ run_id: string; mode: string }>(`SELECT t.run_id, r.mode FROM hook_triggers t JOIN runs r ON r.id = t.run_id WHERE t.project_id = $1 AND t.sha = $2`, [hook.project.id, sha])).rows[0];
    if (seen) return json({ runId: seen.run_id, kind: seen.mode === 'retest' ? 'retest' : 'explore', url: runUrl(req, seen.run_id), reused: true });
  }
  const action = await chooseDeployAction(hook.project.id, mode);
  if (!action) return json({ error: mode === 'retest' ? 'No verified bug is open, so there is nothing to retest.' : 'Start a first run on the project page; the hook repeats it after each deploy.' }, 409);
  const started = action.kind === 'retest'
    ? await startRetest(action.parent, hook.owner, `user:${hook.owner.id}`)
    : await startRunAgain(action.parent.id, hook.owner);
  if (!started.ok) return json({ error: started.error, ...(started.reason ? { reason: started.reason } : {}) }, started.status);
  if (sha) await db().query('INSERT INTO hook_triggers (project_id, sha, run_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [hook.project.id, sha, started.runId]);
  return json({ runId: started.runId, kind: action.kind, url: runUrl(req, started.runId), reused: false }, 201);
}

export async function GET(req: Request) {
  const hook = await hookFromRequest(req);
  if (!hook) return json({ error: 'Unknown or missing deploy hook token.' }, 401);
  const runId = new URL(req.url).searchParams.get('run') ?? '';
  if (!isUuid(runId)) return json({ error: 'Pass ?run=<run id>.' }, 400);
  const gate = await hookRunGate(hook.project.id, runId);
  if (!gate) return json({ error: 'Not found' }, 404);
  return json({ runId, url: runUrl(req, runId), ...gate });
}
