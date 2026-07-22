import type Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { CREDIT_TOPUP, getPlan, planIdForStripePrice, type PlanId } from '@/lib/billing/plans';
import type { Database } from '@/lib/supabase/types';

// Shared Stripe-event application logic, used by BOTH the live webhook
// (`/api/stripe/webhook`) and the reconciliation sweep
// (`/api/jobs/reconcile-billing`). The sweep replays recent Stripe events that
// never made it into `processed_webhook_events` (a lost webhook — provider
// outage, a deploy during the callback) through this exact idempotent path, so
// a customer who paid-but-wasn't-granted self-heals without any risk of
// double-applying a grant.

export type AdminClient = ReturnType<typeof createClient<Database>>;

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

/**
 * Claim the event id (idempotency), dispatch by type, and release the claim if
 * the handler throws so a retry — or the next reconcile sweep — can reprocess.
 * Returns `'duplicate'` when the event was already applied; `'processed'` on a
 * fresh apply; throws on a handler failure (after releasing the claim) so the
 * caller can decide (webhook → 500 so Stripe retries; sweep → log + continue).
 */
export async function applyStripeEvent(
  admin: AdminClient,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<'processed' | 'duplicate'> {
  const claim = await webhookEventTable(admin).insert({ provider: 'stripe', event_id: event.id });
  if (claim.error) {
    if (claim.error.code === '23505') return 'duplicate';
    throw new Error(`idempotency claim failed: ${claim.error.message}`);
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(admin, stripe, event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(admin, event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(admin, stripe, event.data.object as Stripe.Invoice);
        break;
      case 'charge.dispute.created':
        await handleDisputeCreated(stripe, event.data.object as Stripe.Dispute);
        break;
      case 'charge.dispute.funds_withdrawn':
        await handleDisputeFundsWithdrawn(admin, stripe, event.data.object as Stripe.Dispute);
        break;
      default:
        break; // ignored — nothing to apply
    }
    return 'processed';
  } catch (err) {
    // Release the claim so a genuine retry / the next sweep reprocesses.
    await webhookEventTable(admin).delete().eq('provider', 'stripe').eq('event_id', event.id);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  admin: AdminClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const workspaceId = session.metadata?.workspaceId;
  if (!workspaceId) {
    console.warn('[stripe] checkout.session.completed without workspaceId metadata');
    return;
  }

  // Capture the customer id on the workspace so we can open Portal later
  // even before the subscription webhook arrives.
  if (typeof session.customer === 'string') {
    await admin.from('workspaces').update({ stripe_customer_id: session.customer }).eq('id', workspaceId);
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
      )('grant_credits', { p_workspace_id: workspaceId, p_amount: amount, p_reason: 'topup' });
      // Don't swallow a failed grant: the customer paid, so surface it (release
      // the claim → retry/sweep re-grants) instead of dropping their credits.
      if (error) {
        throw new Error(`grant_credits failed for workspace ${workspaceId}: ${error.message}`);
      }
    }
  }
}

async function handleSubscriptionChange(admin: AdminClient, sub: Stripe.Subscription) {
  const workspaceId = sub.metadata?.workspaceId;
  if (!workspaceId) {
    console.warn(`[stripe] subscription ${sub.id} has no workspaceId metadata`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id;
  const planId = priceId ? planIdForStripePrice(priceId) : null;
  if (!planId) {
    console.warn(`[stripe] unknown price ${priceId} on subscription ${sub.id}`);
    return;
  }

  // Active when 'active'/'trialing'; past_due/canceled fall back to Free so they
  // don't keep burning a paid quota they're not paying for.
  const isActive = sub.status === 'active' || sub.status === 'trialing';
  const effectivePlan: PlanId = isActive ? planId : 'free';
  const plan = getPlan(effectivePlan);

  const renewsAt =
    (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end ?? null;

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
    .update({ plan: 'free', credits: free.monthlyCredits, stripe_subscription_id: null, plan_renews_at: null })
    .eq('id', workspaceId);
}

async function handleInvoicePaid(admin: AdminClient, stripe: Stripe, invoice: Stripe.Invoice) {
  // First invoice on a new subscription also lands here, but subscription.created
  // already set credits — only re-grant on true monthly renewals to avoid double.
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

  await admin.from('workspaces').update({ credits: plan.monthlyCredits }).eq('id', workspaceId);
}

// A dispute references a charge, not a customer — resolve it via the charge.
// Returns null if unresolvable; callers still log, never drop silently.
async function resolveDisputeCustomer(stripe: Stripe, dispute: Stripe.Dispute): Promise<string | null> {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return null;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return typeof charge.customer === 'string' ? charge.customer : (charge.customer?.id ?? null);
  } catch (err) {
    console.error(`[stripe] dispute charge lookup failed for ${chargeId}`, err);
    return null;
  }
}

async function handleDisputeCreated(stripe: Stripe, dispute: Stripe.Dispute) {
  const customer = await resolveDisputeCustomer(stripe, dispute);
  console.error(
    `[stripe] DISPUTE OPENED ${dispute.id} (customer=${customer ?? 'UNKNOWN'}, reason=${dispute.reason}) ` +
      '— submit evidence in Stripe before the deadline; access left intact pending the outcome.',
  );
}

async function handleDisputeFundsWithdrawn(admin: AdminClient, stripe: Stripe, dispute: Stripe.Dispute) {
  // Funds clawed back → revoke access: drop the workspace to Free. Absolute-state
  // write, and the event-id claim dedupes replays. Unresolvable → ERROR, not dropped.
  const customer = await resolveDisputeCustomer(stripe, dispute);
  if (!customer) {
    console.error(`[stripe] DISPUTE FUNDS WITHDRAWN ${dispute.id} — could not resolve a customer; reconcile manually.`);
    return;
  }
  const free = getPlan('free');
  const { error } = await admin
    .from('workspaces')
    .update({ plan: 'free', credits: free.monthlyCredits, stripe_subscription_id: null, plan_renews_at: null })
    .eq('stripe_customer_id', customer);
  if (error) {
    throw new Error(`dispute revoke failed for customer ${customer}: ${error.message}`);
  }
  console.error(
    `[stripe] DISPUTE FUNDS WITHDRAWN ${dispute.id}: revoked access for customer ${customer} (plan → free). ` +
      'Submit evidence in Stripe before the deadline.',
  );
}
