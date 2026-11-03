// Draft focus areas and rules from the verified site's public home page with one Muse Spark call.
// Verified sites only; the fetch pins public addresses and follows one same-origin redirect at most.
import { randomUUID } from 'node:crypto';
import { currentUser, db, isUuid, json } from '@/lib/server';
import { safeFetch, SafeFetchError } from '@core/net/safe-fetch.ts';
import { labProfileFromEnv } from '@core/net/ip-policy.ts';
import { providersFromEnv } from '@core/providers/openai-compatible.ts';
import { priceFor, inputTokenBound, reservationMicros, actualMicros } from '@core/providers/pricing.ts';
import { reserveSideSpend, settleSpend, releaseSpend, markSpendUnknown } from '@core/ledger/spend.ts';
import { DRAFT_TOOL, digestHtml, draftMessages, parseDraft } from '@core/planning/draft-plan.ts';

const MAX_OUTPUT = 3_000;

async function homePage(origin: string): Promise<string> {
  const opts = { lab: labProfileFromEnv(), maxBytes: 512 * 1024, timeoutMs: 10_000 };
  let res = await safeFetch(`${origin}/`, opts);
  const loc = res.headers.location;
  if (res.status >= 300 && res.status < 400 && typeof loc === 'string') {
    const next = new URL(loc, `${origin}/`);
    if (next.origin === origin) res = await safeFetch(next.toString(), opts);
  }
  if (res.status !== 200) throw new SafeFetchError('http_status', `HTTP ${res.status}`);
  return res.body;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user || !isUuid(id)) return json({ error: 'Not found' }, 404);
  const project = (await db().query<{ origin: string; verified: boolean }>(
    `SELECT p.origin, coalesce((SELECT sv.verified FROM site_verifications sv WHERE sv.project_id = p.id AND sv.origin = p.origin ORDER BY sv.revision DESC LIMIT 1), false) AS verified
     FROM projects p WHERE p.id = $1 AND p.owner_id = $2`, [id, user.id])).rows[0];
  if (!project) return json({ error: 'Not found' }, 404);
  if (!project.verified) return json({ error: 'Verify the site first; Oddhound only reads sites you have proven you own.' }, 409);

  const provider = providersFromEnv(process.env, { runKind: 'owner' })[0];
  const price = provider && priceFor(provider.id, provider.model);
  if (!provider || !price) return json({ error: 'Drafting is not available on this deployment.' }, 503);

  let html: string;
  try { html = await homePage(project.origin); }
  catch (e) { return json({ error: `Could not read your home page (${e instanceof SafeFetchError ? e.code : 'fetch failed'}).` }, 502); }
  const messages = draftMessages(project.origin, digestHtml(html));
  const reserve = reservationMicros(price, inputTokenBound(messages, JSON.stringify([DRAFT_TOOL])), MAX_OUTPUT);
  const requestKey = `draft:${id}:${randomUUID()}`;
  const r = await reserveSideSpend(db(), { account: 'public', requestKey, micros: reserve, provider: provider.id, model: provider.model, purpose: 'plan_draft', principal: `user:${user.id}` });
  if (!r.ok) return json({ error: r.reason === 'principal_daily' ? 'You have drafted the most plans allowed today. Write focus areas by hand, or try tomorrow.' : 'The shared model budget is not available right now.', reason: r.reason }, 429);

  try {
    const result = await provider.chat({ messages, tools: [DRAFT_TOOL], maxOutputTokens: MAX_OUTPUT, temperature: 0.3, timeoutMs: 60_000 });
    const cost = result.usage ? actualMicros(price, result.usage) : reserve;
    await settleSpend(db(), requestKey, Math.min(cost, reserve), result.usage);
    const draft = parseDraft(result);
    if (!draft) return json({ error: 'The model did not return a usable plan. Try again, or write focus areas by hand.' }, 502);
    return json({ ...draft, model: provider.model, costUsd: Math.min(cost, reserve) / 1e6 });
  } catch (e) {
    if ((e as { maybeBilled?: boolean }).maybeBilled) await markSpendUnknown(db(), requestKey); else await releaseSpend(db(), requestKey);
    return json({ error: 'The model call failed. Try again in a moment.' }, 502);
  }
}
