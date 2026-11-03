// Retest: replay the saved, unchanged assertions of a run's verified findings against the target.
// For a verified site the target is the same origin (after the owner deploys a fix). The demo target
// cannot redeploy itself, so its retest runs against the separately hosted corrected build.
import { canControlRun, currentUser, json, loadRunForAccess, anonymousPrincipal } from '@/lib/server';
import { startRetest } from '@/lib/admission';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await loadRunForAccess(id);
  const user = await currentUser();
  if (!run || run.mode === 'retest' || !(await canControlRun(user, run))) return json({ error: 'Not found' }, 404);
  const r = await startRetest(run, user, user ? `user:${user.id}` : await anonymousPrincipal());
  return r.ok ? json({ runId: r.runId }, 201) : json({ error: r.error, ...(r.reason ? { reason: r.reason } : {}) }, r.status);
}
