import 'server-only';
import { db } from './server';
import { accountExposure, isKillSwitchOn } from '@core/ledger/spend.ts';
import { LIMITS } from '@core/contracts/limits.ts';

export async function publicStatus() {
  const pool = db();
  const [kill, pub, queue, active, replay] = await Promise.all([
    isKillSwitchOn(pool),
    accountExposure(pool, 'public'),
    pool.query(`SELECT count(*)::int AS n FROM runs WHERE status = 'queued'`),
    pool.query(`SELECT count(*)::int AS n FROM runs WHERE status IN ('provisioning','running','waiting_for_input','stopping','finalizing')`),
    pool.query(`SELECT r.id FROM runs r WHERE r.mode = 'demo_target' AND r.status = 'completed'
      AND EXISTS (SELECT 1 FROM findings f WHERE f.run_id = r.id AND f.verification = 'verified' AND f.category = 'verified_issue')
      ORDER BY EXISTS (SELECT 1 FROM runs t WHERE t.parent_run_id = r.id AND t.mode = 'retest' AND t.status = 'completed') DESC,
        (SELECT count(*) FROM findings f WHERE f.run_id = r.id AND f.verification = 'verified') DESC, r.finished_at DESC LIMIT 1`),
  ]);
  const dailyLeft = Math.max(0, LIMITS.publicDailyMicros - pub.today);
  const lifetimeLeft = Math.max(0, LIMITS.publicLifetimeMicros - pub.lifetime);
  return {
    killSwitch: kill,
    publicDailyLeftUsd: dailyLeft / 1e6,
    publicLifetimeLeftUsd: lifetimeLeft / 1e6,
    availableRunUsd: kill ? 0 : Math.min(LIMITS.modelSpendPerRunMicros, dailyLeft, lifetimeLeft) / 1e6,
    // Keep the existing $0.50 admission headroom independent of the maximum run size.
    liveRunsAvailable: !kill && Math.min(dailyLeft, lifetimeLeft) > 500_000,
    queued: queue.rows[0].n as number,
    active: active.rows[0].n as number,
    replayRunId: (replay.rows[0]?.id as string | undefined) ?? null,
    metaConfigured: Boolean(process.env.META_API_KEY),
    demoConfigured: Boolean(process.env.DEMO_TARGET_ORIGIN),
  };
}
