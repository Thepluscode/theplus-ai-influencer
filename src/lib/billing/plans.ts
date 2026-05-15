/**
 * Plan catalog — single source of truth for what each tier includes and
 * how Stripe maps to our internal `plan` column on `workspaces`. Costs
 * for individual actions live in `src/lib/credits.ts`; this file is
 * about tier-level packaging.
 *
 * Stripe Price IDs live in env so we can swap test/live without code
 * changes. The Free tier has no Price ID — it's the default state.
 */

import { serverEnv } from '@/lib/env';

export type PlanId = 'free' | 'pro' | 'studio' | 'agency';

export interface Plan {
  id: PlanId;
  name: string;
  /** USD per month (display only — Stripe is the source of truth). */
  monthlyPriceUsd: number;
  /** Credits granted on initial subscribe + each monthly renewal. */
  monthlyCredits: number;
  /** Max saved AI influencers (roster cap). Infinity = unlimited. */
  maxInfluencers: number;
  /** One-line headline used on the upgrade card. */
  tagline: string;
  /** Bullet list of what the tier unlocks. */
  features: string[];
  /** Whether this plan can compose multiple references. */
  multiReferenceUnlocked: boolean;
  /** Whether team seats are part of the plan. */
  teamSeats: boolean;
  /** Whether share permalinks include analytics. */
  shareAnalytics: boolean;
}

/**
 * Catalog. Order here is the order rendered in the Settings → Billing
 * upgrade row.
 */
export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPriceUsd: 0,
    monthlyCredits: 360,
    maxInfluencers: 2,
    tagline: 'Get a feel for the product.',
    features: [
      '360 credits / month',
      'Up to 2 saved influencers',
      'AI captions + cross-platform reformat',
      'Public share permalinks',
    ],
    multiReferenceUnlocked: false,
    teamSeats: false,
    shareAnalytics: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPriceUsd: 29,
    monthlyCredits: 2500,
    maxInfluencers: 10,
    tagline: 'Solo operators running a real cadence.',
    features: [
      '2,500 credits / month',
      'Up to 10 saved influencers',
      'Priority Luma queue',
      'Everything in Free',
    ],
    multiReferenceUnlocked: false,
    teamSeats: false,
    shareAnalytics: false,
  },
  {
    id: 'studio',
    name: 'Studio',
    monthlyPriceUsd: 79,
    monthlyCredits: 8000,
    maxInfluencers: Infinity,
    tagline: 'DTC brands placing real products.',
    features: [
      '8,000 credits / month',
      'Unlimited saved influencers',
      'Multi-reference composition unlocked',
      'Share link analytics',
      'Everything in Pro',
    ],
    multiReferenceUnlocked: true,
    teamSeats: false,
    shareAnalytics: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    monthlyPriceUsd: 199,
    monthlyCredits: 25000,
    maxInfluencers: Infinity,
    tagline: 'Teams managing many brands.',
    features: [
      '25,000 credits / month',
      'Team seats',
      'White-label share links',
      'Everything in Studio',
    ],
    multiReferenceUnlocked: true,
    teamSeats: true,
    shareAnalytics: true,
  },
];

export function getPlan(id: PlanId): Plan {
  const p = PLANS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown plan id: ${id}`);
  return p;
}

/**
 * Translate a Stripe Price ID into a plan id. Returns null if the price
 * isn't recognized (shouldn't happen in practice — webhook would log it).
 */
export function planIdForStripePrice(priceId: string): PlanId | null {
  if (priceId === serverEnv.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === serverEnv.STRIPE_PRICE_STUDIO) return 'studio';
  if (priceId === serverEnv.STRIPE_PRICE_AGENCY) return 'agency';
  return null;
}

/** Reverse direction — used at checkout to know which Price to attach. */
export function stripePriceForPlan(id: PlanId): string | null {
  switch (id) {
    case 'pro':
      return serverEnv.STRIPE_PRICE_PRO ?? null;
    case 'studio':
      return serverEnv.STRIPE_PRICE_STUDIO ?? null;
    case 'agency':
      return serverEnv.STRIPE_PRICE_AGENCY ?? null;
    case 'free':
      return null;
  }
}

/** Credit-pack one-off SKU — $10 for 1,000 extra credits. */
export const CREDIT_TOPUP = {
  credits: 1000,
  priceUsd: 10,
  priceId: () => serverEnv.STRIPE_PRICE_TOPUP ?? null,
};
