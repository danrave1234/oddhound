// Explicit owner-only evaluation profile. This does not select or enable a deployed runtime.
// The immutable policy contains authority/limits only, never credentials or platform secrets.
import { type RunContract, writesPermitted, keywordsBlockRead } from '../contracts/contract.ts';
import { LIMITS } from '../contracts/limits.ts';

export type GatewayEvaluationPolicy = {
  version: 1;
  runId: string;
  primaryOrigin: string;
  apiOrigins: string[];
  writes: boolean;
  deniedPathPrefixes: string[];
  deniedPathKeywords: string[];
  deniedReadKeywords?: string[];
  reservedHosts?: string[];
  expiresAt: number;
  limits: { requests: number; concurrent: number; resourceBytes: number; totalBytes: number };
};

export function gatewayEvaluationPolicy(runId: string, contract: RunContract, expiresAt: number): GatewayEvaluationPolicy {
  if (contract.target.verification.kind !== 'owner_verified') throw new Error('The evaluation profile requires a verified-site contract');
  if (contract.handoff.enabled) throw new Error('The evaluation profile does not support external owner sign-in handoff');
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + LIMITS.runWallClockMs + 5 * 60_000) throw new Error('Evaluation expiry must be within the run backstop');
  const contractExpiry = Date.parse(contract.expiresAt);
  if (!Number.isFinite(contractExpiry) || expiresAt > contractExpiry) throw new Error('Evaluation expiry cannot extend the approved contract expiry');
  return {
    version: 1, runId,
    primaryOrigin: contract.target.origin,
    apiOrigins: contract.target.apiOrigins.map((api) => api.origin),
    writes: writesPermitted(contract),
    deniedPathPrefixes: [...contract.deniedPathPrefixes],
    deniedPathKeywords: [...contract.deniedPathKeywords],
    deniedReadKeywords: contract.deniedPathKeywords.filter((word) => keywordsBlockRead([word])),
    reservedHosts: ['api.meta.ai', 'api.modal.com', 'danravekeh123--oddhound-web.us-east.modal.run'],
    expiresAt,
    limits: { requests: LIMITS.targetRequestsPerRun, concurrent: LIMITS.targetConcurrentRequests, resourceBytes: LIMITS.targetBytesPerResource, totalBytes: LIMITS.targetBytesPerRun },
  };
}
