import { canViewRun, currentUser, db, isUuid, json, loadRunForAccess, publicOrigin } from '@/lib/server';
import { loadBriefInput } from '@core/reports/load.ts';
import { fixBriefJson, fixBriefMarkdown } from '@core/reports/fix-brief.ts';
import { bugTicketMarkdown } from '@core/reports/bug-ticket.ts';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const f = (await db().query<{ run_id: string }>('SELECT run_id FROM findings WHERE id = $1', [id])).rows[0];
  const run = f && (await loadRunForAccess(f.run_id));
  if (!run || !canViewRun(await currentUser(), run)) return json({ error: 'Not found' }, 404);
  const input = await loadBriefInput(db(), id);
  if (!input) return json({ error: 'Not found' }, 404);
  const url = new URL(req.url);
  if (url.searchParams.get('format') === 'json') return json(fixBriefJson(input));
  if (url.searchParams.get('format') === 'ticket') {
    const origin = publicOrigin(req);
    return new Response(bugTicketMarkdown(input, { runUrl: `${origin}/runs/${f.run_id}`, appOrigin: origin }), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return new Response(fixBriefMarkdown(input), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' } });
}
