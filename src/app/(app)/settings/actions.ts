'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CREDIT_TOPUP, stripePriceForPlan, type PlanId } from '@/lib/billing/plans';
import { getStripeClient, isStripeConfigured } from '@/lib/billing/stripe';
import { isDemoMode } from '@/lib/demo-mode';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import {
  BrandDefaultsFormSchema,
  RowIdSchema,
  TeamInviteFormSchema,
  WebhookFormSchema,
} from '@/lib/workspace-controls-schema';

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3002';
  return `${proto}://${host}`;
}

async function requireWorkspace() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Sign in to manage workspace settings.');
  }
  const workspace = await getOrCreateCurrentWorkspace(user);
  return { supabase, user, workspace };
}

function settingsRedirect(message: string): never {
  revalidatePath('/settings');
  redirect(`/settings?settings=${encodeURIComponent(message)}#workspace-controls`);
}

function settingsErrorRedirect(message: string): never {
  redirect(`/settings?settingsError=${encodeURIComponent(message)}#workspace-controls`);
}

/**
 * Creates a Stripe Checkout session for the requested plan and redirects
 * the browser to it. After successful checkout, Stripe sends a webhook
 * (`customer.subscription.created` → `.updated`) which is what actually
 * flips `workspaces.plan` and grants credits.
 *
 * On failure (Stripe not configured, plan unknown, etc.) we bounce back
 * to /settings?billingError=... so the page can show the message.
 */
export async function startCheckoutAction(formData: FormData) {
  const planId = formData.get('planId');
  if (typeof planId !== 'string' || !['pro', 'studio', 'agency'].includes(planId)) {
    redirect(`/settings?billingError=${encodeURIComponent('Invalid plan id.')}#billing`);
  }
  if (isDemoMode()) {
    redirect(
      `/settings?billingError=${encodeURIComponent('Demo mode does not open Stripe Checkout.')}#billing`,
    );
  }

  if (!isStripeConfigured()) {
    redirect(
      `/settings?billingError=${encodeURIComponent('Stripe not configured. Set STRIPE_SECRET_KEY + STRIPE_PRICE_* in .env.local.')}#billing`,
    );
  }

  const price = stripePriceForPlan(planId as PlanId);
  if (!price) {
    redirect(
      `/settings?billingError=${encodeURIComponent(`STRIPE_PRICE_${(planId as string).toUpperCase()} not set in .env.local.`)}#billing`,
    );
  }

  let checkoutUrl: string;
  try {
    if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error('Supabase not configured — sign in before subscribing.');
    }
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) throw new Error('Sign in before subscribing.');
    const ws = await getOrCreateCurrentWorkspace(user);

    const { data: wsRow } = await supabase
      .from('workspaces')
      .select('stripe_customer_id')
      .eq('id', ws.id)
      .maybeSingle();

    const baseUrl = await getBaseUrl();
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      // Reuse the existing customer if we've seen the workspace before;
      // otherwise let Stripe create one from the email.
      ...(wsRow?.stripe_customer_id
        ? { customer: wsRow.stripe_customer_id }
        : { customer_email: user.email }),
      line_items: [{ price: price as string, quantity: 1 }],
      success_url: `${baseUrl}/settings?billing=success&plan=${planId}#billing`,
      cancel_url: `${baseUrl}/settings?billing=cancelled#billing`,
      // Metadata carries the workspace id through to the webhook so we
      // know which row to update without trusting the cookie alone.
      metadata: {
        workspaceId: ws.id,
        planId: planId as string,
        kind: 'subscription',
      },
      subscription_data: {
        metadata: {
          workspaceId: ws.id,
          planId: planId as string,
        },
      },
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    checkoutUrl = session.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start checkout.';
    redirect(`/settings?billingError=${encodeURIComponent(message)}#billing`);
  }

  redirect(checkoutUrl);
}

/**
 * Opens Stripe's hosted Customer Portal for an existing subscriber.
 * Lets them update card, cancel, switch plans, etc. without us building
 * any of that UI.
 */
export async function openPortalAction() {
  if (isDemoMode()) {
    redirect(
      `/settings?billingError=${encodeURIComponent('Demo mode does not open Stripe Portal.')}#billing`,
    );
  }
  if (!isStripeConfigured()) {
    redirect(`/settings?billingError=${encodeURIComponent('Stripe not configured.')}#billing`);
  }

  let url: string;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in.');
    const ws = await getOrCreateCurrentWorkspace(user);
    const { data: wsRow } = await supabase
      .from('workspaces')
      .select('stripe_customer_id')
      .eq('id', ws.id)
      .maybeSingle();
    if (!wsRow?.stripe_customer_id) {
      throw new Error('No active subscription — pick a plan first.');
    }

    const baseUrl = await getBaseUrl();
    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: wsRow.stripe_customer_id,
      return_url: `${baseUrl}/settings#billing`,
    });
    url = session.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open portal.';
    redirect(`/settings?billingError=${encodeURIComponent(message)}#billing`);
  }

  redirect(url);
}

/**
 * One-off credit purchase. Doesn't change `workspaces.plan`; the webhook
 * (`checkout.session.completed` with mode=payment) grants the credits.
 */
export async function topupCreditsAction() {
  if (isDemoMode()) {
    redirect(
      `/settings?billingError=${encodeURIComponent('Demo mode does not open Stripe Checkout.')}#billing`,
    );
  }
  if (!isStripeConfigured()) {
    redirect(`/settings?billingError=${encodeURIComponent('Stripe not configured.')}#billing`);
  }
  const price = CREDIT_TOPUP.priceId();
  if (!price) {
    redirect(
      `/settings?billingError=${encodeURIComponent('STRIPE_PRICE_TOPUP not set in .env.local.')}#billing`,
    );
  }

  let checkoutUrl: string;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) throw new Error('Sign in before purchasing credits.');
    const ws = await getOrCreateCurrentWorkspace(user);
    const { data: wsRow } = await supabase
      .from('workspaces')
      .select('stripe_customer_id')
      .eq('id', ws.id)
      .maybeSingle();

    const baseUrl = await getBaseUrl();
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      ...(wsRow?.stripe_customer_id
        ? { customer: wsRow.stripe_customer_id }
        : { customer_email: user.email }),
      line_items: [{ price: price as string, quantity: 1 }],
      success_url: `${baseUrl}/settings?billing=topup_success#billing`,
      cancel_url: `${baseUrl}/settings?billing=cancelled#billing`,
      metadata: {
        workspaceId: ws.id,
        kind: 'topup',
        credits: String(CREDIT_TOPUP.credits),
      },
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    checkoutUrl = session.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start checkout.';
    redirect(`/settings?billingError=${encodeURIComponent(message)}#billing`);
  }

  redirect(checkoutUrl);
}

export async function saveBrandDefaultsAction(formData: FormData) {
  const parsed = BrandDefaultsFormSchema.safeParse({
    brandTone: formData.get('brandTone'),
    brandVibe: formData.get('brandVibe'),
    brandPalette: formData.get('brandPalette'),
    defaultCta: formData.get('defaultCta'),
  });
  if (!parsed.success) {
    settingsErrorRedirect(parsed.error.issues[0]?.message ?? 'Invalid brand defaults.');
  }
  if (isDemoMode()) {
    settingsRedirect('Demo brand defaults previewed — no live workspace was changed.');
  }

  try {
    const { supabase, workspace } = await requireWorkspace();
    const { error } = await supabase.from('workspace_brand_defaults').upsert(
      {
        workspace_id: workspace.id,
        brand_tone: parsed.data.brandTone,
        brand_vibe: parsed.data.brandVibe,
        brand_palette: parsed.data.brandPalette,
        default_cta: parsed.data.defaultCta,
      },
      { onConflict: 'workspace_id' },
    );
    if (error) throw new Error(error.message);
  } catch (err) {
    settingsErrorRedirect(err instanceof Error ? err.message : 'Could not save brand defaults.');
  }

  settingsRedirect('Brand defaults saved.');
}

export async function inviteTeamMemberAction(formData: FormData) {
  const parsed = TeamInviteFormSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    settingsErrorRedirect(parsed.error.issues[0]?.message ?? 'Invalid team invite.');
  }
  if (isDemoMode()) {
    settingsRedirect('Demo invite previewed — no email was sent.');
  }

  try {
    const { supabase, user, workspace } = await requireWorkspace();
    const { error } = await supabase.from('workspace_invites').insert({
      workspace_id: workspace.id,
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by_user_id: user.id,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    settingsErrorRedirect(err instanceof Error ? err.message : 'Could not invite team member.');
  }

  settingsRedirect('Team invite created.');
}

export async function revokeTeamInviteAction(formData: FormData) {
  const parsed = RowIdSchema.safeParse(formData.get('inviteId'));
  if (!parsed.success) {
    settingsErrorRedirect('Invalid invite id.');
  }
  if (isDemoMode()) {
    settingsRedirect('Demo invite revoked locally — no live workspace was changed.');
  }

  try {
    const { supabase, workspace } = await requireWorkspace();
    const { error } = await supabase
      .from('workspace_invites')
      .update({ status: 'revoked' })
      .eq('id', parsed.data)
      .eq('workspace_id', workspace.id);
    if (error) throw new Error(error.message);
  } catch (err) {
    settingsErrorRedirect(err instanceof Error ? err.message : 'Could not revoke invite.');
  }

  settingsRedirect('Team invite revoked.');
}

export async function createWebhookAction(formData: FormData) {
  const parsed = WebhookFormSchema.safeParse({
    name: formData.get('name'),
    url: formData.get('url'),
    events: formData.getAll('events'),
  });
  if (!parsed.success) {
    settingsErrorRedirect(parsed.error.issues[0]?.message ?? 'Invalid webhook.');
  }
  if (isDemoMode()) {
    settingsRedirect('Demo webhook previewed — no endpoint was stored.');
  }

  try {
    const { supabase, workspace } = await requireWorkspace();
    const { error } = await supabase.from('workspace_webhooks').insert({
      workspace_id: workspace.id,
      name: parsed.data.name,
      url: parsed.data.url,
      events: parsed.data.events,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    settingsErrorRedirect(err instanceof Error ? err.message : 'Could not create webhook.');
  }

  settingsRedirect('Webhook endpoint created.');
}

export async function deleteWebhookAction(formData: FormData) {
  const parsed = RowIdSchema.safeParse(formData.get('webhookId'));
  if (!parsed.success) {
    settingsErrorRedirect('Invalid webhook id.');
  }
  if (isDemoMode()) {
    settingsRedirect('Demo webhook removed locally — no live workspace was changed.');
  }

  try {
    const { supabase, workspace } = await requireWorkspace();
    const { error } = await supabase
      .from('workspace_webhooks')
      .delete()
      .eq('id', parsed.data)
      .eq('workspace_id', workspace.id);
    if (error) throw new Error(error.message);
  } catch (err) {
    settingsErrorRedirect(err instanceof Error ? err.message : 'Could not delete webhook.');
  }

  settingsRedirect('Webhook endpoint removed.');
}

export type { PlanId } from '@/lib/billing/plans';
