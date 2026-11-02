// Real sandboxed Chromium; owned HTTP fixture and in-memory credential resolver only.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { chromium, type Browser } from 'playwright';
import { newScopedContext, checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';
import { attachScope, policyFromContract } from '../../packages/core/browser/scope.ts';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { newReplaySessions, replayScenario, scenarioHash, type ReplayEnv, type Scenario } from '../../packages/core/verifier/scenario.ts';

let browser: Browser, server: Server, origin = '', logins = 0;
const account = { username: 'hydration@example.test', secret: 'Synthetic-hydration-only-730!' };
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/login' && req.method === 'POST') {
      let body = ''; req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const fields = new URLSearchParams(body);
        if (fields.get('email') !== account.username || fields.get('password') !== account.secret) { res.writeHead(401).end('Invalid account'); return; }
        logins++;
        res.writeHead(303, { location: '/room', 'set-cookie': 'session=hydrated; HttpOnly; Path=/' }).end();
      });
      return;
    }
    const send = (content: string) => res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><body><main>${content}</main></body></html>`);
    if (req.url === '/login') {
      send(`<h1>Loading sign-in</h1><script>
        setTimeout(() => { document.querySelector('main').innerHTML = '<form method="post" action="/login"><label>Email<input name="email"></label><label>Password<input type="password" name="password"></label></form>'; }, 850);
        setTimeout(() => { document.querySelector('form').insertAdjacentHTML('beforeend', '<button>Sign in</button>'); }, 1600);
      </script>`);
      return;
    }
    if (req.url === '/room' && req.headers.cookie?.includes('session=hydrated')) { send('<h1>My room</h1><button>Log out</button><button>Open shelf</button>'); return; }
    res.writeHead(401).end('Please sign in');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture did not listen');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true });
  expect(await checkChromiumSandbox(browser)).toBe('sandbox_on');
});
afterAll(async () => { await browser?.close(); await new Promise<void>(resolve => server?.close(() => resolve())); });
function env(): ReplayEnv {
  return {
    origin, sessions: newReplaySessions(),
    newContext: async (device, state) => {
      const context = await newScopedContext(browser, device, state);
      await attachScope(context, policyFromContract(demoTargetContract(origin)), () => {});
      return context;
    },
    identity: () => ({ name: 'Hydration test', email: 'other@example.test', password: 'Other-synthetic-only!' }),
    resolveAccount: async ref => ref === 'cred_hydration' ? account : null,
  };
}
const scenario = (): Scenario => ({ kind: 'mobile_reachability', device: 'mobile',
  auth: { kind: 'login', credentialRef: 'cred_hydration', path: '/login', fields: { Email: '{email}', Password: '{password}' }, submit: 'Sign in', successText: 'Log out' },
  path: '/room', control: 'Open shelf', expectation: 'reachable',
});
it('waits for delayed fields and a later submit button in two independent fixed-assertion replays', async () => {
  const s = scenario(), hash = scenarioHash(s), before = logins;
  expect((await replayScenario(s, env())).outcome).toBe('passed');
  expect((await replayScenario(s, env())).outcome).toBe('passed');
  expect(logins - before).toBe(2);
  expect(scenarioHash(s)).toBe(hash);
});
it.each(['field', 'submit'] as const)('blocks a missing recorded %s within the bounded wait without healing or submitting', async kind => {
  const s = scenario();
  if (!s.auth || s.auth.kind === 'handoff') throw new Error('Expected login fixture');
  if (kind === 'field') s.auth.fields = { 'Recorded field no longer exists': '{email}', Password: '{password}' };
  else s.auth.submit = 'Recorded button no longer exists';
  const hash = scenarioHash(s), before = logins, start = Date.now();
  const result = await replayScenario(s, env());
  expect(result.outcome).toBe('blocked');
  expect(result.observed).toMatch(/not found within 5 seconds/);
  expect(Date.now() - start).toBeLessThan(12_000);
  expect(logins).toBe(before);
  expect(scenarioHash(s)).toBe(hash);
});
