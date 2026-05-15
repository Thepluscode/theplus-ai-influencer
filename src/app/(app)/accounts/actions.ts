'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getDefaultZernioProfileId, getZernioClient, type ZernioPlatform } from '@/lib/zernio';

const PlatformSchema = z.enum([
  'twitter',
  'instagram',
  'facebook',
  'youtube',
  'linkedin',
  'threads',
  'tiktok',
  'pinterest',
  'reddit',
] as const);

async function getReturnUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3002';
  return `${proto}://${host}/accounts`;
}

/**
 * Attempts to parse a structured error body out of Zernio's thrown error.
 * Zernio responses look like
 *   {"error":"...","code":"PAYMENT_REQUIRED","reason":"twitter_passthrough",
 *    "dashboard_url":"https://zernio.com/dashboard?tab=billing"}
 * and our client serializes them into the thrown message. Best-effort —
 * fall back to the raw string if parsing fails.
 */
function parseZernioError(rawMessage: string): {
  friendly: string;
  code?: string;
  dashboardUrl?: string;
} {
  const jsonStart = rawMessage.indexOf('{');
  if (jsonStart === -1) {
    return { friendly: rawMessage };
  }
  try {
    const body = JSON.parse(rawMessage.slice(jsonStart));
    return {
      friendly:
        (typeof body.error === 'string' && body.error) ||
        (typeof body.message === 'string' && body.message) ||
        rawMessage,
      code: typeof body.code === 'string' ? body.code : undefined,
      dashboardUrl: typeof body.dashboard_url === 'string' ? body.dashboard_url : undefined,
    };
  } catch {
    return { friendly: rawMessage };
  }
}

/**
 * Asks Zernio for the platform's OAuth URL, then redirects the operator
 * straight to it. Zernio handles the platform's callback itself and
 * bounces back to /accounts when the user is done.
 *
 * On failure (most commonly the X/Twitter PAYMENT_REQUIRED 402), we
 * redirect back to /accounts with the error encoded in the query string
 * instead of letting Next surface a runtime error page.
 */
export async function startConnectionAction(formData: FormData) {
  const platform = PlatformSchema.parse(formData.get('platform'));
  let authUrl: string;
  try {
    const profileId = await getDefaultZernioProfileId();
    const zernio = getZernioClient();
    const result = await zernio.initiateConnection(platform as ZernioPlatform, {
      profileId,
      redirectUrl: await getReturnUrl(),
    });
    authUrl = result.authUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const parsed = parseZernioError(message);
    const params = new URLSearchParams({
      errorPlatform: platform,
      error: parsed.friendly,
    });
    if (parsed.code) params.set('errorCode', parsed.code);
    if (parsed.dashboardUrl) params.set('billingUrl', parsed.dashboardUrl);
    redirect(`/accounts?${params.toString()}`);
  }
  redirect(authUrl);
}
