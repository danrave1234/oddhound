import { canViewRun, currentUser, db, json, loadRunForAccess } from '@/lib/server';
import { historyQuery, loadHistoryPage } from '@/lib/run-history';
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await loadRunForAccess(id);
  if (!access || !canViewRun(await currentUser(), access)) return json({ error: 'Not found' }, 404);
  const options = historyQuery(new URL(req.url).searchParams);
  if (!options) return json({ error: 'Invalid history cursor or page size' }, 400);
  return json(await loadHistoryPage(db(), id, options));
}
