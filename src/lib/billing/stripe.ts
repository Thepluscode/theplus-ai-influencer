import 'server-only';
import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';

let cached: Stripe | null = null;

/**
 * Single Stripe client per process. Used by server actions + the webhook
 * route. Throws loudly if the key isn't set so we never silently no-op
 * a paid action.
 */
export function getStripeClient(): Stripe {
  if (cached) return cached;
  if (!serverEnv.STRIPE_SECRET_KEY) {
    throw new Error(
      'STRIPE_SECRET_KEY missing — add it to .env.local (Stripe dashboard → Developers → API keys).',
    );
  }
  cached = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
    // Pin an API version so Stripe doesn't break us on a sneaky platform
    // upgrade. Bump deliberately when the SDK's default changes.
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
  });
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(serverEnv.STRIPE_SECRET_KEY);
}
