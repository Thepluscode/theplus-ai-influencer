import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// vi.mock factories are hoisted above const declarations, so the shared env
// object has to be hoisted with them.
const h = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
const env = h.env;
vi.mock('@/lib/env', () => ({ serverEnv: h.env }));

const s = vi.hoisted(() => ({ ctor: vi.fn() }));
const stripeCtor = s.ctor;
vi.mock('stripe', () => ({
  default: class {
    constructor(key: string, opts: Record<string, unknown>) {
      s.ctor(key, opts);
    }
  },
}));

// ---------------------------------------------------------------------------
// The Stripe client factory. Small, but it is the thing that must fail loudly
// rather than silently no-op a paid action, and the API version pin is the
// only thing standing between a Stripe platform upgrade and a broken webhook.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules(); // the client is module-level cached
  stripeCtor.mockClear();
  for (const k of Object.keys(env)) delete env[k];
});
afterEach(() => vi.restoreAllMocks());

describe('getStripeClient', () => {
  it('throws when the secret key is missing rather than returning a dud client', async () => {
    const { getStripeClient } = await import('@/lib/billing/stripe');
    expect(() => getStripeClient()).toThrow(/STRIPE_SECRET_KEY missing/);
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it('pins an explicit API version', async () => {
    // Unpinned, Stripe upgrades the platform default underneath us and the
    // webhook starts receiving a shape the handler was not written against —
    // which is exactly how current_period_end moved and broke plan_renews_at.
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    const { getStripeClient } = await import('@/lib/billing/stripe');
    getStripeClient();
    expect(stripeCtor).toHaveBeenCalledTimes(1);
    expect(stripeCtor.mock.calls[0][0]).toBe('sk_test_x');
    expect(stripeCtor.mock.calls[0][1]).toMatchObject({ apiVersion: expect.any(String) });
    expect(stripeCtor.mock.calls[0][1].apiVersion).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('constructs the client once and reuses it', async () => {
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    const { getStripeClient } = await import('@/lib/billing/stripe');
    const a = getStripeClient();
    const b = getStripeClient();
    expect(a).toBe(b);
    expect(stripeCtor).toHaveBeenCalledTimes(1);
  });
});

describe('isStripeConfigured', () => {
  it('is false without a key and true with one', async () => {
    const mod = await import('@/lib/billing/stripe');
    expect(mod.isStripeConfigured()).toBe(false);
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    expect(mod.isStripeConfigured()).toBe(true);
  });

  it('does not construct a client just to answer the question', async () => {
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    const { isStripeConfigured } = await import('@/lib/billing/stripe');
    isStripeConfigured();
    expect(stripeCtor).not.toHaveBeenCalled();
  });
});
