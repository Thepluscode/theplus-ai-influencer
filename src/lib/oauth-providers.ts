import 'server-only';
import { z } from 'zod';
import { publicEnv } from '@/lib/env';

export const OAUTH_PROVIDERS = ['google', 'github'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

// GoTrue's public settings endpoint: { external: { google: true, github: false, ... } }.
const Settings = z.object({ external: z.record(z.string(), z.unknown()) });

/**
 * The OAuth providers switched on in the Supabase project. A button for a
 * provider that is off sends the visitor to a raw `400 provider is not
 * enabled` page, so the auth pages render only these.
 *
 * If the check itself fails (network, unexpected shape) every button is shown:
 * hiding a working sign-in because of a transient error is worse than the old
 * behaviour. The failure is logged.
 */
export async function enabledOAuthProviders(): Promise<OAuthProvider[]> {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return [];
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`settings returned ${res.status}`);
    const { external } = Settings.parse(await res.json());
    return OAUTH_PROVIDERS.filter((p) => external[p] === true);
  } catch (err) {
    console.error(
      '[oauth-providers] could not read Supabase auth settings; showing all buttons',
      err,
    );
    return [...OAUTH_PROVIDERS];
  }
}
