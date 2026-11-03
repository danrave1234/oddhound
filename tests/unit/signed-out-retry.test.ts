import { describe, expect, it } from 'vitest';
import { signedOutRetry, type Scenario } from '../../packages/core/verifier/scenario.ts';

// SolarMatch, Nov 4 2026: its public pages crashed, and so did the page after sign-up, so every signed-in replay
// stopped at "authentication did not reach success text". The public pages should still be checkable signed out.
const auth = { kind: 'register' as const, path: '/register', fields: { Email: '{email}', Password: '{password}' }, submit: 'Create account', successText: 'Log out' };
const blocked = { outcome: 'blocked', observed: 'authentication did not reach success text "Log out" without a sign-in form within 5 seconds' };
const pageCheck: Scenario = { kind: 'trace', device: 'desktop', auth, start: '/', steps: [{ op: 'goto', path: '/browse' }], oracle: { type: 'error_text', pattern: 'Something went wrong' } } as Scenario;

describe('signed-out retry for page checks blocked at sign-in', () => {
  it('drops the sign-in from a page-opening check when both replays stopped at sign-in', () => {
    const s = signedOutRetry(pageCheck, [blocked, blocked]);
    expect(s).not.toBeNull();
    expect('auth' in (s as object)).toBe(false);
    expect(s).toMatchObject({ kind: 'trace', start: '/', steps: [{ op: 'goto', path: '/browse' }] });
  });

  it('keeps sign-in when the check types, clicks or submits something', () => {
    const acting = { ...pageCheck, steps: [{ op: 'goto', path: '/browse' }, { op: 'click', target: 'Filter', role: 'button' }] } as Scenario;
    expect(signedOutRetry(acting, [blocked, blocked])).toBeNull();
  });

  it('does nothing unless every replay was blocked at sign-in', () => {
    expect(signedOutRetry(pageCheck, [blocked, { outcome: 'failed', observed: 'error screen' }])).toBeNull();
    expect(signedOutRetry(pageCheck, [{ outcome: 'blocked', observed: 'field not found within 5 seconds: Email' }, blocked])).toBeNull();
    expect(signedOutRetry({ ...pageCheck, auth: undefined } as Scenario, [blocked, blocked])).toBeNull();
  });
});
