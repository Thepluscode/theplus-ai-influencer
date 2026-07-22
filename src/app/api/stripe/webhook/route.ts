import { type NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getStripeClient } from '@/lib/billing/stripe';
import { applyStripeEvent } from '@/lib/billing/stripe-events';
import { publicEnv, serverEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

export const runtime = 'nodejs';
// Stripe needs the raw body for signature verification; `request.text()` gives
// the raw bytes in the App Router, so no body-parser tweak is needed.

/**
 * Stripe webhook endpoint. Configure in Stripe dashboard → Developers →
 * Webhooks → /api/stripe/webhook. Verifies the signature, then hands the event
 * to the shared idempotent applier (also used by the reconciliation sweep at
 * `/api/jobs/reconcile-billing`, which replays events a lost webhook missed).
 */
export async function POST(req: NextRequest) {
  if (!serverEnv.STRIPE_SECRET_KEY || !serverEnv.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe webhook not configured.' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, serverEnv.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature';
    return NextResponse.json({ error: `Webhook verification failed: ${message}` }, { status: 400 });
  }

  // Webhook runs without a user session — use the service-role key to write.
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[stripe-webhook] Missing Supabase service-role key — cannot update workspace.');
    return NextResponse.json({ error: 'Supabase service role not configured.' }, { status: 503 });
  }
  const admin = createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const outcome = await applyStripeEvent(admin, stripe, event);
    return NextResponse.json(outcome === 'duplicate' ? { received: true, duplicate: true } : { received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'webhook handler failed';
    console.error(`[stripe-webhook] ${event.type} → ${message}`, err);
    // 500 makes Stripe retry; applyStripeEvent already released the claim on a
    // handler failure so the retry reprocesses cleanly.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
