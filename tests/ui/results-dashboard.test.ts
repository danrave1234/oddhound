import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultCounts, resultDomain, type ResultFinding } from '../../apps/web/app/runs/[id]/results-data.ts';

test('a verified header observation is not a verified functional issue or security exploit', () => {
  const findings: ResultFinding[] = [
    { id: 'header', title: 'No Content-Security-Policy on HTML pages', category: 'configuration_observation', verification: 'verified' },
    { id: 'task', title: 'Task title not saved', category: 'needs_review', verification: 'inconclusive' },
    { id: 'profile', title: 'Profile not saved', category: 'needs_review', verification: 'inconclusive' },
  ];
  const before = structuredClone(findings);
  assert.deepEqual(resultCounts(findings), { verified: 0, review: 2, observations: 1, suggestions: 0 });
  assert.equal(resultDomain(findings[0]!, []), 'security');
  assert.equal(resultDomain(findings[1]!, []), 'other');
  assert.deepEqual(findings, before, 'presentation must preserve saved verification and assertions');
});

test('an owner rule reusing B5 cannot inherit baseline mobile semantics', () => {
  const finding: ResultFinding = { id: 'custom', title: 'Wrong canonical URL', category: 'verified_issue', verification: 'verified', rule_id: 'B5' };
  assert.equal(resultDomain(finding, [{ id: 'B5', source: 'owner', text: 'Each public article has a canonical URL.' }]), 'seo');
  assert.equal(resultDomain(finding, [{ id: 'B5', source: 'baseline', text: 'Pages fit a phone.' }]), 'ux');
  assert.equal(resultDomain(finding, []), 'other');
});

test('empty or unverified findings cannot become a pass or inflate verified issues', () => {
  assert.deepEqual(resultCounts([]), { verified: 0, review: 0, observations: 0, suggestions: 0 });
  assert.equal(resultCounts([{ id: 'pending', title: 'Not replayed', category: 'verified_issue', verification: 'inconclusive' }]).verified, 0);
});
