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
 * Asks Zernio for the platform's OAuth URL, then redirects the operator
 * straight to it. Zernio handles the platform's callback itself and
 * bounces back to /accounts when the user is done.
 */
export async function startConnectionAction(formData: FormData) {
  const platform = PlatformSchema.parse(formData.get('platform'));
  const profileId = await getDefaultZernioProfileId();
  const zernio = getZernioClient();
  const { authUrl } = await zernio.initiateConnection(platform as ZernioPlatform, {
    profileId,
    redirectUrl: await getReturnUrl(),
  });
  redirect(authUrl);
}
