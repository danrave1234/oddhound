// The CI verdict after a deploy: retests gate on every verified bug being fixed; a new exploration
// fails only on verified bugs the previous run had not found; nothing undecided ever passes.
import { describe, it, expect } from 'vitest';
import { deployGate } from '../../packages/core/reports/deploy-gate.ts';

const ev = (type: string, payload: Record<string, unknown>) => ({ type, payload });
const bug = (id: string, title = id) => ({ id, title, category: 'verified_issue', verification: 'verified' });

describe('deploy gate', () => {
  it('waits while the run is active and never passes a run that ended without a decision', () => {
    expect(deployGate({ kind: 'retest', status: 'running' }).verdict).toBe('pending');
    expect(deployGate({ kind: 'retest', status: 'blocked', stopReason: 'ownership_not_verified:http_404' })).toMatchObject({ verdict: 'undecided', summary: expect.stringContaining('ownership not verified') });
  });

  it('passes a retest only when every verified finding is fixed', () => {
    const fixed = ev('retest.finished', { findingId: 'a', title: 'A', outcome: 'passed', control: 'passed' });
    expect(deployGate({ kind: 'retest', status: 'completed', retestEvents: [fixed], expected: 1 })).toMatchObject({ verdict: 'pass', fixed: 1 });
    expect(deployGate({ kind: 'retest', status: 'completed', retestEvents: [fixed, ev('retest.finished', { findingId: 'b', title: 'B', outcome: 'failed' })], expected: 2 })).toMatchObject({ verdict: 'fail', stillFailing: 1 });
    expect(deployGate({ kind: 'retest', status: 'completed', retestEvents: [fixed], expected: 2 }).verdict).toBe('undecided');
  });

  it('fails an exploration only on verified bugs that are new since the previous run', () => {
    const comparison = { previousRunId: 'p', previousAt: null, changes: { a: 'repeat' as const, b: 'new' as const }, notSeen: [] };
    const both = deployGate({ kind: 'explore', status: 'stopped', findings: [bug('a'), bug('b', 'Blank name accepted')], comparison });
    expect(both).toMatchObject({ verdict: 'fail', newBugs: ['Blank name accepted'], knownBugs: 1 });
    expect(deployGate({ kind: 'explore', status: 'completed', findings: [bug('a')], comparison })).toMatchObject({ verdict: 'pass', knownBugs: 1 });
    // No earlier run: every verified bug is new. Unverified candidates never count.
    expect(deployGate({ kind: 'explore', status: 'completed', findings: [bug('x'), { ...bug('y'), verification: 'inconclusive' }], comparison: null })).toMatchObject({ verdict: 'fail', newBugs: ['x'] });
  });
});
