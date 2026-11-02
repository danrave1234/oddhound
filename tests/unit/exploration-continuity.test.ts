import { describe, expect, it } from 'vitest';
import { NavigationFrontier } from '../../packages/core/agent/frontier.ts';

describe('navigation continuity beyond a prompt sample', () => {
  it('retains named pages beyond 80/200 and surfaces later pending entries as earlier ones are visited', () => {
    const frontier = new NavigationFrontier('https://fixture.test', () => true);
    const paths = Array.from({ length: 230 }, (_, i) => `/workspace/page-${i.toString(36).padStart(3, 'a')}`);
    for (const path of paths) frontier.discover(path, 'header:link');
    expect(frontier.summary()).toMatchObject({ discovered: 230, visited: 0, pendingRoutes: 230 });
    for (const path of paths.slice(0, 220)) frontier.navigation(`https://fixture.test${path}`);
    expect(frontier.summary()).toMatchObject({ discovered: 230, visited: 220, pendingRoutes: 10, outcomeChecked: 0 });
    expect(frontier.notebook()).toContain(paths[229]!);
    frontier.checked(paths[229]!, 'An explicit expected result held');
    expect(frontier.summary().outcomeChecked).toBe(1);
    expect(frontier.pending()).toHaveLength(10); // Checking an outcome does not fabricate a navigation.
  });

  it('does not sample distinct long human-readable page slugs as if they were record identifiers', () => {
    const frontier = new NavigationFrontier('https://fixture.test', () => true);
    const pages = ['notification-delivery-settings', 'organization-membership-settings', 'application-permissions-settings', 'integration-connection-settings', 'workspace-accessibility-settings'];
    for (const page of pages) frontier.discover(`/settings/${page}`, 'aside:link');
    expect(frontier.summary()).toMatchObject({ discovered: pages.length, pendingRoutes: pages.length, sampledVariants: 0 });
  });

  it('keeps query navigation distinct and excludes denied origins, paths and token-bearing URLs', () => {
    const frontier = new NavigationFrontier('https://fixture.test', (path) => !path.startsWith('/denied'));
    frontier.discover('/settings?tab=profile', 'header:link');
    frontier.discover('/settings?tab=privacy', 'header:link');
    frontier.discover('/settings?tab=security', 'header:link');
    expect(frontier.discover('https://outside.invalid/settings', 'header:link')).toBeNull();
    expect(frontier.discover('/denied/delete', 'aside:link')).toMatchObject({ status: 'blocked', excluded: true });
    expect(frontier.discover('/callback?access_token=synthetic-token', 'header:link')).toBeNull();
    expect(frontier.summary().discovered).toBe(4);
    for (const entry of frontier.pending()) expect(frontier.block(entry.id, 'No time left')).toMatch(/attempt.*first/i);
    expect(frontier.summary()).toMatchObject({ blocked: 1, excluded: 1, pendingRoutes: 3 });
  });
});
