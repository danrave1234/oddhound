import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dominantArea, repeatedGoal, routeTemplate, sameGoal, siteArea } from '../../packages/core/agent/focus.ts';

const recorded = JSON.parse(readFileSync(new URL('../fixtures/recorded-batch-goals.json', import.meta.url), 'utf8')) as { billis: string[]; estab: string[] };

/** Replays a recorded run's goals: a refused batch is not added to the history, as in the run loop. */
function replay(goals: string[]) {
  const ran: string[] = [];
  const refused: number[] = [];
  goals.forEach((g, i) => (repeatedGoal(g, ran.slice(-30)) >= 5 ? refused.push(i + 1) : ran.push(g)));
  return refused;
}

describe('settled-check guard', () => {
  it('treats rephrasings of one check as the same goal', () => {
    expect(sameGoal('Negative qty/price must be rejected (R3)', 'R3 negative qty/price rejected; maths check')).toBe(true);
    expect(sameGoal('Negative qty rejected R3', 'Try negative qty and price - should be rejected per R3')).toBe(true);
  });

  it('keeps different checks apart', () => {
    expect(sameGoal('Negative qty/price must be rejected (R3)', 'XSS probe in item name, save and check display')).toBe(false);
    expect(sameGoal('FAQ accordion expands answers', 'Contact valid submit should show success')).toBe(false);
  });

  it('would have stopped the recorded invoicing loop early and often', () => {
    const refused = replay(recorded.billis);
    expect(refused[0]).toBeLessThanOrEqual(35);
    expect(refused.length).toBeGreaterThanOrEqual(45);
  });

  it('barely touches a run that kept moving between areas', () => {
    expect(replay(recorded.estab).length).toBeLessThanOrEqual(5);
  });
});

describe('focus check', () => {
  it('folds record ids, including cuid-style ones, into one route', () => {
    expect(routeTemplate('/dashboard/documents/cmw0gvc94000107jpvliztkc5/edit')).toBe('/dashboard/documents/:id/edit');
    expect(routeTemplate('/bookings/42?tab=1')).toBe('/bookings/:id');
    expect(siteArea('/dashboard/documents/new')).toBe('/dashboard/documents');
    expect(siteArea('/')).toBe('/');
  });

  it('flags an area that took most of the recent actions', () => {
    const stuck = [...Array(50).fill('/dashboard/documents/new'), ...Array(12).fill('/dashboard/documents/cmw0gvc94000107jpvliztkc5/edit')];
    expect(dominantArea(stuck)).toEqual({ area: '/dashboard/documents', count: 60, window: 60 });
  });

  it('stays quiet while actions spread across the site or the window is not full', () => {
    const spread = Array.from({ length: 60 }, (_, i) => ['/contact', '/faq', '/pricing', '/login'][i % 4]!);
    expect(dominantArea(spread)).toBeNull();
    expect(dominantArea(Array(30).fill('/contact'))).toBeNull();
  });
});
