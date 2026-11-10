import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// serverEnv is read at call time by the mapping functions, so a mutable object
// lets each test describe a different deployment configuration.
// vi.mock factories are hoisted above const declarations, so the shared env
// object has to be hoisted with them.
const h = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
const env = h.env;
vi.mock('@/lib/env', () => ({ serverEnv: h.env }));

import {
  PLANS,
  getPlan,
  planIdForStripePrice,
  stripePriceForPlan,
  CREDIT_TOPUP,
  type PlanId,
} from '@/lib/billing/plans';

// ---------------------------------------------------------------------------
// The price -> plan mapping decides what a customer receives for their money.
// Get it wrong and someone pays $29 and is granted the Agency allowance, or
// pays $199 and is dropped to Free. It had no tests.
// ---------------------------------------------------------------------------

const CONFIGURED = {
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_STUDIO: 'price_studio',
  STRIPE_PRICE_AGENCY: 'price_agency',
  STRIPE_PRICE_TOPUP: 'price_topup',
};

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, CONFIGURED);
});
afterEach(() => vi.restoreAllMocks());

describe('plan catalog integrity', () => {
  it('has unique ids', () => {
    const ids = PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never grants a cheaper tier more credits than a dearer one', () => {
    // A regression here silently makes an upgrade a downgrade.
    const paid = PLANS.filter((p) => p.monthlyPriceUsd > 0).sort(
      (a, b) => a.monthlyPriceUsd - b.monthlyPriceUsd,
    );
    for (let i = 1; i < paid.length; i++) {
      expect(paid[i].monthlyCredits).toBeGreaterThan(paid[i - 1].monthlyCredits);
    }
  });

  it('keeps Free free, and every paid tier priced', () => {
    expect(getPlan('free').monthlyPriceUsd).toBe(0);
    for (const p of PLANS.filter((x) => x.id !== 'free')) {
      expect(p.monthlyPriceUsd).toBeGreaterThan(0);
    }
  });

  it('throws on an unknown plan id rather than returning a default tier', () => {
    expect(() => getPlan('enterprise' as PlanId)).toThrow(/Unknown plan id/);
  });
});

describe('planIdForStripePrice — Stripe price to entitlement', () => {
  it('maps each configured price to its own plan', () => {
    expect(planIdForStripePrice('price_pro')).toBe('pro');
    expect(planIdForStripePrice('price_studio')).toBe('studio');
    expect(planIdForStripePrice('price_agency')).toBe('agency');
  });

  it('returns null for a price it does not recognise', () => {
    // The webhook logs and ignores a null, which is the safe outcome: an
    // unknown price must never be resolved to a tier by falling through.
    expect(planIdForStripePrice('price_from_another_account')).toBeNull();
  });

  it('does not resolve a plan when that plan-s price is unconfigured', () => {
    // Deployments that have not set every price id must not silently grant a
    // tier — an unset var and an unmatched price are different things.
    delete env.STRIPE_PRICE_AGENCY;
    expect(planIdForStripePrice('price_agency')).toBeNull();
    expect(planIdForStripePrice('price_pro')).toBe('pro');
  });

  it('never grants a tier for an empty or undefined price id', () => {
    // Regression: without the `if (!priceId) return null` guard, an unset
    // STRIPE_PRICE_X made `priceId === serverEnv.STRIPE_PRICE_X` an
    // undefined === undefined match, so an undefined argument resolved to a
    // real plan — a free entitlement. The call sites happened to guard, but
    // that made every future caller responsible for remembering.
    delete env.STRIPE_PRICE_PRO;
    expect(planIdForStripePrice(undefined as unknown as string)).toBeNull();
    expect(planIdForStripePrice('')).toBeNull();
  });
});

describe('stripePriceForPlan — checkout direction', () => {
  it('round-trips every paid plan through the mapping', () => {
    for (const id of ['pro', 'studio', 'agency'] as PlanId[]) {
      const price = stripePriceForPlan(id);
      expect(price).toBeTruthy();
      expect(planIdForStripePrice(price as string)).toBe(id);
    }
  });

  it('returns null for Free — there is nothing to charge for', () => {
    expect(stripePriceForPlan('free')).toBeNull();
  });

  it('returns null rather than undefined when a price is unconfigured', () => {
    // settings/actions.ts:73 checks the result before opening checkout; a
    // stray undefined would read as "configured" to a loose truthiness check.
    delete env.STRIPE_PRICE_STUDIO;
    expect(stripePriceForPlan('studio')).toBeNull();
  });
});

describe('CREDIT_TOPUP', () => {
  it('reads its price id at call time, not at module load', () => {
    // priceId is a function precisely so env changes are picked up; if it were
    // a captured constant, a deploy that set the var later would still fail.
    expect(CREDIT_TOPUP.priceId()).toBe('price_topup');
    delete env.STRIPE_PRICE_TOPUP;
    expect(CREDIT_TOPUP.priceId()).toBeNull();
  });

  it('grants a positive number of credits for a positive price', () => {
    expect(CREDIT_TOPUP.credits).toBeGreaterThan(0);
    expect(CREDIT_TOPUP.priceUsd).toBeGreaterThan(0);
  });
});
