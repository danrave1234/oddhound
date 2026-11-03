/**
 * The in-app path of a URL: pathname and query, plus the fragment when the app routes by hash
 * (`/app#/settings`, `/#!/today`). A plain anchor (`#top`) is not a route and is dropped, so replays
 * of hash-routed single-page apps open the recorded view instead of the app shell.
 */
export function appPath(url: string | URL): string {
  const u = typeof url === 'string' ? new URL(url) : url;
  const hash = /^#!?\//.test(u.hash) ? u.hash : '';
  return `${u.pathname}${u.search}${hash}`;
}

/** The paths a contract rule must be checked against: the pathname and, for a hash route, the route inside the fragment. */
export function routePaths(url: string | URL): string[] {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (!/^#!?\//.test(u.hash)) return [u.pathname];
  return [u.pathname, u.hash.replace(/^#!?/, '').split('?')[0]!];
}
