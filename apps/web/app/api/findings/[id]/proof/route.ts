import { canViewRun, currentUser, db, json, loadRunForAccess } from '@/lib/server';
import { fixReceiptMarkdown, loadProofChain } from '@core/reports/proof-chain.ts';
import { withBuildNames } from '@/lib/proof';

// The proof chain of one finding (replays, valid case, retests) or, with ?format=receipt, its Markdown fix receipt.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Not found' }, 404);
  const f = (await db().query<{ run_id: string }>('SELECT run_id FROM findings WHERE id = $1', [id])).rows[0];
  const run = f && (await loadRunForAccess(f.run_id));
  if (!run || !canViewRun(await currentUser(), run)) return json({ error: 'Not found' }, 404);
  const loaded = await loadProofChain(db(), id);
  if (!loaded) return json({ error: 'Not found' }, 404);
  const chain = withBuildNames(loaded);
  if (new URL(req.url).searchParams.get('format') === 'receipt') {
    const runUrl = new URL(`/runs/${f.run_id}`, req.url).toString();
    return new Response(fixReceiptMarkdown(chain, { run: runUrl }), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return json(chain);
}
