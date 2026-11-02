import { describe, expect, it } from 'vitest';
import { NavigationFrontier } from '../../packages/core/agent/frontier.ts';

const origin = 'https://fixture.test';

describe('pagination is discovery, not proof of equivalent records', () => {
  it('keeps numeric paths beyond the old three-representative cutoff, including hash routes', () => {
    const frontier = new NavigationFrontier(origin, () => true);
    const paths = Array.from({ length: 102 }, (_, i) => [
      `/page/${i + 1}`, `/section/${i + 1}`, `/items/${i + 1}`, `/#/page/${i + 1}`,
    ]).flat();
    for (const path of paths) frontier.discover(path, 'page:link');
    expect(frontier.summary()).toMatchObject({ discovered: paths.length, pendingRoutes: paths.length, visited: 0, sampledVariants: 0 });
    expect(frontier.pending().map(entry => entry.path)).toEqual(paths);
  });

  it('retains page and offset destinations and numeric enum states in ordinary and hash queries', () => {
    const frontier = new NavigationFrontier(origin, () => true);
    const paths = Array.from({ length: 102 }, (_, i) => [
      `/list?page=${i + 1}`, `/list?offset=${i * 20}`, `/#/list?page=${i + 1}`, `/#/list?offset=${i * 20}`,
      `/settings?tab=${i + 1}`, `/#/settings?tab=${i + 1}`,
    ]).flat();
    for (const path of paths) frontier.discover(path, 'nav:link');
    expect(frontier.summary()).toMatchObject({ discovered: paths.length, pendingRoutes: paths.length, sampledVariants: 0 });
    expect(frontier.pending().map(entry => entry.path)).toEqual(paths);
  });

  it('still samples explicit opaque record identifiers without counting omitted records as visited', () => {
    const frontier = new NavigationFrontier(origin, () => true);
    for (let i = 1; i <= 12; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      frontier.discover(`/records/${id}`, 'page:link');
      frontier.discover(`/#/records/${id}`, 'page:link');
      frontier.discover(`/records?id=${i}`, 'page:link');
    }
    expect(frontier.summary()).toMatchObject({ discovered: 9, pendingRoutes: 9, visited: 0, outcomeChecked: 0, sampledVariants: 27 });
    const first = frontier.pending()[0]!;
    frontier.navigation(`${origin}${first.path}`);
    expect(frontier.summary()).toMatchObject({ visited: 1, outcomeChecked: 0, sampledVariants: 27 });
  });

  it('keeps cursor, search and date sampling visible without erasing distinct workflows', () => {
    const frontier = new NavigationFrontier(origin, () => true);
    for (let i = 1; i <= 12; i++) {
      frontier.discover(`/list?cursor=next-${i}`, 'page:link');
      frontier.discover(`/search?q=term-${i}`, 'page:link');
      frontier.discover(`/calendar/2026-10-${String(i).padStart(2, '0')}`, 'page:link');
    }
    frontier.discover('/settings/security', 'nav:link');
    frontier.discover('/reports/daily', 'nav:link');
    expect(frontier.summary()).toMatchObject({ discovered: 11, pendingRoutes: 11, visited: 0, sampledVariants: 27 });
    expect(frontier.pending().map(entry => entry.path)).toContain('/settings/security');
    expect(frontier.pending().map(entry => entry.path)).toContain('/reports/daily');
  });

  it('records actual navigation and assertions even when a record was omitted from suggestions', () => {
    const frontier = new NavigationFrontier(origin, () => true);
    const paths = Array.from({ length: 5 }, (_, i) => `/records/00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
    for (const path of paths) frontier.discover(path, 'page:link');
    expect(frontier.summary()).toMatchObject({ discovered: 3, sampledVariants: 2, visited: 0 });
    frontier.navigation(`${origin}${paths[3]}`);
    expect(frontier.summary()).toMatchObject({ discovered: 4, sampledVariants: 1, visited: 1, outcomeChecked: 0 });
    frontier.checked(paths[4]!, 'Explicit assertion held for this record.');
    expect(frontier.summary()).toMatchObject({ discovered: 5, sampledVariants: 0, visited: 1, outcomeChecked: 1 });
    expect([...frontier.entries.values()].find(entry => entry.path === paths[3])).toMatchObject({ visited: true, checked: false });
    expect([...frontier.entries.values()].find(entry => entry.path === paths[4])).toMatchObject({ visited: false, checked: true });
  });
});
