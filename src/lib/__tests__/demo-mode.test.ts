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

  it('provides deterministic secondary-route fixtures', async () => {
    setNodeEnv('development');
    vi.doMock('@/lib/env', () => ({
      serverEnv: { THEPLUS_DEMO_MODE: true },
    }));

    const {
      getDemoComments,
      getDemoContentPlans,
      getDemoDmThreads,
      getDemoInvites,
      getDemoStoryboards,
      getDemoWebhooks,
    } = await import('@/lib/demo-mode');

    expect(getDemoContentPlans()).toHaveLength(1);
    expect(getDemoStoryboards()[0]?.shots).toHaveLength(4);
    expect(getDemoComments().filter((comment) => comment.status === 'pending')).toHaveLength(2);
    expect(getDemoDmThreads().filter((dm) => dm.status === 'pending')).toHaveLength(2);
    expect(getDemoInvites()[0]?.status).toBe('pending');
    expect(getDemoWebhooks()[0]?.events).toContain('post.scheduled');
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
