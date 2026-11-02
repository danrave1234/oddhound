import 'server-only';
import type { ProofChain } from '@core/reports/proof-chain.ts';

/** Names the demo builds in a proof chain, so a retest reads "corrected demo build" instead of a raw address. */
export function withBuildNames(chain: ProofChain): ProofChain {
  const fixed = process.env.DEMO_TARGET_FIXED_ORIGIN, original = process.env.DEMO_TARGET_ORIGIN;
  const name = (o: string) => (fixed && o === fixed ? 'the corrected demo build' : original && o === original ? 'the original demo build' : o);
  return { ...chain, retestOrigins: Object.fromEntries(Object.entries(chain.retestOrigins).map(([k, v]) => [k, name(v)])) };
}
