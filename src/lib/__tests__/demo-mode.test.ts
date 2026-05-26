import { afterEach, describe, expect, it, vi } from 'vitest';

describe('demo mode safety boundary', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib/env');
    setNodeEnv(originalNodeEnv);
  });

  it('enables demo mode outside production when explicitly configured', async () => {
    setNodeEnv('development');
    vi.doMock('@/lib/env', () => ({
      serverEnv: { THEPLUS_DEMO_MODE: true },
    }));

    const { isDemoMode } = await import('@/lib/demo-mode');

    expect(isDemoMode()).toBe(true);
  });

  it('fails closed in production even when the env var is set', async () => {
    setNodeEnv('production');
    vi.doMock('@/lib/env', () => ({
      serverEnv: { THEPLUS_DEMO_MODE: true },
    }));

    const { isDemoMode } = await import('@/lib/demo-mode');

    expect(isDemoMode()).toBe(false);
  });
});

function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}
