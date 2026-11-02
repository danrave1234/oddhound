import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resetOwnedFixture } from '../../packages/core/net/safe-fetch.ts';

describe('owned fixture reset', () => {
  it('pins the validated address, preserves the owned Host, and does not forward a reset token across a redirect', async () => {
    const arrivals: { path: string; method: string; host?: string; token?: string }[] = [];
    const server = createServer((req, res) => { arrivals.push({ path: req.url!, method: req.method!, host: req.headers.host, token: req.headers['x-lab-reset-token'] as string }); res.writeHead(302, { location: '/elsewhere' }).end(); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    const origin = `http://owned.example:${port}`; let lookups = 0;
    try {
      const result = await resetOwnedFixture(origin, `${origin}/__lab/reset`, 'synthetic-reset-secret', { lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) }, resolver: async () => { lookups++; return [{ address: '127.0.0.1', family: 4 }]; } });
      expect(result.status).toBe(302); expect(lookups).toBe(1);
      expect(arrivals).toEqual([{ path: '/__lab/reset', method: 'POST', host: `owned.example:${port}`, token: 'synthetic-reset-secret' }]);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('refuses other origins, paths and mixed private answers before any reset request', async () => {
    for (const target of ['https://other.example/__lab/reset', 'https://owned.example/anything', 'https://owned.example/__lab/reset?to=other']) {
      await expect(resetOwnedFixture('https://owned.example', target, 'test-token')).rejects.toMatchObject({ code: 'reset_scope_mismatch' });
    }
    await expect(resetOwnedFixture('https://owned.example', 'https://owned.example/__lab/reset', 'test-token', { resolver: async () => [{ address: '1.1.1.1', family: 4 }, { address: '10.0.0.1', family: 4 }] })).rejects.toMatchObject({ code: 'blocked_address' });
  });
});
