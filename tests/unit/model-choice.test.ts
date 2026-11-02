// The contributor tier (data may be used by Meta) is only for the synthetic demo target.
import { describe, it, expect } from 'vitest';
import { metaModelFor, providersFromEnv } from '../../packages/core/providers/openai-compatible.ts';

describe('Meta model per run kind', () => {
  const env = { META_API_KEY: 'test-key-not-real', META_MODEL: 'muse-spark-1.3', META_MODEL_DEMO: 'muse-spark-1.3-contributor' } as NodeJS.ProcessEnv;
  it('uses the contributor tier only for the demo target', () => {
    expect(metaModelFor('demo', env)).toBe('muse-spark-1.3-contributor');
    expect(metaModelFor('owner', env)).toBe('muse-spark-1.3');
  });
  it('defaults owner runs to the standard model, and demo runs to it when no demo model is set', () => {
    expect(metaModelFor('owner', {} as NodeJS.ProcessEnv)).toBe('muse-spark-1.3');
    expect(metaModelFor('demo', { META_MODEL: 'muse-spark-1.3' } as NodeJS.ProcessEnv)).toBe('muse-spark-1.3');
  });
  it('builds the Meta profile with the model for the run kind', () => {
    expect(providersFromEnv(env, { runKind: 'demo' })[0]!.model).toBe('muse-spark-1.3-contributor');
    expect(providersFromEnv(env)[0]!.model).toBe('muse-spark-1.3');
  });
});
