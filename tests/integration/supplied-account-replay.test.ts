// Real Chromium against an isolated local login fixture. The credential resolver is a test vault;
// no Meta inference or real-site requests, and no credentials are embedded in the saved assertion.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { chromium, type Browser } from 'playwright';
import { newScopedContext, checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';
import { attachScope, policyFromContract } from '../../packages/core/browser/scope.ts';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { newReplaySessions, replayScenario, scenarioHash, type ReplayEnv, type Scenario } from '../../packages/core/verifier/scenario.ts';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { storeCredential } from '../../packages/core/ledger/credentials.ts';
import { admitRun } from '../../packages/core/ledger/runs.ts';
import { executeRun } from '../../packages/core/agent/execute-run.ts';
import { LocalBrowserRuntime } from '../../packages/core/browser/runtime.ts';
import type { ChatProvider, ChatRequest, ChatResult } from '../../packages/core/providers/types.ts';

const SECRET = 'Only-in-the-test-vault-7731!';
const USERNAME = 'supplied-account@example.test';
const REF = 'cred_authorized_account';
let browser: Browser;
let server: Server;
let origin = '';
let port = 0;
let logins = 0;
let writes = 0;
const records: string[] = [];
let loginMode: 'redirect' | 'spa' | 'failure' | 'signed_out' | 'duplicate_submit' = 'redirect';
const loginForm = '<form method="post" action="/login"><label>Email<input name="email"></label><label>Password<input name="password" type="password"></label><button>Sign in</button></form>';
const room = '<h1>My room</h1><button onclick="location.href=\'/profile\'">Open shelf</button>';
const html = (body: string) => `<!doctype html><html><body><main>${body}</main></body></html>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    const requested = new URL(req.url ?? '/', 'http://fixture.test');
    const send = (body: string, code = 200) => res.writeHead(code, { 'content-type': 'text/html' }).end(html(body));
    if (requested.pathname === '/login' && req.method === 'POST') {
      let raw = ''; req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        const form = new URLSearchParams(raw);
        if (loginMode !== 'redirect' && loginMode !== 'duplicate_submit') {
          const authorized = loginMode === 'spa' && form.get('email') === USERNAME && form.get('password') === SECRET;
          if (authorized) logins++;
          res.writeHead(authorized || loginMode === 'signed_out' ? 200 : 401, { 'content-type': 'application/json', ...(authorized ? { 'set-cookie': 'session=authorized-account; HttpOnly; Path=/' } : {}) }).end(JSON.stringify({ ok: authorized, signedOut: loginMode === 'signed_out' }));
          return;
        }
        if (form.get('email') !== USERNAME || form.get('password') !== SECRET) return void send('<p>Wrong credentials</p>', 401);
        logins++;
        res.writeHead(303, { location: requested.searchParams.get('next') === '/my-room' ? '/my-room' : '/profile', 'set-cookie': 'session=authorized-account; HttpOnly; Path=/' }).end();
      });
      return;
    }
    if (requested.pathname === '/login') return void send((loginMode === 'duplicate_submit' ? '<button type="button">Sign in</button>' : '') + loginForm.replace('action="/login"', `action="/login${requested.search}"`) + (loginMode === 'redirect' || loginMode === 'duplicate_submit' ? '' : `<script>
      document.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        const result = await fetch('/login', {method:'POST',body:new URLSearchParams(new FormData(event.target))}).then(r=>r.json());
        if (!result.ok && !result.signedOut) { document.querySelector('main').insertAdjacentHTML('beforeend','<p role="alert">Wrong credentials</p>'); return; }
        setTimeout(() => {
          history.pushState({},'',result.ok ? '/my-room' : '/signed-out');
          document.querySelector('main').innerHTML = result.ok ? ${JSON.stringify(room)} : '<h1>Welcome</h1><a href="/login">Sign in</a>';
        }, 2000);
      };
    </script>`));
    if (req.url === '/signed-out') return void send('<h1>Welcome</h1><a href="/login">Sign in</a>');
    if (!(req.headers.cookie ?? '').includes('session=authorized-account')) return void send('<h1>Please sign in</h1>', 401);
    if (req.url === '/my-room') return void send(room);
    if (req.url === '/profile' && req.method === 'POST') {
      let raw = ''; req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => { records.push(new URLSearchParams(raw).get('name') ?? ''); writes++; res.writeHead(303, { location: '/records' }).end(); });
      return;
    }
    if (req.url === '/profile') return void send(`<h1>Test profile</h1><button>Log out</button><form method="post" action="/profile"><label>Name<input name="name"></label><label>Note<input name="note"></label><button>Save</button></form>
      <p>Reflected secret: ${SECRET}</p><label>Plain echo<input name="echo" value="${SECRET}"></label>
      <label>Password echo<input id="echo-password" type="password" value="${SECRET}"></label>
      <button onclick="document.getElementById('echo-password').type='text'; alert('${SECRET}')">Reveal test password</button>`);
    if (req.url === '/records') return void send(records.map((r) => `<article>${r}</article>`).join(''));
    send('<h1>Not found</h1>', 404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
  origin = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true });
  expect(await checkChromiumSandbox(browser)).toBe('sandbox_on');
});
afterAll(async () => { await browser?.close(); await closePool(); await new Promise<void>((resolve) => server?.close(() => resolve())); });
afterEach(() => { loginMode = 'redirect'; });

function env(): ReplayEnv {
  return {
    origin, sessions: newReplaySessions(),
    newContext: async (device, state) => {
      const context = await newScopedContext(browser, device, state);
      await attachScope(context, policyFromContract(demoTargetContract(origin)), () => {});
      return context;
    },
    identity: () => ({ name: 'Synthetic value', email: 'unregistered@example.test', password: 'not-the-account-password' }),
    resolveAccount: async (ref) => ref === REF ? { username: USERNAME, secret: SECRET } : null,
  };
}
const scenario = (): Scenario => ({
  kind: 'form_rule', device: 'desktop',
  auth: { kind: 'login', credentialRef: REF, path: '/login', fields: { Email: '{email}', Password: '{password}' }, submit: 'Sign in', successText: 'Log out' },
  form: { path: '/profile', fields: { Name: '{marker}', Note: 'Valid test note' }, submit: 'Save' },
  testedField: 'Note', expectation: 'accepted', listPath: '/records',
});

describe('supplied test-account replays', () => {
  it('submits the filled form instead of a same-named sign-in mode button', async () => {
    loginMode = 'duplicate_submit';
    const s = scenario(), hash = scenarioHash(s), before = logins;
    const result = await replayScenario(s, env());
    expect(result.outcome).toBe('passed');
    expect(logins - before).toBe(1);
    expect(scenarioHash(s)).toBe(hash);
  });
  it('waits for delayed SPA authentication in fresh contexts without changing the assertion', async () => {
    loginMode = 'spa';
    const auth = scenario().auth;
    if (!auth || auth.kind === 'handoff') throw new Error('Expected a form auth fixture');
    const s: Scenario = { kind: 'mobile_reachability', device: 'mobile', auth: { ...auth, successText: 'My room' }, path: '/my-room', control: 'Open shelf', expectation: 'reachable' };
    const hash = scenarioHash(s), beforeLogins = logins;
    expect((await replayScenario(s, env())).outcome).toBe('passed');
    expect((await replayScenario(s, env())).outcome).toBe('passed');
    expect(logins - beforeLogins).toBe(2);
    expect(scenarioHash(s)).toBe(hash);
  });

  it.each(['failure', 'signed_out'] as const)('fails closed on a %s SPA response before protected writes', async (mode) => {
    loginMode = mode;
    const s = scenario();
    if (s.auth?.kind !== 'handoff' && s.auth) s.auth.successText = mode === 'signed_out' ? 'Welcome' : 'Wrong credentials';
    const beforeWrites = writes, beforeLogins = logins;
    const result = await replayScenario(s, env());
    expect(result.outcome).toBe('blocked');
    expect(result.observed).toMatch(/authentication did not reach/);
    expect(writes).toBe(beforeWrites);
    expect(logins).toBe(beforeLogins);
  });
  it('logs into the authorized account in a fresh context, performs the saved workflow, and repeats the unchanged assertion', async () => {
    const s = scenario();
    const hash = scenarioHash(s);
    const beforeLogins = logins, beforeWrites = writes;
    const first = await replayScenario(s, env());
    const retest = await replayScenario(s, env());
    expect([first.outcome, retest.outcome]).toEqual(['passed', 'passed']);
    expect(logins - beforeLogins).toBe(2);
    expect(writes - beforeWrites).toBe(2);
    expect(scenarioHash(s)).toBe(hash);
    expect(JSON.stringify(s)).not.toContain(SECRET);
    expect(JSON.stringify(s)).not.toContain(USERNAME);
    expect(JSON.stringify([first.observed, first.details, retest.observed, retest.details])).not.toContain(SECRET);
    expect(first.screenshots).toEqual([]);
    expect(first.details.screenshotsWithheld).toMatch(/pixel sanitization/);
  });

  it('blocks an unknown or legacy missing reference before login or writes', async () => {
    const beforeLogins = logins, beforeWrites = writes;
    for (const ref of ['cred_not_authorized', undefined]) {
      const s = scenario();
      if (s.auth?.kind === 'login') s.auth.credentialRef = ref;
      const result = await replayScenario(s, env());
      expect(result.outcome).toBe('blocked');
      expect(result.observed).toMatch(/authorized by this run/);
    }
    expect(logins).toBe(beforeLogins);
    expect(writes).toBe(beforeWrites);
  });

  it('refuses to borrow the supplied account as a second actor', async () => {
    const s = scenario();
    const cross: Scenario = { kind: 'cross_account_read', device: 'desktop', auth: s.auth!, create: { path: '/profile', fields: { Name: '{marker}' }, submit: 'Save' }, listPath: '/records', expectation: 'denied' };
    // A denied second actor must be checked before any scenario writes, even if the case otherwise needs setup.
    const beforeLogins = logins, beforeWrites = writes;
    const result = await replayScenario(cross, env());
    expect(result.outcome).toBe('blocked');
    expect(result.observed).toMatch(/separate account is required/);
    expect(logins).toBe(beforeLogins);
    expect(writes).toBe(beforeWrites);
  });
});

// Scripted responses exercise dispatch/recording, not the model's ability to discover a login.
class AccountPlanner implements ChatProvider {
  readonly id = 'test-double'; readonly model = 'heuristic-planner'; readonly isMetaModel = false;
  readonly label = 'Scripted supplied-account test';
  readonly capability = { tools: true, images: false, imagesInToolMessages: false, toolChoiceValues: ['auto'] as const, structuredOutput: false };
  seen: string[] = []; turn = 0;
  readonly mode: 'steps' | 'batch';
  constructor(mode: 'steps' | 'batch') { this.mode = mode; }
  async chat(req: ChatRequest): Promise<ChatResult> {
    const serialized = JSON.stringify(req.messages);
    this.seen.push(serialized);
    const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
    const ref = /"credential_ref":"(cred_[A-Za-z0-9_-]+)"/.exec(String(system))?.[1];
    if (!ref) throw new Error('The supplied account was not disclosed to the provider');
    const observation = [...req.messages].reverse().find((m) => m.role === 'tool' && m.content.includes('PAGE v'));
    const refs = new Map<string, string>();
    if (observation?.role === 'tool') for (const line of observation.content.split('\n')) {
      const match = /^\[(e\d+)\] \w+ "([^"]*)"/.exec(line); if (match) refs.set(match[2]!, match[1]!);
    }
    const calls: [string, unknown][] = [
      ['observe', {}], ['navigate', { path: '/login' }],
      ['fill_credential', { ref: refs.get('Email'), credential_ref: ref, field: 'password' }],
      ...(this.mode === 'steps'
        ? [['fill_form', { fields: [{ ref: refs.get('Email'), credential_ref: ref, field: 'username' }, { ref: refs.get('Password'), credential_ref: ref, field: 'password' }] }] as [string, unknown]]
        : [['fill_credential', { ref: refs.get('Email'), credential_ref: ref, field: 'username' }], ['fill_credential', { ref: refs.get('Password'), credential_ref: ref, field: 'password' }]] as [string, unknown][]),
      ['click', { ref: refs.get('Sign in') }],
      ['click', { ref: refs.get('Reveal test password') }],
      ['observe', { screenshot: true }],
      ['report_candidate', { title: 'Profile save button on mobile', rule_id: 'B5', impact: 'low', observed: 'Checking the Save control on the profile page.', scenario: { kind: 'mobile_reachability', device: 'mobile', path: '/profile', control: 'Save', expectation: 'reachable' } }],
      ['use_actor', { actor: 'B' }], ['navigate', { path: '/login' }],
      ['fill_credential', { ref: refs.get('Password'), credential_ref: ref, field: 'password' }],
      ['use_actor', { actor: 'A' }], ['finish_run', { summary: 'Signed into the supplied test account and checked the profile.' }],
    ];
    const [name, args] = calls[this.turn++] ?? ['finish_run', { summary: 'Done' }];
    return { message: { role: 'assistant', content: null, tool_calls: [{ id: `call_${this.turn}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, finishReason: 'tool_calls', requestId: null, model: this.model };
  }
}

class SpaPlanner extends AccountPlanner {
  readonly succeeds: boolean;
  loginPath: string;
  constructor(succeeds: boolean, loginPath = '/login') { super('batch'); this.succeeds = succeeds; this.loginPath = loginPath; }
  override async chat(req: ChatRequest): Promise<ChatResult> {
    this.seen.push(JSON.stringify(req.messages));
    const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
    const ref = /"credential_ref":"(cred_[A-Za-z0-9_-]+)"/.exec(String(system))?.[1];
    if (!ref) throw new Error('Missing supplied reference');
    const observation = [...req.messages].reverse().find((m) => m.role === 'tool' && m.content.includes('PAGE v'));
    const refs = new Map<string, string>();
    if (observation?.role === 'tool') for (const line of observation.content.split('\n')) {
      const match = /^\[(e\d+)\] \w+ "([^"]*)"/.exec(line); if (match) refs.set(match[2]!, match[1]!);
    }
    const calls: [string, unknown][] = [
      ['observe', {}], ['navigate', { path: this.loginPath }],
      ['fill_credential', { ref: refs.get('Email'), credential_ref: ref, field: 'username' }],
      ['fill_credential', { ref: refs.get('Password'), credential_ref: ref, field: 'password' }],
      ['click', { ref: refs.get('Sign in') }],
      ['navigate', { path: this.succeeds ? '/my-room' : '/signed-out' }],
      ...(this.succeeds ? [
        ['click', { ref: refs.get('Open shelf') }],
        ['report_candidate', { title: 'Delayed login personal room control', rule_id: 'B5', impact: 'low', observed: 'Check the authenticated room in a fresh session.', scenario: { kind: 'mobile_reachability', device: 'mobile', path: '/my-room', control: 'Open shelf', expectation: 'reachable' } }],
      ] as [string, unknown][] : []),
      ['finish_run', { summary: 'Completed delayed login regression.' }],
    ];
    const [name, args] = calls[this.turn++] ?? ['finish_run', { summary: 'Done' }];
    return { message: { role: 'assistant', content: null, tool_calls: [{ id: `spa_${this.turn}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, finishReason: 'tool_calls', requestId: null, model: this.model };
  }
}

describe('supplied account through the worker', () => {
  it('records the local return query needed to reproduce the observed login landing page', async () => {
    const db = getPool(); await migrate(db);
    const ref = await storeCredential(db, { label: 'Return-route supplied account', username: USERNAME, secret: SECRET });
    const contract = demoTargetContract(origin);
    contract.accounts = [{ ref, role: 'user', label: 'Return-route supplied account' }];
    contract.capabilities.register = false; contract.registration.allowed = false;
    const admitted = await admitRun(db, { principal: `test:return-query:${Date.now()}`, ownerId: null, projectId: null, mode: 'verified_site', contract, spendAccount: 'development' });
    if (!admitted.ok) throw new Error(admitted.reason);
    const status = await executeRun({ db, runtime: new LocalBrowserRuntime(), providers: [new SpaPlanner(true, '/login?next=%2Fmy-room')], workerId: 'return-query-test',
      allowOfflineTestDouble: true, agentMode: 'batch', lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } }, admitted.runId);
    expect(status).toBe('completed');
    const scenarios = (await db.query('SELECT assertion, assertion_hash FROM scenarios WHERE run_id=$1', [admitted.runId])).rows;
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].assertion.auth.path).toBe('/login?next=%2Fmy-room');
    expect(scenarioHash(scenarios[0].assertion)).toBe(scenarios[0].assertion_hash);
    const executions = (await db.query('SELECT outcome FROM scenario_executions WHERE run_id=$1', [admitted.runId])).rows;
    expect(executions.map(e => e.outcome)).toEqual(['passed', 'passed']);
  });
  it.each(['spa', 'failure', 'signed_out'] as const)('%s: retains the submit across /login then /my-room, but refuses signed-out outcomes', async (mode) => {
    loginMode = mode;
    const db = getPool();
    await migrate(db);
    const ref = await storeCredential(db, { label: 'Delayed supplied account', username: USERNAME, secret: SECRET });
    const contract = demoTargetContract(origin);
    contract.accounts = [{ ref, role: 'user', label: 'Delayed supplied account' }];
    contract.capabilities.register = false; contract.registration.allowed = false;
    const admitted = await admitRun(db, { principal: `test:spa-account:${Date.now()}`, ownerId: null, projectId: null, mode: 'verified_site', contract, spendAccount: 'development' });
    if (!admitted.ok) throw new Error(admitted.reason);
    const provider = new SpaPlanner(mode === 'spa');
    const beforeLogins = logins;
    const status = await executeRun({ db, runtime: new LocalBrowserRuntime(), providers: [provider], workerId: 'spa-account-test',
      allowOfflineTestDouble: true, agentMode: 'batch', lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } }, admitted.runId);
    expect(status).toBe('completed');
    const actions = (await db.query('SELECT seq,tool,url_after FROM actions WHERE run_id=$1 ORDER BY seq', [admitted.runId])).rows;
    expect(actions.find(a => a.seq === 4)).toMatchObject({ tool: 'click', url_after: `${origin}/login` });
    expect(actions.find(a => a.seq === 5)).toMatchObject({ tool: 'navigate', url_after: `${origin}/${mode === 'spa' ? 'my-room' : 'signed-out'}` });
    const recipes = (await db.query("SELECT payload FROM run_events WHERE run_id=$1 AND type='recipe.recorded'", [admitted.runId])).rows;
    const workflows = (await db.query("SELECT name,status FROM workflows WHERE run_id=$1 AND name='Sign in'", [admitted.runId])).rows;
    if (mode === 'spa') {
      expect(recipes).toHaveLength(1);
      expect(workflows).toEqual([{ name: 'Sign in', status: 'completed' }]);
      const scenarios = (await db.query('SELECT assertion FROM scenarios WHERE run_id=$1', [admitted.runId])).rows;
      expect(scenarios[0].assertion.auth).toMatchObject({ kind: 'login', credentialRef: ref, path: '/login', submit: 'Sign in', successText: 'My room' });
      const executions = (await db.query('SELECT outcome FROM scenario_executions WHERE run_id=$1', [admitted.runId])).rows;
      expect(executions.map(e => e.outcome)).toEqual(['passed', 'passed']);
      expect(logins - beforeLogins).toBeGreaterThanOrEqual(2);
    } else {
      expect(recipes).toEqual([]);
      expect(workflows).toEqual([]);
      expect(logins).toBe(beforeLogins);
    }
    expect(provider.seen.join('\n')).not.toContain(SECRET);
  });
  it.each(['steps', 'batch'] as const)('%s: uses the reference, records login, verifies in fresh sessions, and denies actor B borrowing', async (mode) => {
    const db = getPool();
    await migrate(db);
    const ref = await storeCredential(db, { label: 'Supplied synthetic account', username: USERNAME, secret: SECRET });
    const contract = demoTargetContract(origin);
    contract.accounts = [{ ref, role: 'user', label: 'Supplied synthetic account' }];
    contract.capabilities.register = false;
    contract.registration.allowed = false;
    const admitted = await admitRun(db, { principal: `test:supplied-account:${Date.now()}`, ownerId: null, projectId: null, mode: 'verified_site', contract, spendAccount: 'development' });
    if (!admitted.ok) throw new Error(admitted.reason);
    const provider = new AccountPlanner(mode);
    const status = await executeRun({ db, runtime: new LocalBrowserRuntime(), providers: [provider], workerId: 'supplied-account-test',
      allowOfflineTestDouble: true, agentMode: mode, lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) } }, admitted.runId);
    expect(status).toBe('completed');
    const scenarios = (await db.query('SELECT assertion FROM scenarios WHERE run_id = $1', [admitted.runId])).rows;
    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios[0].assertion.auth).toMatchObject({ kind: 'login', credentialRef: ref });
    const executions = (await db.query('SELECT outcome FROM scenario_executions WHERE run_id = $1', [admitted.runId])).rows;
    expect(executions.map((row) => row.outcome)).toEqual(['passed', 'passed']);
    const events = (await db.query('SELECT type, payload FROM run_events WHERE run_id = $1', [admitted.runId])).rows;
    const actions = (await db.query('SELECT tool, args FROM actions WHERE run_id = $1', [admitted.runId])).rows;
    expect(provider.seen.join('\n')).toContain('Supplied test accounts may only be used by actor A');
    expect(provider.seen.join('\n')).toContain('Password credentials can only be filled into a password field');
    expect(provider.seen.join('\n')).toContain('Screenshots are withheld');
    expect(provider.seen.join('\n')).toContain('[redacted]');
    expect(provider.seen.join('\n')).not.toContain('data:image/');
    expect(JSON.stringify([provider.seen, scenarios, events, actions])).not.toContain(SECRET);
    expect(events.filter((e) => e.type === 'dialog.dismissed').map((e) => e.payload.dialogs).flat()).toContain('alert: [redacted]');
    expect(events.find((e) => e.type === 'browser.ready')?.payload.sandbox).toBe('sandbox_on');
    expect(events.some((e) => e.type === 'browser.terminated')).toBe(true);
  });
});
