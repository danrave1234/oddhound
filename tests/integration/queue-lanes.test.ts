// Both run lanes against the real BullMQ PostgreSQL backend (oddhound_test): a demo or retest
// starts while a long site run is still active in the other lane.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { closeQueue, runQueue, startRunWorker, RUN_LANES } from '../../packages/core/queue/queue.ts';

beforeAll(async () => { await migrate(getPool()); });
afterAll(async () => { await closeQueue(); await closePool(); });

describe('run lanes', () => {
  it('starts a quick-lane job while a site-lane job is still running', async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const started: string[] = [];
    let releaseSite!: () => void;
    const siteHeld = new Promise<void>((r) => { releaseSite = r; });
    let quickDone!: () => void;
    const quickFinished = new Promise<void>((r) => { quickDone = r; });
    const workers = RUN_LANES.map((lane) => startRunWorker(async (runId) => {
      started.push(runId);
      if (lane === 'site') await siteHeld; else quickDone();
    }, lane));
    await runQueue('site').add('run', { runId: `site-${tag}` }, { jobId: `site-${tag}` });
    await new Promise((r) => setTimeout(r, 1500));
    await runQueue('quick').add('run', { runId: `quick-${tag}` }, { jobId: `quick-${tag}` });
    await Promise.race([quickFinished, new Promise((_, no) => setTimeout(() => no(new Error('quick lane waited behind the site run')), 20_000))]);
    expect(started).toEqual([`site-${tag}`, `quick-${tag}`]);
    releaseSite();
    await Promise.all(workers.map((w) => w.close()));
  }, 40_000);
});
