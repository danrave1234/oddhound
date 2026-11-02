// Parameter/authority checks only. No Modal API, image build, real site or provider call.
import { describe, expect, it } from 'vitest';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { gatewayEvaluationPolicy } from '../../packages/core/browser/gateway-evaluation.ts';
import { ModalSandboxRuntime, publicIpv4Cidrs, type ModalRuntimeOptions } from '../../packages/core/browser/modal-runtime.ts';
import { modalOptionsFromEnv } from '../../packages/core/browser/select.ts';

const verified = () => {
  const c = demoTargetContract('https://fixture.test');
  c.target.verification = { kind: 'owner_verified', method: 'dns_txt', revision: 7, checkedAt: new Date().toISOString() };
  c.target.apiOrigins = [{ origin: 'https://api.test', verificationRevision: 4 }];
  c.accounts = [{ ref: 'cred_private_test_reference', role: 'user', label: 'PRIVATE ACCOUNT LABEL' }];
  c.description = 'PRIVATE OWNER CONTEXT';
  c.goals = ['PRIVATE OWNER GOAL'];
  return c;
};
const policy = () => gatewayEvaluationPolicy('run-one', verified(), Date.now() + 60_000);
const runtime = (options: Partial<ModalRuntimeOptions> = {}) => new ModalSandboxRuntime({
  appName: 'evaluation-only', imageId: 'im-evaluation', sandboxRuntime: 'vm', connect: 'token',
  outboundCidrAllowlist: publicIpv4Cidrs(), client: {} as never, evaluationPolicy: policy(), ...options,
});

describe('gateway evaluation policy', () => {
  it('passes only frozen origins, authority and limits, excluding account/prompt data', () => {
    const c = verified();
    const p = gatewayEvaluationPolicy('run-one', c, Date.now() + 60_000);
    expect(p).toMatchObject({ primaryOrigin: 'https://fixture.test', apiOrigins: ['https://api.test'], writes: true });
    expect(JSON.stringify(p)).not.toMatch(/cred_private|PRIVATE|accounts|description|goals|password|secret/i);
    c.deniedPathPrefixes.push('/later');
    expect(p.deniedPathPrefixes).not.toContain('/later');
  });
  it('refuses unverified/demo and external owner-handoff contracts', () => {
    expect(() => gatewayEvaluationPolicy('run-one', demoTargetContract('https://fixture.test'), Date.now() + 60_000)).toThrow(/verified-site/);
    const c = verified(); c.handoff.enabled = true;
    expect(() => gatewayEvaluationPolicy('run-one', c, Date.now() + 60_000)).toThrow(/handoff/);
  });
  it('preserves observation-only and production acknowledgement restrictions', () => {
    const c = verified(); c.testMode = 'observation_only';
    expect(gatewayEvaluationPolicy('run-one', c, Date.now() + 60_000).writes).toBe(false);
    c.testMode = 'active'; c.target.environment = 'production'; c.productionWritesAcknowledged = false;
    expect(gatewayEvaluationPolicy('run-one', c, Date.now() + 60_000).writes).toBe(false);
  });
  it('rejects invalid/expired or excessively long expiry', () => {
    for (const expires of [NaN, Date.now() - 1, Date.now() + 24 * 3600_000]) expect(() => gatewayEvaluationPolicy('run-one', verified(), expires)).toThrow(/expiry/i);
  });
  it('cannot extend the owner contract expiry', () => {
    const c = verified(); c.expiresAt = new Date(Date.now() + 30_000).toISOString();
    expect(() => gatewayEvaluationPolicy('run-one', c, Date.now() + 60_000)).toThrow(/expiry/i);
  });
});

describe('Modal opt-in gateway parameter gate', () => {
  it('binds the policy to the exact active run and rejects expired policy', () => {
    expect(() => runtime().createParams('other-run', '/pw-test')).toThrow(/active run/);
    expect(() => runtime({ evaluationPolicy: { ...policy(), expiresAt: Date.now() - 1 } }).createParams('run-one', '/pw-test')).toThrow(/active run/);
  });
  it('requires VM isolation, authenticated token control and a public-only outbound list', () => {
    for (const opts of [{ sandboxRuntime: 'gvisor' as const }, { connect: 'tunnel' as const }, { outboundCidrAllowlist: [] }, { outboundCidrAllowlist: ['0.0.0.0/0'] }, { outboundCidrAllowlist: ['10.0.0.0/8'] }]) {
      expect(() => runtime(opts).createParams('run-one', '/pw-test')).toThrow(/public outbound|vm, token/);
    }
  });
  it('sends exactly the control path and public policy, with no credentials or mounts', () => {
    const p = runtime().createParams('run-one', '/pw-test');
    expect(Object.keys(p.env ?? {}).sort()).toEqual(['ODDHOUND_EVALUATION_POLICY', 'RUN_WS_PATH']);
    expect(p.secrets).toBeUndefined(); expect(p.volumes).toBeUndefined();
    expect(p.encryptedPorts).toBeUndefined(); expect(p.unencryptedPorts).toBeUndefined();
    expect(JSON.stringify(p)).not.toMatch(/DATABASE_URL|META_API_KEY|MODAL_TOKEN|PRIVATE|cred_private/);
  });
  it('leaves default runtime behavior unchanged and cannot be enabled by environment alone', () => {
    const p = runtime({ evaluationPolicy: undefined }).createParams('run-one', '/pw-test');
    expect(p.env).toEqual({ RUN_WS_PATH: '/pw-test' });
    expect(modalOptionsFromEnv({ ODDHOUND_EVALUATION_POLICY: JSON.stringify(policy()), MODAL_BROWSER_IMAGE_ID: 'im-old' }).evaluationPolicy).toBeUndefined();
  });
});
