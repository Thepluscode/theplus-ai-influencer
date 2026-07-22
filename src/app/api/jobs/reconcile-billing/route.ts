import { type NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getStripeClient } from '@/lib/billing/stripe';
import { applyStripeEvent } from '@/lib/billing/stripe-events';
import { publicEnv, serverEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Reconciliation sweep — the lost-webhook self-heal.
 *
 * A webhook can be lost (Stripe timeout, provider outage, a deploy during the
 * callback): the customer paid but the credit grant / plan change never ran, and
 * nothing is in `processed_webhook_events` to notice. This job lists recent
 * Stripe events and replays any we never recorded through the SAME idempotent
 * applier the webhook uses — so a missed grant self-heals within a tick, and an
 * event Stripe already delivered is a no-op (its event id is already claimed).
 *
 * Auth (like the other /api/jobs workers):
 *   - `Authorization: Bearer ${CRON_SECRET}` (production cron), or
 *   - `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` (manual curl / scripts).
 *
 * Wire it on the same schedule as the other jobs (every few minutes).
 */

// Billing events worth replaying. Kept in sync with applyStripeEvent's switch.
const RECONCILE_TYPES: Stripe.Event['type'][] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'charge.dispute.created',
  'charge.dispute.funds_withdrawn',
];

// How far back to scan. Env-tunable; default 24h, clamped 1h–7d. Overlapping
// windows are fine — replays dedupe on the event id.
const WINDOW_HOURS = clampInt(process.env.RECONCILE_WINDOW_HOURS, 24, 1, 168);
// Backstop so a large backlog can't blow the function's time budget in one tick.
const MAX_EVENTS = clampInt(process.env.RECONCILE_MAX_EVENTS, 1000, 10, 10000);

export async function POST(req: NextRequest) {
  if (!isAuthorized(req.headers.get('authorization') ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!serverEnv.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 503 });
  }

  const stripe = getStripeClient();
  const admin = createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const since = Math.floor(Date.now() / 1000) - WINDOW_HOURS * 3600;
  let checked = 0;
  let replayed = 0;
  let duplicates = 0;
  let failed = 0;

  try {
    // Auto-paginates across pages; bounded by MAX_EVENTS.
    for await (const event of stripe.events.list({ types: RECONCILE_TYPES, created: { gte: since }, limit: 100 })) {
      if (checked >= MAX_EVENTS) break;
      checked++;
      try {
        const outcome = await applyStripeEvent(admin, stripe, event);
        if (outcome === 'duplicate') duplicates++;
        else replayed++;
      } catch (err) {
        // One bad event must not abort the sweep; the claim was released, so the
        // next tick retries it.
        failed++;
        console.error(`[reconcile-billing] ${event.type} ${event.id} failed:`, toMessage(err));
      }
    }
  } catch (err) {
    return NextResponse.json({ error: 'stripe events.list failed', detail: toMessage(err) }, { status: 502 });
  }

  if (replayed > 0) {
    // A replay means a webhook was genuinely lost — worth an alert, not just a log.
    console.error(`[reconcile-billing] REPLAYED ${replayed} lost webhook event(s) — check the webhook delivery pipeline`);
  }
  return NextResponse.json({ checked, replayed, duplicates, failed, windowHours: WINDOW_HOURS });
}

function isAuthorized(header: string): boolean {
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (serverEnv.CRON_SECRET && token === serverEnv.CRON_SECRET) return true;
  if (serverEnv.SUPABASE_SERVICE_ROLE_KEY && token === serverEnv.SUPABASE_SERVICE_ROLE_KEY) return true;
  return false;
}

function clampInt(raw: string | undefined, def: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || raw === undefined || raw === '') return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
