import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

describe('updateSession auth boundary', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib/env');
    setNodeEnv(originalNodeEnv);
  });

  it('redirects protected routes in production when Supabase auth is not configured', async () => {
    setNodeEnv('production');
    vi.doMock('@/lib/env', () => ({
      publicEnv: {
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      },
    }));

    const { updateSession } = await import('../middleware');
    const res = await updateSession(new NextRequest('https://app.test/dashboard'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://app.test/sign-in?returnTo=%2Fdashboard');
  });

  it('keeps local scaffold routes inspectable when Supabase auth is not configured', async () => {
    setNodeEnv('development');
    vi.doMock('@/lib/env', () => ({
      publicEnv: {
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      },
    }));

    const { updateSession } = await import('../middleware');
    const res = await updateSession(new NextRequest('https://app.test/dashboard'));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
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
