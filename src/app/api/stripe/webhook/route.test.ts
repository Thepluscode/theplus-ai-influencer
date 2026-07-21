import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Stripe webhook idempotency — the PR #5 "topup-replay" verification, as a
// deterministic test. Proves a redelivered checkout.session.completed grants
// credits exactly once: the first delivery claims event.id and grants; the
// replay hits the (provider, event_id) PK conflict and is acked as a duplicate
// without re-running the grant. Mocks at the Stripe SDK + Supabase boundary
// (constructEvent returns the parsed body; the admin client is stateful so the
// claim insert dedupes the way the real PK does).
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  processedIds: new Set<string>(),
  grantCalls: [] as { fn: string; params: Record<string, unknown> }[],
  workspaceUpdates: [] as Record<string, unknown>[],
  // Charge → customer map for dispute resolution (null = unresolvable).
  chargeCustomer: 'cus_1' as string | null,
}));

vi.mock('@/lib/env', () => ({
  serverEnv: {
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    SUPABASE_SERVICE_ROLE_KEY: 'service_x',
  },
  publicEnv: { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' },
}));

vi.mock('@/lib/billing/stripe', () => ({
  // The raw body IS the event JSON — signature verification is out of scope here.
  getStripeClient: () => ({
    webhooks: { constructEvent: (raw: string) => JSON.parse(raw) },
    // Dispute resolution retrieves the charge to find the customer.
    charges: { retrieve: async (id: string) => ({ id, customer: h.chargeCustomer }) },
  }),
}));

vi.mock('@/lib/billing/plans', () => ({
  CREDIT_TOPUP: { credits: 500 },
  getPlan: () => ({ monthlyCredits: 1000 }),
  planIdForStripePrice: () => 'pro',
}));

// Stateful admin client. `processed_webhook_events.insert` mimics the real
// PK: first insert of an event_id succeeds, any repeat returns 23505.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'processed_webhook_events') {
        return {
          insert: (row: { provider: string; event_id: string }) => {
            if (h.processedIds.has(row.event_id)) {
              return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
            }
            h.processedIds.add(row.event_id);
            return Promise.resolve({ error: null });
          },
          delete: () => ({
            eq: () => ({
              eq: (_col: string, eventId: string) => {
                h.processedIds.delete(eventId);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      // workspaces
      return {
        update: (vals: Record<string, unknown>) => ({
          eq: () => {
            h.workspaceUpdates.push(vals);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
    rpc: (fn: string, params: Record<string, unknown>) => {
      h.grantCalls.push({ fn, params });
      return Promise.resolve({ error: null });
    },
  }),
}));

import { POST } from './route';

function topupReq(eventId: string): NextRequest {
  const body = JSON.stringify({
    id: eventId,
    type: 'checkout.session.completed',
    data: {
      object: {
        customer: 'cus_1',
        metadata: { workspaceId: 'ws_1', kind: 'topup', credits: '500' },
      },
    },
  });
  return {
    headers: { get: (k: string) => (k === 'stripe-signature' ? 'sig_x' : null) },
    text: async () => body,
  } as unknown as NextRequest;
}

beforeEach(() => {
  h.processedIds.clear();
  h.grantCalls.length = 0;
  h.workspaceUpdates.length = 0;
});

describe('Stripe webhook — topup replay idempotency', () => {
  it('grants credits once on first delivery', async () => {
    const res = await POST(topupReq('evt_topup_1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(h.grantCalls).toHaveLength(1);
    expect(h.grantCalls[0]).toMatchObject({
      fn: 'grant_credits',
      params: { p_workspace_id: 'ws_1', p_amount: 500, p_reason: 'topup' },
    });
  });

  it('does NOT grant again on a redelivered (same event.id) event', async () => {
    await POST(topupReq('evt_topup_1')); // first delivery
    const replay = await POST(topupReq('evt_topup_1')); // Stripe resend
    const body = await replay.json();

    expect(replay.status).toBe(200);
    expect(body).toEqual({ received: true, duplicate: true });
    // Still exactly one grant across both deliveries — no double-charge.
    expect(h.grantCalls).toHaveLength(1);
  });

  it('keys dedupe on event.id — distinct events each grant once', async () => {
    await POST(topupReq('evt_topup_1'));
    await POST(topupReq('evt_topup_2'));

    expect(h.grantCalls).toHaveLength(2);
  });
});

function disputeReq(eventId: string, type: string, customerResolvable = true): NextRequest {
  h.chargeCustomer = customerResolvable ? 'cus_1' : null;
  const body = JSON.stringify({
    id: eventId,
    type,
    data: { object: { id: `dp_${eventId}`, charge: 'ch_1', reason: 'fraudulent' } },
  });
  return {
    headers: { get: (k: string) => (k === 'stripe-signature' ? 'sig_x' : null) },
    text: async () => body,
  } as unknown as NextRequest;
}

describe('Stripe webhook — dispute capture', () => {
  it('funds_withdrawn revokes access (workspace → free)', async () => {
    const res = await POST(disputeReq('evt_disp_1', 'charge.dispute.funds_withdrawn'));
    expect(res.status).toBe(200);
    expect(h.workspaceUpdates).toHaveLength(1);
    expect(h.workspaceUpdates[0]).toMatchObject({ plan: 'free', stripe_subscription_id: null });
  });

  it('created alerts but does NOT revoke access', async () => {
    const res = await POST(disputeReq('evt_disp_2', 'charge.dispute.created'));
    expect(res.status).toBe(200);
    expect(h.workspaceUpdates).toHaveLength(0);
  });

  it('unmatched dispute (unresolvable customer) is acked but revokes nothing', async () => {
    const res = await POST(disputeReq('evt_disp_3', 'charge.dispute.funds_withdrawn', false));
    expect(res.status).toBe(200);
    expect(h.workspaceUpdates).toHaveLength(0);
  });
});
