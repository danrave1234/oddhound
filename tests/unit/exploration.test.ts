import { describe, expect, it } from 'vitest';
import { Exploration } from '../../packages/core/agent/exploration.ts';
import { CoverageTracker } from '../../packages/core/agent/coverage.ts';
import type { Observation } from '../../packages/core/browser/snapshot.ts';

const origin = 'https://owned.example';
const obs = (path: string, hrefs: string[] = []): Observation => ({ url: origin + path,
  elements: hrefs.map((href, i) => ({ ref: `e${i}`, kind: 'link', label: href, href })),
} as Observation);

describe('continuous discovery', () => {
  it('discovers pages revealed after sign-in and keeps more than 100 pages pending', () => {
    const q = new Exploration(origin, () => true);
    q.observe(obs('/', ['/login']));
    q.observe(obs('/room', Array.from({ length: 140 }, (_, i) => `/section-${i}`)));
    expect(q.summary()).toMatchObject({ discovered: 143, visited: 2, pending: 141 });
    q.observe(obs('/section-3', ['/new-menu-page']));
    expect(q.entries.has('/new-menu-page')).toBe(true);
  });
  it('never grants navigation authority to external/API origins or denied paths', () => {
    const q = new Exploration(origin, p => !p.startsWith('/billing'));
    q.observe(obs('/', ['https://api.owned.example/items', '//evil.example/', '/billing', '/list', '/login?token=secret']));
    expect(q.next().map(e => e.path)).toEqual(['/list']);
    expect(q.summary()).toMatchObject({ discovered: 3, blocked: 1 });
  });
  it('prioritizes breadth without claiming sibling records were visited', () => {
    const q = new Exploration(origin, () => true);
    for (const p of ['/items/1', '/items/2', '/items/3', '/settings', '/reports']) q.add(p);
    expect(q.next(3).map(e => e.path)).toEqual(['/items/1', '/settings', '/reports']);
    q.observe(obs('/items/1'));
    expect(q.summary()).toMatchObject({ visited: 1, pending: 4 });
    expect(q.dispose('/items/2', 'skipped', 'Representative record sampled; other records untested')).toBe(true);
    expect(q.entries.get('/items/2')?.visited).toBe(false);
    expect(q.dispose('/invented', 'blocked', 'Not available')).toBe(false);
  });
  it('reports capacity loss explicitly rather than claiming exhaustive discovery', () => {
    const q = new Exploration(origin, () => true, 2);
    ['/a', '/b', '/c'].forEach(p => q.add(p));
    expect(q.summary()).toMatchObject({ discovered: 2, overflow: true });
  });
  it('separates actions from checked outcomes', () => {
    const c = new CoverageTracker(() => null), o = obs('/', ['/next']);
    c.observe(o); c.checkOutcome(o, 'e0');
    expect(c.summary().outcomeChecked).toBe(0);
    c.exercise(o, 'e0');
    expect(c.summary()).toMatchObject({ exercised: 1, outcomeChecked: 0 });
    c.checkOutcome(o, 'e0');
    expect(c.summary().outcomeChecked).toBe(1);
  });
});
