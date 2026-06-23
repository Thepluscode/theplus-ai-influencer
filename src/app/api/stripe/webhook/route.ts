import { type NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { CREDIT_TOPUP, getPlan, planIdForStripePrice, type PlanId } from '@/lib/billing/plans';
import { getStripeClient } from '@/lib/billing/stripe';
import { publicEnv, serverEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

export const runtime = 'nodejs';
// Stripe needs the raw body for signature verification; we get that via
// `req.text()` below. Disabling automatic body parsing isn't needed in
// the App Router — `request.text()` returns the raw bytes.

/**
 * Stripe webhook endpoint. Configure in Stripe dashboard → Developers →
 * Webhooks pointing at /api/stripe/webhook. Subscribed events:
 *   - checkout.session.completed       (handles topup credit grants)
 *   - customer.subscription.created
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.paid                     (monthly renewal — re-grant credits)
 *
 * Idempotency: Stripe guarantees event ids are stable across retries.
 * We don't yet store processed event ids, but every operation here is
 * write-once-correct (set plan to X, set credits to monthly grant) so a
 * replay is safe.
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
    return NextResponse.json(
      { error: `Webhook verification failed: ${message}` },
      {
        status: 400,
      },
    );
  }

  // The webhook runs without a user session, so we use the service-role
  // key (NOT the anon key) to write directly to workspaces.
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[stripe-webhook] Missing Supabase service-role key — cannot update workspace.');
    return NextResponse.json(
      { error: 'Supabase service role not configured.' },
      {
        status: 503,
      },
    );
  }
  const admin = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  // Idempotency claim. Stripe redelivers events on timeout / non-2xx / manual
  // resend; the topup grant path *increments* credits so a replay would
  // double-grant. We claim the event id up front — a unique-violation means a
  // prior delivery already processed it, so we ack without re-running side
  // effects. On handler failure below we release the claim so a genuine retry
  // can reprocess (same claim/release shape as the job queue).
  const claim = await webhookEventTable(admin).insert({
    provider: 'stripe',
    event_id: event.id,
  });
  if (claim.error) {
    if (claim.error.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[stripe-webhook] idempotency claim failed', claim.error);
    return NextResponse.json({ error: 'idempotency check failed' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(admin, stripe, session);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(admin, sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(admin, sub);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(admin, stripe, invoice);
        break;
      }
      default:
        // Ignore — Stripe will still mark the event as received.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'webhook handler failed';
    console.error(`[stripe-webhook] ${event.type} → ${message}`, err);
    // Release the idempotency claim so Stripe's retry reprocesses this event
    // from scratch — the side effects didn't complete.
    await webhookEventTable(admin)
      .delete()
      .eq('provider', 'stripe')
      .eq('event_id', event.id);
    // Returning 500 makes Stripe retry, which is what we want for
    // transient errors. Persistent errors will show up in the dashboard.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// The `processed_webhook_events` table isn't in the generated Database types
// yet, so reach it through a narrow cast rather than widening the whole client.
function webhookEventTable(admin: AdminClient) {
  return (
    admin as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{
          error: { code?: string; message: string } | null;
        }>;
        delete: () => {
          eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<unknown> };
        };
      };
    }
  ).from('processed_webhook_events');
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createClient<Database>>;

async function handleCheckoutCompleted(
  admin: AdminClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const workspaceId = session.metadata?.workspaceId;
  if (!workspaceId) {
    console.warn('[stripe-webhook] checkout.session.completed without workspaceId metadata');
    return;
  }

  // Capture the customer id on the workspace so we can open Portal later
  // even before the subscription webhook arrives.
  if (typeof session.customer === 'string') {
    await admin
      .from('workspaces')
      .update({ stripe_customer_id: session.customer })
      .eq('id', workspaceId);
  }

  // Topup mode — grant the listed credits and exit. Subscription mode is
  // handled by customer.subscription.created which fires alongside this.
  if (session.metadata?.kind === 'topup') {
    const amount = Number(session.metadata?.credits ?? CREDIT_TOPUP.credits);
    if (Number.isFinite(amount) && amount > 0) {
      const { error } = await (
        admin.rpc as unknown as (
          fn: string,
          params: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>
      )('grant_credits', {
        p_workspace_id: workspaceId,
        p_amount: amount,
        p_reason: 'topup',
      });
      // Don't swallow a failed grant: the customer paid, so surface it as a
      // 500 (releases the idempotency claim → Stripe retries the grant)
      // instead of acking success and silently dropping their credits.
      if (error) {
        throw new Error(`grant_credits failed for workspace ${workspaceId}: ${error.message}`);
      }
    }
  }
}

async function handleSubscriptionChange(admin: AdminClient, sub: Stripe.Subscription) {
  const workspaceId = sub.metadata?.workspaceId;
  if (!workspaceId) {
    console.warn(`[stripe-webhook] subscription ${sub.id} has no workspaceId metadata`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id;
  const planId = priceId ? planIdForStripePrice(priceId) : null;
  if (!planId) {
    console.warn(`[stripe-webhook] unknown price ${priceId} on subscription ${sub.id}`);
    return;
  }

  // Subscription is active when status is 'active' or 'trialing'. Past
  // due / canceled get the workspace back on Free so they don't keep
  // burning down a paid quota they're not paying for.
  const isActive = sub.status === 'active' || sub.status === 'trialing';
  const effectivePlan: PlanId = isActive ? planId : 'free';
  const plan = getPlan(effectivePlan);

  const renewsAt =
    (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end ?? null;

  // Snap credit balance to the plan's monthly grant on plan changes.
  // Avoids the operator either losing a fresh top-up or accumulating
  // forever-growing balances on downgrades. Adjust later if churn shows
  // we want partial credit rollovers.
  const update: Database['public']['Tables']['workspaces']['Update'] = {
    plan: effectivePlan,
    credits: plan.monthlyCredits,
    stripe_subscription_id: sub.id,
    plan_renews_at: renewsAt ? new Date(renewsAt * 1000).toISOString() : null,
  };
  if (typeof sub.customer === 'string') {
    update.stripe_customer_id = sub.customer;
  }

  await admin.from('workspaces').update(update).eq('id', workspaceId);
}

async function handleSubscriptionDeleted(admin: AdminClient, sub: Stripe.Subscription) {
  const workspaceId = sub.metadata?.workspaceId;
  if (!workspaceId) return;
  const free = getPlan('free');
  await admin
    .from('workspaces')
    .update({
      plan: 'free',
      credits: free.monthlyCredits,
      stripe_subscription_id: null,
      plan_renews_at: null,
    })
    .eq('id', workspaceId);
}

async function handleInvoicePaid(admin: AdminClient, stripe: Stripe, invoice: Stripe.Invoice) {
  // First invoice on a new subscription comes through here too — but
  // customer.subscription.created has already set credits to the plan's
  // monthly grant. To avoid double-granting we only re-grant on
  // `subscription_cycle` billing reasons (true monthly renewals).
  const reason = (invoice as Stripe.Invoice & { billing_reason?: string }).billing_reason;
  if (reason !== 'subscription_cycle') return;

  const subscriptionId = (invoice as Stripe.Invoice & { subscription?: string }).subscription;
  if (typeof subscriptionId !== 'string') return;

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const workspaceId = sub.metadata?.workspaceId;
  if (!workspaceId) return;
  const priceId = sub.items.data[0]?.price?.id;
  const planId = priceId ? planIdForStripePrice(priceId) : null;
  if (!planId) return;
  const plan = getPlan(planId);

  // Refill to the plan's monthly grant — same shape as plan change.
  await admin.from('workspaces').update({ credits: plan.monthlyCredits }).eq('id', workspaceId);
}
