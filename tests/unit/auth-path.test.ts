import { describe, expect, it } from 'vitest';
import { authenticationReplayPath } from '../../packages/core/agent/auth-path.ts';

describe('authentication replay location', () => {
  const origin = 'https://owned.example';
  it('keeps the observed same-origin return route without substituting a default landing page', () => {
    expect(authenticationReplayPath('/login?next=%2Fmy-room', origin)).toBe('/login?next=%2Fmy-room');
    expect(authenticationReplayPath('/login', origin)).toBe('/login');
  });
  it.each(['/login?token=private', '/login?code=private', '/login?next=https%3A%2F%2Felsewhere.example', '/login?next=%2F%2Felsewhere.example', '/login?next=%2Faccount%3Ftoken%3Dprivate', '/login#private', 'https://elsewhere.example/login'])('refuses opaque or external state instead of silently dropping it: %s', path => {
    expect(authenticationReplayPath(path, origin)).toBeNull();
  });
});
