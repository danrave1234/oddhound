// Run again: a new run of a verified site with the finished run's exact contract (goals, rules, denied
// areas, capabilities, devices, accounts, handoff), re-pinned to the site's current ownership proof.
import { canControlRun, currentUser, json, loadRunForAccess } from '@/lib/server';
import { startRunAgain } from '@/lib/admission';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await loadRunForAccess(id);
  const user = await currentUser();
  if (!run || !user || run.mode !== 'verified_site' || !(await canControlRun(user, run))) return json({ error: 'Not found' }, 404);
  const r = await startRunAgain(id, user);
  return r.ok ? json({ runId: r.runId }, 201) : json({ error: r.error, ...(r.reason ? { reason: r.reason } : {}) }, r.status);
}
