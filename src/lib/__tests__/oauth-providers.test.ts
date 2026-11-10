import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co/',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  } as Record<string, string | undefined>,
}));
vi.mock('@/lib/env', () => env);

import { enabledOAuthProviders } from '../oauth-providers';

const respond = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.restoreAllMocks();
  env.publicEnv.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co/';
});

describe('enabledOAuthProviders', () => {
  it('returns only the providers Supabase reports as enabled, asking with the anon key', async () => {
    const fetch = respond({ external: { google: false, github: true, email: true } });
    expect(await enabledOAuthProviders()).toEqual(['github']);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/auth/v1/settings');
    expect((init as RequestInit).headers).toEqual({ apikey: 'anon' });
  });

  it('returns none when both are off (the production state on 2026-11-10)', async () => {
    respond({ external: { google: false, github: false } });
    expect(await enabledOAuthProviders()).toEqual([]);
  });

  it('returns both when both are on', async () => {
    respond({ external: { google: true, github: true } });
    expect(await enabledOAuthProviders()).toEqual(['google', 'github']);
  });

  it('shows every button, and logs, when the check itself fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    respond({ message: 'down' }, 503);
    expect(await enabledOAuthProviders()).toEqual(['google', 'github']);
    respond({ unexpected: 'shape' });
    expect(await enabledOAuthProviders()).toEqual(['google', 'github']);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    expect(await enabledOAuthProviders()).toEqual(['google', 'github']);
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('shows none when Supabase is not configured (local demo)', async () => {
    env.publicEnv.NEXT_PUBLIC_SUPABASE_URL = undefined;
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(await enabledOAuthProviders()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
