// Shared "get text, copy it" helpers for the copy buttons (fix prompt, bug report, receipt, checklist, tokens).

/** Writes text to the clipboard. 'failed' means the clipboard is unavailable; callers then show the text instead. */
export async function copyText(text: string): Promise<'copied' | 'failed'> {
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}

/** Fetches a text body. Throws on a non-OK response, so an error page is never copied as if it were the content. */
export async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.text();
}
