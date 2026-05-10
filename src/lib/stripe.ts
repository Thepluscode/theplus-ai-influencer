import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';

let cached: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!serverEnv.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY missing. Add it to .env.local before calling Stripe.');
  }
  if (!cached) {
    // Use the account's default API version. Pin one explicitly only
    // when you need to insulate against breaking changes in production.
    cached = new Stripe(serverEnv.STRIPE_SECRET_KEY, { typescript: true });
  }
  return cached;
}
