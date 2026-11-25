import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: {
    CRON_SECRET: 'dedicated-cron-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-must-not-authorize-workers',
  },
}));

describe('isCronAuthorized', () => {
  beforeEach(() => vi.resetModules());

  it('accepts only the dedicated cron secret', async () => {
    const { isCronAuthorized } = await import('@/lib/cron-auth');

    expect(isCronAuthorized('Bearer dedicated-cron-secret')).toBe(true);
    expect(isCronAuthorized('Bearer service-role-must-not-authorize-workers')).toBe(false);
    expect(isCronAuthorized('Bearer wrong')).toBe(false);
    expect(isCronAuthorized('')).toBe(false);
  });
});
