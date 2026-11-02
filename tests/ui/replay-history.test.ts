import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeReplayEvents, type ReplayEvent } from '../../apps/web/app/runs/[id]/replay-data.ts';

const event = (seq: number): ReplayEvent => ({ seq, at: new Date(1_800_000_000_000 + seq * 1000).toISOString(),
  type: seq === 1 ? 'run.status' : seq === 2 ? 'plan.updated' : seq % 2 === 0 ? 'action.finished' : 'state.discovered',
  payload: seq === 1 ? { status: 'running' } : seq === 2 ? { charters: [{ status: 'testing', risk: 'high' }] } : { seq },
});

test('recovers the beginning, phases and historical action totals beyond a recent 300-event window', async () => {
  const all = Array.from({ length: 1200 }, (_, i) => event(i + 1));
  const initial = all.slice(-300);
  const cursors: number[] = [];
  const recording = await completeReplayEvents(initial, true, async before => {
    cursors.push(before);
    const earlier = all.filter(e => e.seq < before).reverse();
    const rows = earlier.slice(0, 100);
    return { rows, hasMore: earlier.length > 100, nextBefore: rows.at(-1)?.seq ?? null };
  }, new AbortController().signal);
  assert.equal(cursors.length, 9);
  assert.deepEqual(recording, all);
  const cursor = Date.parse(event(200).at);
  const atCursor = (rows: ReplayEvent[]) => rows.filter(e => Date.parse(e.at) <= cursor);
  assert.equal(atCursor(initial).length, 0);
  assert.equal(atCursor(recording).filter(e => e.type === 'action.finished').length, 99);
  assert.equal(atCursor(recording)[0]?.payload.status, 'running');
  assert.equal(atCursor(recording)[1]?.type, 'plan.updated');
});

test('preserves access/load failures instead of accepting incomplete playback', async () => {
  await assert.rejects(completeReplayEvents([event(300)], true, async () => { throw new Error('Not found'); }, new AbortController().signal), /Not found/);
});

test('refuses a non-advancing history cursor rather than looping', async () => {
  let calls = 0;
  await assert.rejects(completeReplayEvents([event(300)], true, async () => {
    calls++; return { rows: [], hasMore: true, nextBefore: 300 };
  }, new AbortController().signal), /did not advance/);
  assert.equal(calls, 1);
});

test('cancels without requesting another page', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(completeReplayEvents([event(300)], true, async () => { throw new Error('Unexpected fetch'); }, controller.signal), { name: 'AbortError' });
});
