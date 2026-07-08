import { Check, CreditCard, ExternalLink, LogOut, Zap } from 'lucide-react';
import { getPlan, PLANS, type PlanId } from '@/lib/billing/plans';
import { isStripeConfigured } from '@/lib/billing/stripe';
import {
  DEMO_USER_EMAIL,
  getDemoBrandDefaults,
  getDemoInvites,
  getDemoWebhooks,
  getDemoWorkspace,
  isDemoMode,
} from '@/lib/demo-mode';
import { publicEnv, serverEnv } from '@/lib/env';
import { isLumaStubbed } from '@/lib/luma-stub';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type {
  WorkspaceBrandDefaultsRow,
  WorkspaceInviteRow,
  WorkspaceWebhookRow,
} from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { fallbackBrandDefaults, getWorkspaceControls } from '@/lib/workspace-controls';
import { WEBHOOK_EVENTS } from '@/lib/workspace-controls-schema';
import { BRAND_TONES, CTAS } from '@/types/post';
import { cn } from '@/lib/utils';
import {
  createWebhookAction,
  deleteWebhookAction,
  inviteTeamMemberAction,
  openPortalAction,
  revokeTeamInviteAction,
  saveBrandDefaultsAction,
  startCheckoutAction,
  topupCreditsAction,
} from './actions';

interface PageProps {
  searchParams: Promise<{
    billing?: string;
    billingError?: string;
    plan?: string;
    settings?: string;
    settingsError?: string;
  }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const { billing, billingError, plan: planParam, settings, settingsError } = await searchParams;
  const demoMode = isDemoMode();

  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const stubbed = isLumaStubbed();
  const lumaConfigured = demoMode || stubbed || Boolean(serverEnv.LUMA_API_KEY);
  const zernioConfigured = demoMode || Boolean(serverEnv.ZERNIO_API_KEY);
  const stripeConfigured = !demoMode && isStripeConfigured();

  let userEmail: string | null = null;
  let userId: string | null = null;
  let currentPlan: PlanId = 'free';
  let credits = 0;
  let renewsAt: string | null = null;
  let hasSubscription = false;
  let workspaceId: string | null = null;
  let brandDefaults: WorkspaceBrandDefaultsRow | null = null;
  let invites: WorkspaceInviteRow[] = [];
  let webhooks: WorkspaceWebhookRow[] = [];
  let controlsError: string | null = null;

  if (demoMode) {
    const workspace = getDemoWorkspace();
    userEmail = DEMO_USER_EMAIL;
    userId = workspace.owner_user_id;
    currentPlan = workspace.plan;
    credits = workspace.credits;
    renewsAt = workspace.plan_renews_at;
    hasSubscription = false;
    workspaceId = workspace.id;
    brandDefaults = getDemoBrandDefaults();
    invites = getDemoInvites();
    webhooks = getDemoWebhooks();
  } else if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userEmail = user?.email ?? null;
      userId = user?.id ?? null;
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        workspaceId = ws.id;
        const { data } = await supabase
          .from('workspaces')
          .select('plan, credits, plan_renews_at, stripe_subscription_id')
          .eq('id', ws.id)
          .maybeSingle();
        currentPlan = (data?.plan as PlanId) ?? 'free';
        credits = data?.credits ?? 0;
        renewsAt = data?.plan_renews_at ?? null;
        hasSubscription = Boolean(data?.stripe_subscription_id);
        try {
          const controls = await getWorkspaceControls(ws.id);
          brandDefaults = controls.brandDefaults;
          invites = controls.invites;
          webhooks = controls.webhooks;
        } catch (err) {
          controlsError = err instanceof Error ? err.message : 'Workspace controls unavailable.';
          brandDefaults = fallbackBrandDefaults(ws.id);
        }
      }
    } catch {
      // best-effort — page still renders
    }
  }

  const effectiveBrandDefaults =
    brandDefaults ?? fallbackBrandDefaults(workspaceId ?? '00000000-0000-0000-0000-000000000000');
  const controlsDisabled = demoMode || !userId || Boolean(controlsError);

  return (
    <div className="app-page workflow-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header workflow-hero">
          <p className="framer-eyebrow">Settings</p>
          <h1 className="workflow-title mt-2">
            Configure the
            <br />
            workspace.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            Account info, billing, integration status, and platform keys.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {demoMode ? (
              <StatusPill tone="info">Demo workspace · live changes disabled</StatusPill>
            ) : null}
            {!demoMode && !supabaseConfigured ? (
              <StatusPill tone="warn">Supabase off · workspace controls unavailable</StatusPill>
            ) : null}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* ---- BILLING ---- */}
            <section id="billing" className="workflow-panel p-5">
              <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                  Billing
                </h2>
                {!stripeConfigured ? (
                  <span className="text-[11px] text-[#ff7a3d]">
                    {demoMode
                      ? 'Demo mode · Stripe disabled'
                      : 'Stripe keys missing · set in .env.local'}
                  </span>
                ) : null}
              </header>

              {demoMode ? (
                <BillingFlash tone="info">
                  Demo billing is read-only. Upgrade and top-up buttons stay disabled to prevent
                  real Stripe sessions.
                </BillingFlash>
              ) : null}

              {billing === 'success' && planParam ? (
                <BillingFlash tone="ok">
                  Subscription active —{' '}
                  <span className="text-ink">{getPlan(planParam as PlanId).name}</span> plan credits
                  applied.
                </BillingFlash>
              ) : null}
              {billing === 'topup_success' ? (
                <BillingFlash tone="ok">Top-up complete — credits applied.</BillingFlash>
              ) : null}
              {billing === 'cancelled' ? (
                <BillingFlash tone="info">Checkout cancelled — nothing changed.</BillingFlash>
              ) : null}
              {billingError ? <BillingFlash tone="err">{billingError}</BillingFlash> : null}

              <CurrentPlanCard
                planId={currentPlan}
                credits={credits}
                renewsAt={renewsAt}
                hasSubscription={hasSubscription}
                stripeConfigured={stripeConfigured}
              />

              <h3 className="mb-3 mt-6 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                Upgrade
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {PLANS.filter((p) => p.id !== 'free').map((p) => (
                  <PlanUpgradeCard
                    key={p.id}
                    plan={p}
                    currentPlanId={currentPlan}
                    stripeConfigured={stripeConfigured}
                    disabledReason={
                      demoMode
                        ? 'Demo mode does not open Stripe Checkout.'
                        : 'Set STRIPE_SECRET_KEY + STRIPE_PRICE_* in .env.local first.'
                    }
                  />
                ))}
              </div>

              <div className="workflow-row mt-6 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-ink">Need more credits?</p>
                    <p className="mt-1 text-[12px] text-ink-muted">
                      One-off top-up · 1,000 credits for $10. Stays on your current plan.
                    </p>
                  </div>
                  <form action={topupCreditsAction}>
                    <button
                      type="submit"
                      disabled={!stripeConfigured}
                      title={
                        !stripeConfigured
                          ? demoMode
                            ? 'Demo mode does not open Stripe Checkout.'
                            : 'Set Stripe keys in .env.local first.'
                          : undefined
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0099ff] px-3.5 text-[12px] font-medium text-white transition hover:bg-[#1aa6ff] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666]"
                    >
                      <Zap size={11} />
                      Buy 1,000 credits
                    </button>
                  </form>
                </div>
              </div>
            </section>

            {/* ---- ACCOUNT ---- */}
            <Section label="Account" hint={userEmail ? 'Signed in' : 'Not signed in'}>
              <FieldRow label="Email">
                <ReadOnlyValue value={userEmail ?? '—'} mono />
              </FieldRow>
              {userId ? (
                <FieldRow label="User ID">
                  <ReadOnlyValue value={userId} mono small />
                </FieldRow>
              ) : null}
              <FieldRow label="Session">
                <form action="/auth/sign-out" method="post" className="inline-flex">
                  <button
                    type="submit"
                    disabled={!userEmail || demoMode}
                    title={demoMode ? 'Demo sessions are not backed by Supabase auth.' : undefined}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[12px] font-medium text-ink transition hover:border-[#ff5577]/40 hover:text-[#ff5577] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <LogOut size={12} />
                    Sign out
                  </button>
                </form>
              </FieldRow>
            </Section>

            {/* ---- INTEGRATIONS ---- */}
            <Section label="Integrations" hint="Set keys in .env.local">
              <IntegrationRow
                name="Supabase"
                desc={
                  demoMode ? 'Bypassed for local demo workspace.' : 'Auth + workspace data store.'
                }
                status={demoMode ? 'info' : supabaseConfigured ? 'ok' : 'warn'}
                statusLabel={demoMode ? 'demo' : supabaseConfigured ? 'connected' : 'missing'}
                value={
                  demoMode ? 'THEPLUS_DEMO_MODE=true' : (publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? '—')
                }
              />
              <IntegrationRow
                name="Luma"
                desc={
                  demoMode
                    ? 'Demo fixtures — no paid generation calls.'
                    : stubbed
                      ? 'Stub mode — placeholder images, no real generation.'
                      : 'Image generation API.'
                }
                status={demoMode || stubbed ? 'info' : lumaConfigured ? 'ok' : 'warn'}
                statusLabel={
                  demoMode ? 'demo' : stubbed ? 'stub' : lumaConfigured ? 'live' : 'missing'
                }
                value={
                  demoMode
                    ? 'demo fixtures'
                    : stubbed
                      ? 'LUMA_STUB=1'
                      : serverEnv.LUMA_API_KEY
                        ? maskKey(serverEnv.LUMA_API_KEY)
                        : '—'
                }
              />
              <IntegrationRow
                name="Zernio"
                desc={
                  demoMode
                    ? 'Demo connected platforms — no broker calls.'
                    : 'Cross-platform scheduling broker.'
                }
                status={demoMode ? 'info' : zernioConfigured ? 'ok' : 'warn'}
                statusLabel={demoMode ? 'demo' : zernioConfigured ? 'connected' : 'missing'}
                value={
                  demoMode
                    ? 'Instagram · TikTok · YouTube'
                    : zernioConfigured
                      ? maskKey(serverEnv.ZERNIO_API_KEY ?? '')
                      : '—'
                }
              />
              <IntegrationRow
                name="Stripe"
                desc={
                  demoMode
                    ? 'Disabled in demo so Checkout never opens.'
                    : 'Billing + credit top-ups.'
                }
                status={demoMode ? 'info' : stripeConfigured ? 'ok' : 'warn'}
                statusLabel={demoMode ? 'demo off' : stripeConfigured ? 'connected' : 'missing'}
                value={
                  demoMode
                    ? 'checkout disabled'
                    : stripeConfigured && serverEnv.STRIPE_SECRET_KEY
                      ? maskKey(serverEnv.STRIPE_SECRET_KEY)
                      : '—'
                }
              />
            </Section>

            <Section
              id="workspace-controls"
              label="Workspace controls"
              hint={controlsError ? 'Apply migration 0014' : 'Live configuration'}
            >
              {settings ? <SettingsFlash tone="ok">{settings}</SettingsFlash> : null}
              {settingsError ? <SettingsFlash tone="err">{settingsError}</SettingsFlash> : null}
              {controlsError ? <SettingsFlash tone="err">{controlsError}</SettingsFlash> : null}
              {demoMode ? (
                <SettingsFlash tone="ok">
                  Demo settings are visible but read-only. Use normal mode with Supabase configured
                  to save workspace controls.
                </SettingsFlash>
              ) : null}
              <BrandDefaultsForm defaults={effectiveBrandDefaults} disabled={controlsDisabled} />
              <TeamMembersPanel
                ownerEmail={userEmail}
                invites={invites}
                disabled={controlsDisabled}
              />
              <WebhooksPanel webhooks={webhooks} disabled={controlsDisabled} />
            </Section>
          </div>

          {/* ---- RIGHT RAIL ---- */}
          <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
            <div className="workflow-panel p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                Build
              </p>
              <dl className="mt-3 grid gap-2 text-[13px]">
                <MetaRow label="Environment" value={process.env.NODE_ENV} />
                <MetaRow label="Region" value="local" />
                <MetaRow label="Plan" value={getPlan(currentPlan).name} />
              </dl>
            </div>

            <div className="rounded-[16px] border border-[#ff5577]/30 bg-[#ff5577]/[0.04] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#ff5577]">
                Danger zone
              </p>
              <p className="mt-2 text-[13px] leading-[1.4] text-ink-muted">
                Deleting the workspace removes every model, post, and connected account. This cannot
                be undone.
              </p>
              <button
                type="button"
                disabled
                title="Requires owner confirmation"
                className="mt-3 inline-flex h-9 items-center rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 text-[12px] font-medium text-[#ff5577] transition hover:bg-[#ff5577]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete workspace
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ---------- subcomponents ----------

function StatusPill({ tone, children }: { tone: 'info' | 'warn'; children: React.ReactNode }) {
  const dot = {
    info: 'bg-[#0099ff]',
    warn: 'bg-[#ff7a3d]',
  }[tone];
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-surface-1 px-3 py-1.5 text-[12px] text-ink ring-1 ring-[#262626]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function CurrentPlanCard({
  planId,
  credits,
  renewsAt,
  hasSubscription,
  stripeConfigured,
}: {
  planId: PlanId;
  credits: number;
  renewsAt: string | null;
  hasSubscription: boolean;
  stripeConfigured: boolean;
}) {
  const plan = getPlan(planId);
  return (
    <div className="workflow-row p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Current plan
          </p>
          <p className="mt-1 text-[26px] font-medium tracking-normal text-ink">
            {plan.name}
            {plan.monthlyPriceUsd > 0 ? (
              <span className="ml-2 text-[14px] font-normal text-ink-muted">
                ${plan.monthlyPriceUsd}/mo
              </span>
            ) : null}
          </p>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            <Zap size={10} className="-mt-px mr-1 inline text-[#0099ff]" />
            <span className="tabular-nums text-ink">{credits.toLocaleString()}</span> credits
            available
            {renewsAt
              ? ` · renews ${new Date(renewsAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}`
              : ''}
          </p>
        </div>
        {hasSubscription ? (
          <form action={openPortalAction}>
            <button
              type="submit"
              disabled={!stripeConfigured}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-1 px-3.5 text-[12px] font-medium text-ink transition hover:border-[#0099ff]/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard size={11} />
              Manage subscription
              <ExternalLink size={10} className="text-ink-muted" />
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function PlanUpgradeCard({
  plan,
  currentPlanId,
  stripeConfigured,
  disabledReason,
}: {
  plan: ReturnType<typeof getPlan>;
  currentPlanId: PlanId;
  stripeConfigured: boolean;
  disabledReason: string;
}) {
  const isCurrent = plan.id === currentPlanId;
  const order: PlanId[] = ['free', 'pro', 'studio', 'agency'];
  const isUpgrade = order.indexOf(plan.id) > order.indexOf(currentPlanId);
  const ctaLabel = isCurrent
    ? 'Current plan'
    : isUpgrade
      ? `Upgrade to ${plan.name}`
      : `Switch to ${plan.name}`;

  const accent = plan.id === 'studio' ? '#a855f7' : plan.id === 'agency' ? '#22c55e' : '#0099ff';

  return (
    <div
      className={cn(
        'workflow-card relative flex flex-col gap-3 p-4',
        isCurrent ? 'border-[#0099ff]/50 shadow-[0_0_0_1px_rgba(0,153,255,0.18)]' : '',
      )}
    >
      <div>
        <p
          className="text-[10px] font-medium uppercase tracking-[0.12em]"
          style={{ color: accent }}
        >
          {plan.name}
        </p>
        <p className="mt-1 text-[22px] font-medium tracking-normal text-ink">
          ${plan.monthlyPriceUsd}
          <span className="text-[12px] font-normal text-ink-muted">/mo</span>
        </p>
        <p className="mt-1 text-[12px] leading-[1.4] text-ink-muted">{plan.tagline}</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-[12px] text-ink">
            <Check size={11} className="mt-0.5 shrink-0 text-[#22c55e]" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <form action={startCheckoutAction} className="mt-auto">
        <input type="hidden" name="planId" value={plan.id} />
        <button
          type="submit"
          disabled={isCurrent || !stripeConfigured}
          title={!stripeConfigured ? disabledReason : undefined}
          className={cn(
            'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] text-[12px] font-medium transition',
            isCurrent
              ? 'bg-surface-1 text-ink-muted ring-1 ring-[#262626]'
              : 'bg-[#0099ff] text-white hover:bg-[#1aa6ff] active:scale-[0.99]',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {ctaLabel}
        </button>
      </form>
    </div>
  );
}

function BillingFlash({
  tone,
  children,
}: {
  tone: 'ok' | 'err' | 'info';
  children: React.ReactNode;
}) {
  const cls = {
    ok: 'border-[#22c55e]/30 bg-[#22c55e]/[0.07] text-[#22c55e]',
    err: 'border-[#ff5577]/40 bg-[#ff5577]/[0.07] text-[#ff5577]',
    info: 'border-[#0099ff]/30 bg-[#0099ff]/[0.07] text-[#0099ff]',
  }[tone];
  return (
    <p
      className={cn('mb-4 rounded-[10px] border px-3 py-2 text-[12px]', cls)}
      role={tone === 'err' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

function Section({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="workflow-panel p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          {label}
        </h2>
        {hint ? <span className="text-[11px] text-[#666]">{hint}</span> : null}
      </header>
      <div className="flex flex-col divide-y divide-white/[0.07]">{children}</div>
    </section>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[160px_minmax(0,1fr)]">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ReadOnlyValue({ value, mono, small }: { value: string; mono?: boolean; small?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block max-w-full truncate rounded-[8px] bg-surface-2 px-2.5 py-1 text-ink',
        mono ? 'font-mono' : '',
        small ? 'text-[11px]' : 'text-[13px]',
      )}
      title={value}
    >
      {value}
    </span>
  );
}

function IntegrationRow({
  name,
  desc,
  status,
  statusLabel,
  value,
}: {
  name: string;
  desc: string;
  status: 'ok' | 'warn' | 'err' | 'info';
  statusLabel: string;
  value: string;
}) {
  const tone = {
    ok: 'bg-[#22c55e]/10 text-[#22c55e] ring-[#22c55e]/30',
    warn: 'bg-[#ff7a3d]/10 text-[#ff7a3d] ring-[#ff7a3d]/30',
    err: 'bg-[#ff5577]/10 text-[#ff5577] ring-[#ff5577]/30',
    info: 'bg-[#0099ff]/10 text-[#0099ff] ring-[#0099ff]/30',
  }[status];
  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-ink">{name}</p>
        <p className="mt-0.5 text-[12px] text-ink-muted">{desc}</p>
        <p className="mt-1.5 truncate font-mono text-[11px] text-[#666]" title={value}>
          {value}
        </p>
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1',
          tone,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {statusLabel}
      </span>
    </div>
  );
}

function BrandDefaultsForm({
  defaults,
  disabled,
}: {
  defaults: WorkspaceBrandDefaultsRow;
  disabled: boolean;
}) {
  return (
    <div className="py-4 first:pt-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-ink">Brand defaults</p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            Default tone, vibe, palette, and CTA for new campaign briefs.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-[#0099ff]/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[#79cfff] ring-1 ring-[#0099ff]/30">
          Applied to Create
        </span>
      </div>
      <form action={saveBrandDefaultsAction} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Tone
            </span>
            <select
              name="brandTone"
              defaultValue={defaults.brand_tone}
              disabled={disabled}
              className="h-10 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[13px] text-ink outline-none focus:border-[#0099ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {BRAND_TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {formatLabel(tone)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Default CTA
            </span>
            <select
              name="defaultCta"
              defaultValue={defaults.default_cta}
              disabled={disabled}
              className="h-10 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[13px] text-ink outline-none focus:border-[#0099ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {CTAS.map((cta) => (
                <option key={cta} value={cta}>
                  {formatLabel(cta)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Vibe
          </span>
          <input
            name="brandVibe"
            defaultValue={defaults.brand_vibe}
            disabled={disabled}
            className="h-10 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[13px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Cinematic, high-trust, creator-led..."
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Palette
          </span>
          <input
            name="brandPalette"
            defaultValue={defaults.brand_palette}
            disabled={disabled}
            className="h-10 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[13px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Electric blue, signal green, warm neutrals..."
          />
        </label>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-9 w-fit items-center gap-1.5 rounded-[10px] bg-[#0099ff] px-3.5 text-[12px] font-medium text-white transition hover:bg-[#1aa6ff] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666]"
        >
          <Check size={12} />
          Save brand defaults
        </button>
      </form>
    </div>
  );
}

function TeamMembersPanel({
  ownerEmail,
  invites,
  disabled,
}: {
  ownerEmail: string | null;
  invites: WorkspaceInviteRow[];
  disabled: boolean;
}) {
  const pending = invites.filter((invite) => invite.status === 'pending');
  return (
    <div className="py-4">
      <div className="mb-3">
        <p className="text-[14px] font-medium text-ink">Team members</p>
        <p className="mt-0.5 text-[12px] text-ink-muted">
          Invite collaborators and assign workspace roles.
        </p>
      </div>
      <form
        action={inviteTeamMemberAction}
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_auto]"
      >
        <input
          name="email"
          type="email"
          disabled={disabled}
          placeholder="teammate@company.com"
          className="h-10 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[13px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <select
          name="role"
          defaultValue="editor"
          disabled={disabled}
          className="h-10 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[13px] text-ink outline-none focus:border-[#0099ff] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-10 items-center justify-center rounded-[10px] bg-white px-3.5 text-[12px] font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Invite
        </button>
      </form>
      <div className="mt-3 grid gap-2">
        <TeamRow email={ownerEmail ?? 'Owner'} role="owner" status="active" />
        {pending.length > 0 ? (
          pending.map((invite) => (
            <TeamRow
              key={invite.id}
              email={invite.email}
              role={invite.role}
              status={invite.status}
              inviteId={invite.id}
              disabled={disabled}
            />
          ))
        ) : (
          <p className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[12px] text-ink-muted">
            No pending invites.
          </p>
        )}
      </div>
    </div>
  );
}

function TeamRow({
  email,
  role,
  status,
  inviteId,
  disabled,
}: {
  email: string;
  role: string;
  status: string;
  inviteId?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{email}</p>
        <p className="text-[11px] uppercase tracking-wider text-ink-muted">
          {formatLabel(role)} · {formatLabel(status)}
        </p>
      </div>
      {inviteId ? (
        <form action={revokeTeamInviteAction}>
          <input type="hidden" name="inviteId" value={inviteId} />
          <button
            type="submit"
            disabled={disabled}
            className="text-[11px] font-medium text-[#ff5577] transition hover:text-[#ff8aa1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Revoke
          </button>
        </form>
      ) : null}
    </div>
  );
}

function WebhooksPanel({
  webhooks,
  disabled,
}: {
  webhooks: WorkspaceWebhookRow[];
  disabled: boolean;
}) {
  return (
    <div className="py-4 last:pb-0">
      <div className="mb-3">
        <p className="text-[14px] font-medium text-ink">Webhooks</p>
        <p className="mt-0.5 text-[12px] text-ink-muted">
          Register HTTPS endpoints for publish, schedule, review, and comment events.
        </p>
      </div>
      <form action={createWebhookAction} className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
          <input
            name="name"
            disabled={disabled}
            placeholder="Ops listener"
            className="h-10 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[13px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <input
            name="url"
            type="url"
            disabled={disabled}
            placeholder="https://example.com/webhooks/theplus"
            className="h-10 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[13px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map((event) => (
            <label
              key={event}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-[#262626] bg-surface-2 px-3 text-[11px] text-ink-muted"
            >
              <input
                type="checkbox"
                name="events"
                value={event}
                defaultChecked={event === 'post.scheduled' || event === 'post.published'}
                disabled={disabled}
              />
              {event}
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-9 w-fit items-center rounded-[10px] bg-white px-3.5 text-[12px] font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add webhook
        </button>
      </form>
      <div className="mt-3 grid gap-2">
        {webhooks.length > 0 ? (
          webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="flex items-start justify-between gap-3 rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{webhook.name}</p>
                <p className="truncate font-mono text-[11px] text-[#79cfff]" title={webhook.url}>
                  {webhook.url}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-ink-muted">
                  {webhook.events.join(' · ')}
                </p>
              </div>
              <form action={deleteWebhookAction}>
                <input type="hidden" name="webhookId" value={webhook.id} />
                <button
                  type="submit"
                  disabled={disabled}
                  className="text-[11px] font-medium text-[#ff5577] transition hover:text-[#ff8aa1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove
                </button>
              </form>
            </div>
          ))
        ) : (
          <p className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[12px] text-ink-muted">
            No webhook endpoints registered.
          </p>
        )}
      </div>
    </div>
  );
}

function SettingsFlash({ tone, children }: { tone: 'ok' | 'err'; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'mb-3 rounded-[10px] border px-3 py-2 text-[12px]',
        tone === 'ok'
          ? 'border-[#22c55e]/30 bg-[#22c55e]/[0.07] text-[#86efac]'
          : 'border-[#ff5577]/40 bg-[#ff5577]/[0.07] text-[#ff8aa1]',
      )}
      role={tone === 'err' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

function formatLabel(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className="truncate font-mono text-[12px] text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

function maskKey(key: string): string {
  if (!key) return '—';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
