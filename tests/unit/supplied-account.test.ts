import { describe, expect, it } from 'vitest';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { systemPrompt } from '../../packages/core/agent/prompt.ts';
import { notebookMessages } from '../../packages/core/agent/execute-run.ts';
import { playwrightTest } from '../../packages/core/reports/playwright-export.ts';
import { scenarioHash, type Scenario } from '../../packages/core/verifier/scenario.ts';
import { redactKnownSecrets } from '../../packages/core/ledger/credentials.ts';

const contract = () => ({
  ...demoTargetContract('https://site.example'),
  accounts: [{ ref: 'cred_owner_account', label: 'StudyBoost synthetic test account', role: 'user' }],
});

describe('supplied test-account discoverability', () => {
  it('makes the granted reference available initially and after conversation compaction', () => {
    const c = contract();
    const initial = systemPrompt(c);
    const compacted = JSON.stringify(notebookMessages(c, 'batch', 'Continue the run.'));
    for (const text of [initial, compacted]) {
      expect(text).toContain('cred_owner_account');
      expect(text).toContain('StudyBoost synthetic test account');
      expect(text).toContain('actor A only');
    }
    expect(initial).toContain('fill_credential');
    expect(initial).toContain('Use a supplied test account first');
  });

  it('never grants account use when login is disabled or the owner handed over a session', () => {
    const c = contract();
    c.capabilities.login = false;
    expect(systemPrompt(c)).not.toContain('cred_owner_account');
    expect(systemPrompt(c)).toContain('login is not permitted');
    c.capabilities.login = true;
    c.handoff.enabled = true;
    expect(systemPrompt(c)).not.toContain('cred_owner_account');
  });
});

describe('supplied-account regression export', () => {
  it('requires external test credentials and keeps the saved assertion independent of them', () => {
    const scenario: Scenario = {
      kind: 'mobile_reachability', device: 'mobile', path: '/profile', control: 'Save', expectation: 'reachable',
      auth: { kind: 'login', credentialRef: 'cred_owner_account', path: '/login', fields: { Email: '{email}', Password: '{password}' }, submit: 'Sign in', successText: 'Log out' },
    };
    const hash = scenarioHash(scenario);
    const code = playwrightTest(scenario, { title: 'Save is reachable', scenarioId: 'supplied-account', assertionHash: hash });
    expect(code).toContain('process.env.TEST_ACCOUNT_USERNAME');
    expect(code).toContain('process.env.TEST_ACCOUNT_PASSWORD');
    expect(code).not.toContain('cred_owner_account');
    expect(code).not.toContain('const who = identity()');
    expect(scenarioHash(scenario)).toBe(hash);
  });
});

describe('known credential text redaction', () => {
  it('redacts exact and URL-encoded markers across nested text without mutating its input', () => {
    const secret = 'test-secret/+?91';
    const input = { title: secret, rows: [`https://site.example/?token=${encodeURIComponent(secret)}`], count: 3 };
    const safe = redactKnownSecrets(input, new Set([secret]));
    expect(safe).toEqual({ title: '[redacted]', rows: ['https://site.example/?token=[redacted]'], count: 3 });
    expect(input.title).toBe(secret);
  });
});
