import { expect, it } from 'vitest';
import { NavigationFrontier } from '../../packages/core/agent/frontier.ts';

it('does not let a growing root pagination stream starve independent branches', () => {
  const origin = 'https://owned.example';
  const frontier = new NavigationFrontier(origin, () => true);
  frontier.navigation(`${origin}/`);
  const branches = ['/catalog/item', '/organizations/item', '/articles/item'];
  for (const path of branches) frontier.add(path);
  const selected: string[] = [];
  for (let page = 1; page <= 12; page++) {
    frontier.discover(`/?page=${page}`, 'header:link', `${origin}/`);
    const next = frontier.next(1)[0]!;
    selected.push(next.path);
    frontier.attempted(next.path, `${origin}${next.path}`);
  }
  for (const path of branches) expect(selected.slice(0, 6)).toContain(path);
  expect(frontier.summary().pendingRoutes).toBeGreaterThan(0);
  expect(frontier.summary().outcomeChecked).toBe(0);
});
