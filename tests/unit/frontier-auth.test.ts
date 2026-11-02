import { expect, it } from 'vitest';
import { NavigationFrontier } from '../../packages/core/agent/frontier.ts';

it('requires advertised-link provenance from the same actor, device and session generation', () => {
  const frontier = new NavigationFrontier('https://example.test', () => true);
  frontier.discover('/private/edit', 'header:link', undefined, 'Edit', 'A:desktop:1');
  expect(frontier.wasListed('/private/edit', 'A:desktop:1')).toBe(true);
  for (const context of ['B:desktop:1', 'A:mobile:1', 'A:desktop:2']) expect(frontier.wasListed('/private/edit', context)).toBe(false);
  frontier.navigation('https://example.test/private/edit');
  expect(frontier.wasListed('/private/edit', 'B:desktop:1')).toBe(false);
  frontier.discover('/private/edit', 'aside:link', undefined, 'Edit', 'B:desktop:1');
  expect(frontier.wasListed('/private/edit', 'B:desktop:1')).toBe(true);
  expect(frontier.summary()).toMatchObject({ discovered: 1, visited: 1, outcomeChecked: 0 });
});

it('retains an authentication prerequisite and retries it after observed sign-in', () => {
  const frontier = new NavigationFrontier('https://example.test', () => true);
  frontier.discover('/account/notes', 'header:link');
  frontier.attempted('/account/notes', 'https://example.test/login');
  expect(frontier.summary()).toMatchObject({ blocked: 1, visited: 0 });
  frontier.authenticated();
  expect(frontier.pending()).toEqual([expect.objectContaining({ path: '/account/notes', status: 'pending', checked: false })]);
  frontier.attempted('/account/notes', 'https://example.test/account/notes');
  expect(frontier.summary()).toMatchObject({ blocked: 0, visited: 1, outcomeChecked: 0 });
});

it('keeps excluded destinations as gaps without allowing an action or leaking secret query strings', () => {
  const frontier = new NavigationFrontier('https://example.test', path => !path.startsWith('/billing'));
  expect(frontier.discover('/billing', 'header:link')).toMatchObject({ status: 'blocked', excluded: true, attempts: 0 });
  expect(frontier.path('/billing')).toBeNull();
  for (const key of ['api_key', 'auth_token', 'refresh_token', 'session', 'session_id', 'sessionToken', 'accessToken']) {
    expect(frontier.discover(`/account?${key}=private-marker`, 'header:link')).toBeNull();
    expect(frontier.discover(`/#/account?${key}=private-marker`, 'header:link')).toBeNull();
  }
  expect(JSON.stringify(frontier.summary())).not.toContain('private-marker');
  expect(frontier.pending()).toHaveLength(0);
});

it('bounds repeated ordinary and hash-router calendar variants while preserving distinct feature tabs', () => {
  const frontier = new NavigationFrontier('https://example.test', () => true);
  for (let month = 1; month <= 80; month++) {
    frontier.discover(`/calendar?month=${month}`, 'nav:link');
    frontier.discover(`/#/calendar?month=${month}`, 'nav:link');
  }
  for (const tab of ['notes', 'tasks', 'shelves', 'analytics']) frontier.discover(`/workspace?tab=${tab}`, 'nav:link');
  expect(frontier.summary()).toMatchObject({ discovered: 10, pendingRoutes: 10, sampledVariants: 154 });
});

it('preserves visit evidence after a blocked disposition and keeps numeric pagination discoverable', () => {
  const frontier = new NavigationFrontier('https://example.test', () => true);
  frontier.attempted('/redirect-source', 'https://example.test/destination');
  frontier.navigation('https://example.test/destination');
  expect(frontier.dispose('/redirect-source', 'blocked', 'Redirect destination required further authorization')).toBe(true);
  expect(frontier.summary()).toMatchObject({ visited: 2, blocked: 1, outcomeChecked: 0 });
  for (let page = 1; page <= 10; page++) {
    frontier.discover(`/page/${page}`, 'header:link');
    frontier.discover(`/#/section/${page}?page=${page}`, 'header:link');
    frontier.discover(`/records?page=${page}&offset=${page * 10}`, 'header:link');
  }
  expect(frontier.summary()).toMatchObject({ discovered: 32, pendingRoutes: 30, sampledVariants: 0, visited: 2 });
});
