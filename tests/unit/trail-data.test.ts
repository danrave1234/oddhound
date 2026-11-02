import { describe, expect, it } from 'vitest';
import { filterTrail, trailAtTime, trailStops, type TrailPage } from '../../apps/web/app/runs/[id]/trail-data.ts';
import { historyQuery } from '../../apps/web/lib/run-history.ts';
const state = (n: number, extra: Partial<TrailPage> = {}): TrailPage => ({ key: String(n), route: '/notes', title: `State ${n}`, actor: 'A', device: 'desktop', ...extra });
describe('complete discovery trail', () => {
  it('keeps every grouped state and separates actors, devices and later returns', () => {
    const pages = [state(1), state(2), state(3, { actor: 'B' }), state(4, { device: 'mobile' }), state(5, { route: '/settings' }), state(6)];
    const stops = trailStops(pages);
    expect(stops.map((s) => s.visits)).toEqual([2, 1, 1, 1, 1]);
    expect(stops.flatMap((s) => s.states)).toEqual(pages);
    expect(filterTrail(stops, 'State 2', 'A', 'desktop')[0]?.states[1]?.key).toBe('2');
    expect(filterTrail(stops, '', 'B', '').flatMap((s) => s.states).map((s) => s.key)).toEqual(['3']);
  });
  it('does not cap a 10,000-state run or conflate grouped records', () => {
    const pages = Array.from({ length: 10_000 }, (_, i) => state(i, { route: `/page-${Math.floor(i / 3)}` }));
    const stops = trailStops(pages);
    expect(stops).toHaveLength(3334);
    expect(stops.flatMap((s) => s.states)).toEqual(pages);
    expect(filterTrail(stops, '/page-3333', '', '')[0]?.states[0]?.key).toBe('9999');
  });
  it('replays timestamped graph states even when recent event history no longer contains discovery', () => {
    const states = Array.from({ length: 650 }, (_, i) => ({ id: String(i), route: '/notes', title: `State ${i}`, actor: 'A', device: 'desktop', first_seen_at: new Date(i * 1000).toISOString() }));
    expect(trailAtTime(states, [], 400_000)).toHaveLength(401);
    expect(trailAtTime(states, [], Infinity)).toHaveLength(650);
  });
  it('keeps repeated discovery events in old snapshot fallback', () => {
    const events = [1, 2, 3].map((seq) => ({ seq, at: new Date(seq).toISOString(), type: 'state.discovered', payload: { route: '/notes', actor: 'A', device: 'desktop' } }));
    expect(trailAtTime([], events, Infinity).map((s) => s.key)).toEqual(['event-1', 'event-2', 'event-3']);
  });
});
describe('bounded history requests', () => {
  it('accepts an explicit earlier cursor and only the fixed history kinds', () => {
    expect(historyQuery(new URLSearchParams('kind=actions&before=1000&limit=100'))).toEqual({ kind: 'actions', before: 1000, limit: 100 });
    expect(historyQuery(new URLSearchParams())).toEqual({ kind: 'events', before: null, limit: 100 });
  });
  it.each(['limit=101', 'limit=0', 'limit=NaN', 'before=-1', 'before=1.5', 'before=9007199254740992', 'kind=secrets'])('rejects invalid query %s', (query) => {
    expect(historyQuery(new URLSearchParams(query))).toBeNull();
  });
});
