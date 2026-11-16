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

/**
 * Set a workspace's balance to an exact value and record the movement in
 * credit_transactions atomically (RPC, migration 0024).
 *
 * Subscription events must be absolute writes — grant_credits is additive, so
 * a redelivered event would grant the monthly allowance twice. But writing
 * `credits` directly left no ledger entry at all, so a plan upgrade moved a
 * balance with nothing to explain it. The RPC keeps the absolute write and
 * derives the delta, recording nothing when a replay moves nothing.
 */
async function applyPlanCredits(
  admin: AdminClient,
  input: {
    workspaceId: string;
    credits: number;
    reason: 'plan_upgrade' | 'monthly_grant' | 'admin_adjustment';
    plan?: PlanId | null;
    refKind?: string;
    refId?: string;
  },
): Promise<void> {
  const { error } = await (
    admin.rpc as unknown as (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>
  )('apply_plan_credits', {
    p_workspace_id: input.workspaceId,
    p_credits: input.credits,
    p_reason: input.reason,
    p_plan: input.plan ?? null,
    p_ref_kind: input.refKind ?? null,
    p_ref_id: input.refId ?? null,
  });
  // Never ack success on a failed credit write — throwing releases the
  // idempotency claim so Stripe retries.
  if (error) {
    throw new Error(
      `apply_plan_credits failed for workspace ${input.workspaceId}: ${error.message}`,
    );
  }
}

/**
 * Stripe moved `current_period_end` off the subscription and onto its items.
 * Reading only the top level silently produced `undefined` on every event, so
 * plan_renews_at was written as null for every subscriber. Prefer the item,
 * fall back to the legacy top-level field for older API versions.
 */
function subscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number })
    | undefined;
  return (
    item?.current_period_end ??
    (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end ??
    null
  );
}

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

  const renewsAt = subscriptionPeriodEnd(sub);

  // Snap credit balance to the plan's monthly grant on plan changes.
  // Avoids the operator either losing a fresh top-up or accumulating
  // forever-growing balances on downgrades. Adjust later if churn shows
  // we want partial credit rollovers. Absolute write + derived ledger delta,
  // so a redelivered event moves nothing and records nothing.
  await applyPlanCredits(admin, {
    workspaceId,
    credits: plan.monthlyCredits,
    reason: 'plan_upgrade',
    plan: effectivePlan,
    refKind: 'stripe_subscription',
    refId: sub.id,
  });

  // Stripe bookkeeping only — the plan and balance are already consistent
  // above, so these columns can lag a failure without misstating entitlement.
  const update: Database['public']['Tables']['workspaces']['Update'] = {
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
  await applyPlanCredits(admin, {
    workspaceId,
    credits: free.monthlyCredits,
    reason: 'plan_upgrade',
    plan: 'free',
    refKind: 'stripe_subscription',
    refId: sub.id,
  });
  await admin
    .from('workspaces')
    .update({ stripe_subscription_id: null, plan_renews_at: null })
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

  // Refill to the plan's monthly grant — same shape as plan change. p_plan is
  // omitted so a renewal never rewrites the tier, only the balance.
  await applyPlanCredits(admin, {
    workspaceId,
    credits: plan.monthlyCredits,
    reason: 'monthly_grant',
    refKind: 'stripe_invoice',
    refId: invoice.id,
  });
}

// A dispute references a charge, not a customer — resolve it via the charge so
// we can find the workspace. Returns null if it can't be resolved (no charge,
// or the lookup failed); callers still log the dispute, never drop it silently.
async function resolveDisputeCustomer(
  stripe: Stripe,
  dispute: Stripe.Dispute,
): Promise<string | null> {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return null;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return typeof charge.customer === 'string' ? charge.customer : (charge.customer?.id ?? null);
  } catch (err) {
    console.error(`[stripe-webhook] dispute charge lookup failed for ${chargeId}`, err);
    return null;
  }
}

async function handleDisputeCreated(stripe: Stripe, dispute: Stripe.Dispute) {
  // A dispute was opened. Alert so a human submits evidence in Stripe before the
  // deadline; leave access intact — the dispute may be won.
  const customer = await resolveDisputeCustomer(stripe, dispute);
  console.error(
    `[stripe-webhook] DISPUTE OPENED ${dispute.id} (customer=${customer ?? 'UNKNOWN'}, reason=${dispute.reason}) ` +
      '— submit evidence in Stripe before the deadline; access left intact pending the outcome.',
  );
}

async function handleDisputeFundsWithdrawn(
  admin: AdminClient,
  stripe: Stripe,
  dispute: Stripe.Dispute,
) {
  // The funds were clawed back. Revoke access: drop the workspace to Free. This
  // is an absolute-state write and the event-id claim above already dedupes
  // replays, so it's replay-safe. An unresolvable dispute is logged at ERROR
  // (never silently dropped) for manual reconciliation.
  const customer = await resolveDisputeCustomer(stripe, dispute);
  if (!customer) {
    console.error(
      `[stripe-webhook] DISPUTE FUNDS WITHDRAWN ${dispute.id} — could not resolve a customer; reconcile manually.`,
    );
    return;
  }
  const free = getPlan('free');
  // The credit RPC keys on workspace id, so resolve the customer first. A
  // customer with no workspace is logged rather than silently dropped.
  const { data: rows, error: lookupError } = await admin
    .from('workspaces')
    .select('id')
    .eq('stripe_customer_id', customer);
  if (lookupError) {
    throw new Error(
      `dispute revoke lookup failed for customer ${customer}: ${lookupError.message}`,
    );
  }
  if (!rows?.length) {
    console.error(
      `[stripe-webhook] DISPUTE FUNDS WITHDRAWN ${dispute.id} — no workspace for customer ${customer}; reconcile manually.`,
    );
    return;
  }
  for (const row of rows) {
    await applyPlanCredits(admin, {
      workspaceId: row.id,
      credits: free.monthlyCredits,
      reason: 'admin_adjustment',
      plan: 'free',
      refKind: 'stripe_dispute',
      refId: dispute.id,
    });
  }
  const { error } = await admin
    .from('workspaces')
    .update({ stripe_subscription_id: null, plan_renews_at: null })
    .eq('stripe_customer_id', customer);
  if (error) {
    throw new Error(`dispute revoke failed for customer ${customer}: ${error.message}`);
  }
  console.error(
    `[stripe-webhook] DISPUTE FUNDS WITHDRAWN ${dispute.id}: revoked access for customer ${customer} (plan → free). ` +
      'Submit evidence in Stripe before the deadline.',
  );
}
