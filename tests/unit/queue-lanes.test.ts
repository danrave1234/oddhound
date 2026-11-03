import { describe, expect, it } from 'vitest';
import { laneFor, RUN_LANES } from '../../packages/core/queue/queue.ts';

describe('run lanes', () => {
  it('keeps demos and retests out of the lane that hour-long site runs use', () => {
    expect(laneFor('verified_site')).toBe('site');
    expect(laneFor('demo_target')).toBe('quick');
    expect(laneFor('retest')).toBe('quick');
  });

  it('starts a worker for every lane a run can be queued on', () => {
    for (const mode of ['verified_site', 'demo_target', 'retest'] as const) expect(RUN_LANES).toContain(laneFor(mode));
  });
});
