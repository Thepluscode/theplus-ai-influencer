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

  it('sends a signed-out visitor on /create to sign-in, and lets a signed-in one through', async () => {
    const getUser = vi.fn();
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));
    vi.doMock('@/lib/env', () => ({
      publicEnv: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      },
    }));
    const { updateSession } = await import('../middleware');

    getUser.mockResolvedValue({ data: { user: null } });
    const out = await updateSession(new NextRequest('https://app.test/create'));
    expect(out.status).toBe(307);
    expect(out.headers.get('location')).toBe('https://app.test/sign-in?returnTo=%2Fcreate');

    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const inside = await updateSession(new NextRequest('https://app.test/create'));
    expect(inside.status).toBe(200);
    expect(inside.headers.get('location')).toBeNull();
  });

  it('does not contact Supabase for public routes', async () => {
    const createServerClient = vi.fn();
    vi.doMock('@supabase/ssr', () => ({ createServerClient }));
    vi.doMock('@/lib/env', () => ({
      publicEnv: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      },
    }));

    const { updateSession } = await import('../middleware');
    const res = await updateSession(new NextRequest('https://app.test/'));

    expect(res.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
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
