const RETURN_KEYS = new Set(['next', 'returnTo', 'return_to', 'returnUrl', 'return_url', 'redirect', 'redirectTo', 'redirect_to', 'callbackUrl']);

/** Keep routing context without persisting opaque login tokens/codes in a replay recipe. */
export function authenticationReplayPath(raw: string, origin: string): string | null {
  const url = new URL(raw, origin);
  if (url.origin !== origin || url.username || url.password || url.hash) return null;
  const path = `${url.pathname}${url.search}`;
  if (path.length > 200) return null;
  for (const [key, value] of url.searchParams) {
    // Only a local return pathname is supported. Unknown query state must not be
    // silently stripped, nor copied into prompts/assertions as an apparent secret.
    if (!RETURN_KEYS.has(key) || !value.startsWith('/') || value.startsWith('//') || /[?#\\\r\n]/.test(value)) return null;
    if (new URL(value, origin).origin !== origin) return null;
  }
  return path;
}
