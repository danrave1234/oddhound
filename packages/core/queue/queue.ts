// Run dispatch on BullMQ 6 with its PostgreSQL backend (same database as the app; no Redis).
// The queue only carries the stable run ID. The run row (status, lease, fence) is the source of
// truth: a redelivered job for a run that is no longer queued is a no-op in claimRun.

import { Queue, Worker, createPostgresBackend } from 'bullmq';
import { databaseUrl } from '../db/pool.ts';
import { wakeWorker } from './wake.ts';

// ODDHOUND_RUN_QUEUE lets two deployments share one database without taking each other's runs
// (Modal alongside Fly during the migration).
export const RUN_QUEUE = process.env.ODDHOUND_RUN_QUEUE || 'oddhound-runs';

/**
 * A verified-site run can take an hour; demo runs and retests take minutes. Each lane runs one job at a
 * time, so a visitor's demo or an owner's retest never waits behind someone's hour-long site run.
 * One demo at a time also keeps the demo target's in-memory data to a single run.
 */
export type RunLane = 'site' | 'quick';
export type RunMode = 'verified_site' | 'demo_target' | 'retest';
export const RUN_LANES: readonly RunLane[] = ['site', 'quick'];
export const laneFor = (mode: RunMode): RunLane => (mode === 'verified_site' ? 'site' : 'quick');
const queueName = (lane: RunLane) => (lane === 'site' ? RUN_QUEUE : `${RUN_QUEUE}-quick`);

const makeQueue = (lane: RunLane) => new Queue(queueName(lane), { connection: databaseUrl() }, createPostgresBackend);
const queues = new Map<RunLane, ReturnType<typeof makeQueue>>();

export function runQueue(lane: RunLane = 'site') {
  const q = queues.get(lane) ?? makeQueue(lane);
  queues.set(lane, q);
  return q;
}

/** Enqueue after admission. jobId = runId, so a duplicate enqueue cannot create a second job. */
export async function enqueueRun(runId: string, mode: RunMode): Promise<void> {
  await runQueue(laneFor(mode)).add('run', { runId }, { jobId: runId, attempts: 1, removeOnComplete: 500, removeOnFail: 500 });
  await wakeWorker();
}

export function startRunWorker(processor: (runId: string) => Promise<unknown>, lane: RunLane = 'site') {
  return new Worker(queueName(lane), async (job) => processor((job.data as { runId: string }).runId), {
    connection: databaseUrl(),
    concurrency: 1,
    lockDuration: 60_000,
    stalledInterval: 30_000,
    maxStalledCount: 0, // a stalled run is NOT re-executed blindly; the stale-run reaper fences it instead
  }, createPostgresBackend);
}

export async function closeQueue(): Promise<void> {
  const open = [...queues.values()];
  queues.clear();
  await Promise.all(open.map((q) => q.close()));
}
