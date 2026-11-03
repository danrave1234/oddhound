// Model calls outside a run (drafting a test plan) share the run ledger's kill switch and account
// ceilings, have a fixed cap per call, and a daily count per person. Real PostgreSQL (oddhound_test).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { reserveSideSpend, settleSpend, accountExposure, setKillSwitch } from '../../packages/core/ledger/spend.ts';
import { LIMITS } from '../../packages/core/contracts/limits.ts';

const db = getPool();
const req = (n: number, principal = 'user:a', micros = 10_000) =>
  ({ account: 'public' as const, requestKey: `draft:t:${principal}:${n}:${Math.random()}`, micros, provider: 'meta-direct', model: 'muse-spark-1.3', purpose: 'plan_draft' as const, principal });

beforeAll(async () => { await migrate(db); });
beforeEach(async () => {
  await db.query('TRUNCATE runs, spend_reservations, audit_log CASCADE');
  await db.query(`UPDATE settings SET value = 'false'::jsonb WHERE key = 'kill_switch'`);
});
afterAll(async () => { await db.query(`UPDATE settings SET value = 'false'::jsonb WHERE key = 'kill_switch'`); await closePool(); });

describe('spend outside a run', () => {
  it('reserves without a run, settles, and counts toward the public account', async () => {
    const r = req(1);
    expect(await reserveSideSpend(db, r)).toMatchObject({ ok: true });
    await settleSpend(db, r.requestKey, 1_234, null);
    const row = (await db.query(`SELECT run_id, purpose, principal, state, actual_micros FROM spend_reservations WHERE request_key = $1`, [r.requestKey])).rows[0];
    expect(row).toMatchObject({ run_id: null, purpose: 'plan_draft', principal: 'user:a', state: 'settled', actual_micros: '1234' });
    expect((await accountExposure(db, 'public')).today).toBe(1_234);
  });

  it('refuses a call above the per-draft cap and when the kill switch is on', async () => {
    expect(await reserveSideSpend(db, req(1, 'user:a', LIMITS.planDraftMicros + 1))).toEqual({ ok: false, reason: 'call_cap' });
    await setKillSwitch(db, true, 'test');
    expect(await reserveSideSpend(db, req(2))).toEqual({ ok: false, reason: 'kill_switch' });
  });

  it('limits drafts per person per day, concurrently, without touching other people', async () => {
    const results = await Promise.all(Array.from({ length: LIMITS.planDraftsPerPrincipalPerDay + 5 }, (_, i) => reserveSideSpend(db, req(i))));
    expect(results.filter((r) => r.ok)).toHaveLength(LIMITS.planDraftsPerPrincipalPerDay);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === 'principal_daily')).toBe(true);
    expect(await reserveSideSpend(db, req(99, 'user:b'))).toMatchObject({ ok: true });
  });

  it('stops at the public daily ceiling like a run would', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await db.query(`INSERT INTO spend_reservations (request_key, run_id, account, day_bucket, reserved_micros, actual_micros, state, provider, model, purpose, principal)
      VALUES ('filler', NULL, 'public', $1, $2, $2, 'settled', 'x', 'y', 'plan_draft', 'user:filler')`, [day, LIMITS.publicDailyMicros - 5_000]);
    expect(await reserveSideSpend(db, req(1))).toEqual({ ok: false, reason: 'daily_cap' });
  });

  it('still requires a run for ordinary run spend', async () => {
    await expect(db.query(`INSERT INTO spend_reservations (request_key, run_id, account, day_bucket, reserved_micros, state, provider, model)
      VALUES ('orphan', NULL, 'public', current_date, 1, 'reserved', 'x', 'y')`)).rejects.toThrow(/spend_run_required/);
  });
});
