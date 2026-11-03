import { currentUser, db, isUuid, json } from '@/lib/server';
import { readOwnerPreview } from '@core/artifacts/owner-preview.ts';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const user = await currentUser();
  const frame = await readOwnerPreview(db(), id, user?.id ?? null);
  if (!frame) return json({ error: 'No protected frame available' }, 404);
  return new Response(new Uint8Array(frame), { headers: {
    'content-type': 'image/jpeg', 'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin',
  } });
}
