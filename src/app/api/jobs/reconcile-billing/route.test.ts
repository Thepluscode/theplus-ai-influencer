import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Reconciliation sweep — the lost-webhook self-heal. Proves it replays events we
// never recorded (a lost webhook) through the SAME idempotent applier as the live
// webhook: a fresh event grants once, an already-processed event is a dedup no-op,
// and a failing event doesn't abort the sweep. Mocks at the Stripe SDK + Supabase
// boundary; the admin client is stateful so the claim insert dedupes like the PK.

const h = vi.hoisted(() => ({
  processedIds: new Set<string>(),
  grantCalls: [] as { fn: string; params: Record<string, unknown> }[],
  events: [] as any[],
  rpcError: null as { message: string } | null,
}));

vi.mock('@/lib/env', () => ({
  serverEnv: {
    STRIPE_SECRET_KEY: 'sk_test_x',
    SUPABASE_SERVICE_ROLE_KEY: 'service_x',
    CRON_SECRET: 'cron_secret_1234567890',
  },
  publicEnv: { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' },
}));

vi.mock('@/lib/billing/stripe', () => ({
  getStripeClient: () => ({
    // events.list returns an async-iterable of the configured events.
    events: { list: () => ({ async *[Symbol.asyncIterator]() { for (const e of h.events) yield e; } }) },
    subscriptions: { retrieve: async () => ({ metadata: {}, items: { data: [] } }) },
    charges: { retrieve: async () => ({ customer: 'cus_1' }) },
  }),
}));

vi.mock('@/lib/billing/plans', () => ({
  CREDIT_TOPUP: { credits: 500 },
  getPlan: () => ({ monthlyCredits: 1000 }),
  planIdForStripePrice: () => 'pro',
}));

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
          delete: () => ({ eq: () => ({ eq: (_c: string, id: string) => { h.processedIds.delete(id); return Promise.resolve({ error: null }); } }) }),
        };
      }
      return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    },
    rpc: (fn: string, params: Record<string, unknown>) => {
      h.grantCalls.push({ fn, params });
      return Promise.resolve({ error: h.rpcError });
    },
  }),
}));

import { POST } from './route';

function topupEvent(id: string) {
  return {
    id,
    type: 'checkout.session.completed',
    data: { object: { customer: 'cus_1', metadata: { workspaceId: 'ws_1', kind: 'topup', credits: '500' } } },
  };
}

function req(token?: string): NextRequest {
  return {
    headers: { get: (k: string) => (k === 'authorization' && token ? `Bearer ${token}` : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  h.processedIds.clear();
  h.grantCalls.length = 0;
  h.events = [];
  h.rpcError = null;
});

describe('reconcile-billing sweep', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it('replays an unprocessed event through the idempotent applier (grants once)', async () => {
    h.events = [topupEvent('evt_lost_1')];
    const res = await POST(req('cron_secret_1234567890'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ checked: 1, replayed: 1, duplicates: 0, failed: 0 });
    expect(h.grantCalls).toHaveLength(1); // the lost grant self-healed
  });

  it('is a no-op for an event already processed (dedup on event id)', async () => {
    h.processedIds.add('evt_seen_1'); // webhook already handled it
    h.events = [topupEvent('evt_seen_1')];
    const res = await POST(req('cron_secret_1234567890'));
    const body = await res.json();
    expect(body).toMatchObject({ checked: 1, replayed: 0, duplicates: 1 });
    expect(h.grantCalls).toHaveLength(0); // no double-grant
  });

  it('continues past a failing event without aborting the sweep', async () => {
    h.rpcError = { message: 'db down' }; // grant_credits fails → handler throws
    h.events = [topupEvent('evt_fail_1'), topupEvent('evt_ok_2')];
    h.processedIds.add('evt_ok_2_never'); // ensure evt_ok_2 is fresh
    const res = await POST(req('cron_secret_1234567890'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.checked).toBe(2);
    expect(body.failed).toBe(2); // both fail on the rpc error, but the sweep completes
    // failed events release their claim so a later tick can retry
    expect(h.processedIds.has('evt_fail_1')).toBe(false);
  });

  it('accepts the service-role key as auth too', async () => {
    h.events = [];
    const res = await POST(req('service_x'));
    expect(res.status).toBe(200);
  });
});
