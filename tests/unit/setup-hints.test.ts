import { describe, expect, it } from 'vitest';
import { setupHints, untestedChecklist } from '../../packages/core/reports/gaps.ts';

// Scope edges recorded by the EstabWeb run (0b786b22, Nov 3 2026): its app lives on another subdomain
// behind Google sign-in and reCAPTCHA, so the run tested only marketing pages.
const estab = {
  origin: 'https://www.estabweb.com',
  leftTo: ['https://app.estabweb.com/', 'https://app.estabweb.com/', 'https://app.estabweb.com/', 'https://sites.estabweb.com/',
    'chrome-error://chromewebdata/', 'https://sxedjyocmyqdxscrxtzx.supabase.co/auth/v1/authorize?provider=google&redirect_to=x'],
  deniedWrites: ['https://www.google.com/recaptcha/api2/clr?k=x'],
  signUpUnavailable: true,
};

describe('setup hints', () => {
  it('names the sibling address the app moved to, most visited first', () => {
    const hints = setupHints(estab);
    expect(hints.map((h) => h.path)).toEqual(['https://app.estabweb.com', 'https://sites.estabweb.com', 'https://www.estabweb.com']);
    expect(hints[0]!.text).toContain('3 times');
    expect(hints[0]!.text).toContain('verify it as its own site');
  });

  it('explains why sign-up stalled and points to the handoff', () => {
    const auth = setupHints(estab).at(-1)!;
    expect(auth.text).toContain('sign-in hands off to Google and a reCAPTCHA bot check guards the forms');
    expect(auth.text).toContain("I'll sign in myself first");
  });

  it('ignores other sites and stays silent when nothing blocked the run', () => {
    expect(setupHints({ origin: 'https://www.billis.online', leftTo: ['https://stripe.com/x', 'https://example.org/'], deniedWrites: ['https://www.billis.online/refund'], signUpUnavailable: false })).toEqual([]);
  });

  it('puts setup items at the top of the not-tested checklist', () => {
    const list = untestedChecklist({ entries: [{ path: '/about', visited: false }], setup: setupHints(estab) });
    expect(list[0]!.kind).toBe('setup');
    expect(list.at(-1)!.path).toBe('/about');
  });
});
