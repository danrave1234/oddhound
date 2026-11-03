// Ledgers under concurrency, against a real PostgreSQL (the oddhound_test database).
// SELF-06/07/15/18/19/23.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { admitRun, assertLease, claimRun, FencedError, requestStop, reapStaleRuns, appendEvent, eventsAfter } from '../../packages/core/ledger/runs.ts';
import { reserveSpend, settleSpend, markSpendUnknown, runSpend, setKillSwitch, spendAllowance } from '../../packages/core/ledger/spend.ts';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { USD, LIMITS } from '../../packages/core/contracts/limits.ts';

const db = getPool();
let n = 0;
const contract = (origin = `https://site${++n}.example`) => demoTargetContract(origin);

async function newRun(opts: Partial<Parameters<typeof admitRun>[1]> = {}) {
  const r = await admitRun(db, { principal: `test:${++n}`, ownerId: null, projectId: null, mode: 'verified_site', contract: contract(), spendAccount: 'development', ...opts });
  if (!r.ok) throw new Error(r.reason);
  return r.runId;
}

beforeAll(async () => { await migrate(db); });
beforeEach(async () => {
  await db.query('TRUNCATE runs, spend_reservations, audit_log, "user" CASCADE');
  await db.query(`UPDATE settings SET value = 'false'::jsonb WHERE key = 'kill_switch'`);
});
afterAll(async () => { await closePool(); });

describe('spend ledger (SELF-19)', () => {
  it('concurrent reservations never exceed the approved $10 per-run cap', async () => {
    const runId = await newRun();
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) =>
      reserveSpend(db, { runId, account: 'development', requestKey: `${runId}:${i}`, micros: 0.3 * USD, provider: 'meta-direct', model: 'muse-spark-1.3' })));
    expect(results.filter((r) => r.ok).length).toBe(33); // $9.90; another reservation would exceed $10.
    const s = await runSpend(db, runId);
    expect(s.settled + s.outstanding).toBeLessThanOrEqual(10 * USD);
  });
  it('the public daily ceiling holds across many runs racing at once (SELF-18)', async () => {
    const runs = await Promise.all(Array.from({ length: 6 }, () => newRun({ spendAccount: 'public' })));
    const results = await Promise.all(runs.flatMap((runId) => Array.from({ length: 4 }, (_, i) =>
      reserveSpend(db, { runId, account: 'public', requestKey: `${runId}:${i}`, micros: 2 * USD, provider: 'meta-direct', model: 'muse-spark-1.3' }))));
    const total = results.filter((r) => r.ok).length * 2 * USD;
    expect(total).toBeLessThanOrEqual(LIMITS.publicDailyMicros);
    expect(results.some((r) => !r.ok && r.reason === 'daily_cap')).toBe(true);
  });
  it('unknown usage stays reserved; the same request key cannot reserve twice', async () => {
    const runId = await newRun();
    const a = await reserveSpend(db, { runId, account: 'development', requestKey: 'k1', micros: 9.5 * USD, provider: 'p', model: 'm' });
    const again = await reserveSpend(db, { runId, account: 'development', requestKey: 'k1', micros: 9.5 * USD, provider: 'p', model: 'm' });
    expect(a.ok && again.ok && a.reservationId === again.reservationId).toBe(true);
    await markSpendUnknown(db, 'k1');
    const b = await reserveSpend(db, { runId, account: 'development', requestKey: 'k2', micros: 0.6 * USD, provider: 'p', model: 'm' });
    expect(b).toEqual({ ok: false, reason: 'run_cap' }); // the unknown $9.50 still counts
    await settleSpend(db, 'k1', 0.2 * USD, { inputTokens: 1 });
    const c = await reserveSpend(db, { runId, account: 'development', requestKey: 'k3', micros: 0.6 * USD, provider: 'p', model: 'm' });
    expect(c.ok).toBe(true);
  });
  it('keeps a historical allowance and cannot charge a different spending account', async () => {
    const runId = await newRun({ spendAccount: 'public' });
    await db.query('UPDATE runs SET model_spend_cap_micros = $2 WHERE id = $1', [runId, 2 * USD]);
    expect(await reserveSpend(db, { runId, account: 'judging', requestKey: 'wrong-account', micros: USD, provider: 'p', model: 'm' }))
      .toEqual({ ok: false, reason: 'invalid_amount' });
    expect(await reserveSpend(db, { runId, account: 'public', requestKey: 'old-cap', micros: 3 * USD, provider: 'p', model: 'm' }))
      .toEqual({ ok: false, reason: 'run_cap' });
    expect(await spendAllowance(db, runId)).toMatchObject({ configuredCapMicros: 2 * USD, availableMicros: 2 * USD, limiting: 'run_cap' });
  });
  it('shows only the shared daily allowance left, including unknown and competing charges', async () => {
    const runId = await newRun({ spendAccount: 'public' });
    expect((await reserveSpend(db, { runId, account: 'public', requestKey: 'public-six', micros: 6 * USD, provider: 'p', model: 'm' })).ok).toBe(true);
    await markSpendUnknown(db, 'public-six');
    // Competing runs use up the shared day (each within its own run cap) until $0.25 is left.
    const competing = (LIMITS.publicDailyMicros - 6 * USD - 0.25 * USD) / 2;
    for (const key of ['other-public-1', 'other-public-2']) {
      const other = await newRun({ spendAccount: 'public' });
      expect((await reserveSpend(db, { runId: other, account: 'public', requestKey: key, micros: competing, provider: 'p', model: 'm' })).ok).toBe(true);
    }
    expect(await spendAllowance(db, runId)).toMatchObject({ configuredCapMicros: 10 * USD, availableMicros: 0.25 * USD, limiting: 'daily_cap' });
    expect(await reserveSpend(db, { runId, account: 'public', requestKey: 'too-much-public', micros: 0.3 * USD, provider: 'p', model: 'm' }))
      .toEqual({ ok: false, reason: 'daily_cap' });
    await setKillSwitch(db, true, 'test');
    expect(await spendAllowance(db, runId)).toMatchObject({ availableMicros: 0, limiting: 'kill_switch' });
  });
  it('keeps the lifetime ceiling when a run could otherwise spend more', async () => {
    const runId = await newRun({ spendAccount: 'public' });
    const previous = (await db.query("SELECT lifetime_limit_micros FROM spend_accounts WHERE id = 'public'")).rows[0].lifetime_limit_micros;
    try {
      await db.query("UPDATE spend_accounts SET lifetime_limit_micros = $1 WHERE id = 'public'", [5 * USD]);
      expect((await reserveSpend(db, { runId, account: 'public', requestKey: 'life-near', micros: 4.5 * USD, provider: 'p', model: 'm' })).ok).toBe(true);
      expect(await spendAllowance(db, runId)).toMatchObject({ availableMicros: 0.5 * USD, limiting: 'lifetime_cap' });
      expect(await reserveSpend(db, { runId, account: 'public', requestKey: 'life-over', micros: USD, provider: 'p', model: 'm' }))
        .toEqual({ ok: false, reason: 'lifetime_cap' });
    } finally { await db.query("UPDATE spend_accounts SET lifetime_limit_micros = $1 WHERE id = 'public'", [previous]); }
  });
  it('refuses a newly queued run when outstanding charges exhaust its daily account', async () => {
    // Several runs, each within its own cap, together leave the day's account with unknown charges only.
    let left = LIMITS.publicDailyMicros;
    for (let i = 0; left > 0; i++) {
      const runId = await newRun({ spendAccount: 'public' });
      const micros = Math.min(left, LIMITS.modelSpendPerRunMicros);
      expect((await reserveSpend(db, { runId, account: 'public', requestKey: `all-daily-${i}`, micros, provider: 'p', model: 'm' })).ok).toBe(true);
      await markSpendUnknown(db, `all-daily-${i}`);
      left -= micros;
    }
    expect(await admitRun(db, { principal: 'test:no-funding', ownerId: null, projectId: null, mode: 'verified_site', contract: contract(), spendAccount: 'public' }))
      .toEqual({ ok: false, reason: 'budget_unavailable' });
  });
  it('the kill switch blocks new model calls and new runs', async () => {
    const runId = await newRun();
    await setKillSwitch(db, true, 'test');
    expect(await reserveSpend(db, { runId, account: 'development', requestKey: 'kx', micros: 1000, provider: 'p', model: 'm' })).toEqual({ ok: false, reason: 'kill_switch' });
    expect(await admitRun(db, { principal: 'test:k', ownerId: null, projectId: null, mode: 'verified_site', contract: contract(), spendAccount: 'public' })).toEqual({ ok: false, reason: 'kill_switch' });
  });
});

describe('admission (SELF-15/18)', () => {
  it('one active run per origin across every project and user', async () => {
    const c = contract('https://busy.example');
    expect((await admitRun(db, { principal: 'a', ownerId: null, projectId: null, mode: 'verified_site', contract: c, spendAccount: 'public' })).ok).toBe(true);
    expect(await admitRun(db, { principal: 'b', ownerId: null, projectId: null, mode: 'verified_site', contract: c, spendAccount: 'public' })).toEqual({ ok: false, reason: 'site_busy' });
  });
  it('one pending run per principal, and no daily run count', async () => {
    await db.query(`INSERT INTO "user" (id, name, email) VALUES ('u1','U','u1@example.test')`);
    const admit = () => admitRun(db, { principal: 'user:u1', ownerId: 'u1', projectId: null, mode: 'verified_site', contract: contract(), spendAccount: 'public' });
    const first = await admit();
    expect(first.ok).toBe(true);
    expect(await admit()).toEqual({ ok: false, reason: 'principal_pending' });
    for (let i = 0; i < 5; i++) { await db.query(`UPDATE runs SET status = 'completed' WHERE principal = 'user:u1'`); expect((await admit()).ok).toBe(true); }
  });
  it('anonymous demo: one per session per hour and one live demo globally, however many sessions race', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      admitRun(db, { principal: `anon:s${i}:1.2.3.4`, ownerId: null, projectId: null, mode: 'demo_target', contract: contract('https://demo.example'), spendAccount: 'public' })));
    expect(results.filter((r) => r.ok).length).toBe(1);
    await db.query(`UPDATE runs SET status = 'completed'`);
    expect(await admitRun(db, { principal: 'anon:s0:1.2.3.4', ownerId: null, projectId: null, mode: 'demo_target', contract: contract('https://demo.example'), spendAccount: 'public' }))
      .toEqual(results[0]!.ok ? { ok: false, reason: 'demo_hourly_limit' } : expect.anything());
  });
});

describe('fences and leases (SELF-06/07/23)', () => {
  it('stop is persisted before acknowledgement and blocks the next action', async () => {
    const runId = await newRun();
    const gen = (await claimRun(db, runId, 'w1'))!;
    await assertLease(db, runId, gen);
    expect(await requestStop(db, runId, 'test')).toBe(true);
    await expect(assertLease(db, runId, gen)).rejects.toBeInstanceOf(FencedError);
  });
  it('a stale or competing worker loses its lease; a queued run cannot be claimed twice', async () => {
    const runId = await newRun();
    const gen = (await claimRun(db, runId, 'w1'))!;
    expect(await claimRun(db, runId, 'w2')).toBeNull();
    await db.query(`UPDATE runs SET heartbeat_at = now() - interval '10 minutes' WHERE id = $1`, [runId]);
    expect(await reapStaleRuns(db)).toContain(runId);
    await expect(assertLease(db, runId, gen)).rejects.toMatchObject({ reason: 'lease_lost' });
    const row = (await db.query('SELECT status, stop_reason FROM runs WHERE id = $1', [runId])).rows[0];
    expect(row).toMatchObject({ status: 'failed', stop_reason: 'worker_lost_or_expired' });
  });
  it('a stopped queued run never starts', async () => {
    const runId = await newRun();
    await requestStop(db, runId, 'test');
    expect(await claimRun(db, runId, 'w1')).toBeNull();
  });
  it('events are durable, ordered and resumable after a sequence number', async () => {
    const runId = await newRun();
    await Promise.all(Array.from({ length: 25 }, (_, i) => appendEvent(db, runId, 'test.event', { i })));
    const all = await eventsAfter(db, runId, 0);
    expect(all.map((e) => e.seq)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect((await eventsAfter(db, runId, 20)).length).toBe(5);
  });
});
