// The pages a site lists about itself, read once when a run starts: robots.txt, the sitemaps it names (or
// /sitemap.xml) and the links on the first page. Read from inside the run's own browser page, so every request
// takes the same proxy, scope policy and byte limits as the pages themselves. GET only, same origin only
// (fetch mode "same-origin" refuses cross-origin redirects), bounded in count and size.
import type { Page } from 'playwright';

export type SiteMap = { paths: string[]; sources: { sitemap: number; links: number }; sitemaps: string[];
  remainingSitemaps: string[]; failedSitemaps: string[]; truncatedDocuments: string[] };

const MAX_SITEMAPS = 4;
const MAX_CHARS = 512 * 1024;
const ASSET = /\.(xml|txt|json|pdf|zip|png|jpe?g|gif|webp|svg|ico|css|js|mjs|map|woff2?|mp4|mp3)$/i;
export const SECRET_QUERY = /^(?:password|secret|signature|authorization|code|api[-_]?key|(?:access|refresh|id|auth|csrf|xsrf)[-_]?token|token|session(?:[-_]?(?:id|key|token))?|auth)$/i;

/** Values from explicitly sensitive URL fields only; learning them grants no origin/action authority. */
export function sensitiveQueryValues(href: string, from: string): string[] {
  try {
    const url = new URL(href, from);
    const params = [url.searchParams];
    if (/^#!?\//.test(url.hash)) params.push(new URL(url.hash.replace(/^#!/, '').replace(/^#/, ''), from).searchParams);
    else if (url.hash.includes('=')) params.push(new URLSearchParams(url.hash.slice(1)));
    return params.flatMap(query => [...query].filter(([key, value]) => SECRET_QUERY.test(key) && value).map(([, value]) => value));
  } catch { return []; }
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

/** Sitemap URLs named in robots.txt. */
export function robotsSitemaps(text: string): string[] {
  return [...text.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]!);
}

/** The <loc> entries of a sitemap, and whether it is a sitemap index (its entries are more sitemaps). */
export function sitemapLocs(xml: string): { index: boolean; locs: string[] } {
  return { index: /<sitemapindex[\s>]/i.test(xml), locs: [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => decode(m[1]!)) };
}

/** Path and query of a same-origin page URL, or null for another origin or a file. */
export function pagePath(url: string, origin: string): string | null {
  return safeDiscoveryPath(url, origin);
}

/** Sanitize inventory before it can enter any event or model prompt; this grants no action authority. */
export function safeDiscoveryPath(url: string, origin: string, from = origin, allowAsset = false): string | null {
  try {
    const u = new URL(url, new URL(from, origin));
    if (u.origin !== origin || u.username || u.password || !/^https?:$/.test(u.protocol) || (!allowAsset && ASSET.test(u.pathname))) return null;
    const clean = (params: URLSearchParams) => {
      for (const key of [...params.keys()]) {
        if (SECRET_QUERY.test(key)) return false;
        if (/^(?:utm_.+|fbclid|gclid|msclkid)$/i.test(key)) params.delete(key);
      }
      params.sort(); return true;
    };
    if (!clean(u.searchParams)) return null;
    let hash = '';
    if (/^#!?\//.test(u.hash)) {
      const route = new URL(u.hash.replace(/^#!/, '').replace(/^#/, ''), origin);
      if (!clean(route.searchParams)) return null;
      hash = `${u.hash.startsWith('#!') ? '#!' : '#'}${route.pathname}${route.search}`;
    }
    const path = `${u.pathname}${u.search}${hash}`;
    return path.length <= 300 ? path : null;
  } catch { return null; }
}

export async function readSiteMap(page: Page, origin: string, allowed: (path: string) => boolean = () => true,
  continuation?: { pending: string[]; read: string[] }): Promise<SiteMap> {
  const get = (path: string) => page.evaluate(async ({ path, max }) => {
    try {
      const r = await fetch(path, { mode: 'same-origin', credentials: 'same-origin', signal: AbortSignal.timeout(8_000) });
      if (!r.ok || !r.body) return null;
      const reader = r.body.getReader(), decoder = new TextDecoder(); let text = '', bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) return { text: text + decoder.decode(), truncated: false };
        const remaining = max - bytes; bytes += chunk.value.byteLength;
        text += decoder.decode(chunk.value.subarray(0, remaining), { stream: true });
        if (bytes >= max) { await reader.cancel(); return { text, truncated: true }; }
      }
    } catch { return null; }
  }, { path, max: MAX_CHARS }).catch(() => null);

  const found = new Set<string>();
  const add = (url: string) => { const p = pagePath(url, origin); if (p) found.add(p); };

  const samePath = (url: string) => safeDiscoveryPath(url, origin, origin, true);
  const robots = continuation ? null : await get('/robots.txt');
  const queue = (continuation?.pending ?? (robots ? robotsSitemaps(robots.text) : [])).map(samePath).filter((p): p is string => !!p);
  if (!continuation && !queue.length) queue.push('/sitemap.xml');
  const read: string[] = [...continuation?.read ?? []];
  let batchReads = 0;
  const failedSitemaps: string[] = [], truncatedDocuments: string[] = robots?.truncated ? ['/robots.txt'] : [];
  while (queue.length && batchReads < MAX_SITEMAPS) {
    const path = queue.shift()!;
    if (read.includes(path)) continue;
    read.push(path); batchReads++;
    if (!allowed(path)) { failedSitemaps.push(path); continue; }
    const doc = await get(path);
    if (doc?.truncated) truncatedDocuments.push(path);
    if (!doc || !/<(urlset|sitemapindex)[\s>]/i.test(doc.text)) { failedSitemaps.push(path); continue; }
    const { index, locs } = sitemapLocs(doc.text);
    for (const loc of locs) {
      if (!index) { add(loc); continue; }
      const p = samePath(loc);
      if (p) queue.push(p);
    }
  }
  const fromSitemap = found.size;

  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href)).catch(() => [] as string[]);
  for (const h of hrefs) add(h);
  return { paths: [...found], sources: { sitemap: fromSitemap, links: found.size - fromSitemap }, sitemaps: read,
    remainingSitemaps: [...new Set(queue)].filter(path => !read.includes(path)), failedSitemaps, truncatedDocuments };
}
