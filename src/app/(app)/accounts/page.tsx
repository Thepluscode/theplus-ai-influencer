import { Plus } from 'lucide-react';
import { serverEnv } from '@/lib/env';
import { syncSocialAccounts } from '@/lib/social-accounts';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import {
  getDefaultZernioProfileId,
  getZernioClient,
  type ZernioAccount,
  type ZernioPlatform,
} from '@/lib/zernio';
import { getDemoAccounts, isDemoMode } from '@/lib/demo-mode';
import { startConnectionAction } from './actions';

const ALL_PLATFORMS: { id: ZernioPlatform; label: string; icon: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: 'IG' },
  { id: 'tiktok', label: 'TikTok', icon: 'TT' },
  { id: 'twitter', label: 'X / Twitter', icon: 'X' },
  { id: 'youtube', label: 'YouTube', icon: 'YT' },
  { id: 'facebook', label: 'Facebook', icon: 'FB' },
  { id: 'threads', label: 'Threads', icon: 'TH' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'IN' },
  { id: 'pinterest', label: 'Pinterest', icon: 'PI' },
  { id: 'reddit', label: 'Reddit', icon: 'RD' },
];

interface AccountsPageProps {
  searchParams: Promise<{
    error?: string;
    errorPlatform?: string;
    errorCode?: string;
    billingUrl?: string;
  }>;
}

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const { error: connectError, errorPlatform, errorCode, billingUrl } = await searchParams;
  const demoMode = isDemoMode();
  const zernioConfigured = demoMode || Boolean(serverEnv.ZERNIO_API_KEY);

  let accounts: ZernioAccount[] = [];
  let loadError: string | null = null;
  if (demoMode) {
    accounts = getDemoAccounts();
  } else if (zernioConfigured) {
    try {
      const profileId = await getDefaultZernioProfileId();
      accounts = await getZernioClient().listAccounts(profileId);
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unknown Zernio error';
    }
    // Keep the account → workspace map current so inbound DM webhooks can be
    // attributed. Reuses the list above (no extra Zernio call); best-effort.
    if (accounts.length > 0) {
      try {
        const supabase = await getSupabaseServerClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const ws = await getOrCreateCurrentWorkspace(user);
          await syncSocialAccounts(ws.id, accounts);
        }
      } catch {
        // non-fatal — the page still renders the connected accounts
      }
    }
  }

  const accountsByPlatform = new Map<string, ZernioAccount[]>();
  for (const a of accounts) {
    const list = accountsByPlatform.get(a.platform.toLowerCase()) ?? [];
    list.push(a);
    accountsByPlatform.set(a.platform.toLowerCase(), list);
  }

  const totalConnected = accounts.length;

  return (
    <div className="app-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header">
          <p className="framer-eyebrow">Accounts</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
            One workspace.
            <br />
            Every platform.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            Connected social accounts via{' '}
            <a
              href="https://zernio.com"
              target="_blank"
              rel="noreferrer"
              className="text-[#0099ff] underline-offset-2 hover:underline"
            >
              Zernio
            </a>
            . The Calendar uses these to push scheduled posts to the actual platform.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {totalConnected > 0 ? (
              <StatusPill tone="ok">
                <span className="font-medium text-ink">{totalConnected}</span> connected
              </StatusPill>
            ) : null}
            {demoMode ? (
              <StatusPill tone="ok">Demo accounts · no Zernio calls</StatusPill>
            ) : !zernioConfigured ? (
              <StatusPill tone="warn">
                ZERNIO_API_KEY missing · set in <code>.env.local</code>
              </StatusPill>
            ) : null}
            {loadError ? (
              <StatusPill tone="err" title={loadError}>
                Zernio fetch failed
              </StatusPill>
            ) : null}
          </div>
        </header>

        {connectError ? (
          <ConnectErrorBanner
            platform={errorPlatform ?? 'platform'}
            message={connectError}
            code={errorCode}
            billingUrl={billingUrl}
          />
        ) : null}

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_PLATFORMS.map(({ id, label, icon }) => {
            const connected = accountsByPlatform.get(id) ?? [];
            const isConnected = connected.length > 0;
            return (
              <li key={id} className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold uppercase tracking-wider text-ink ring-1 ring-[#262626]">
                      {icon}
                    </span>
                    <h3 className="text-[14px] font-medium text-ink">{label}</h3>
                  </div>
                  {isConnected ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0099ff]/10 px-2.5 py-1 text-[11px] font-medium text-[#0099ff] ring-1 ring-[#0099ff]/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0099ff]" />
                      {connected.length} {connected.length === 1 ? 'account' : 'accounts'}
                    </span>
                  ) : (
                    <span className="text-[11px] uppercase tracking-wider text-[#666]">
                      not connected
                    </span>
                  )}
                </div>

                {isConnected ? (
                  <ul className="mb-3 flex flex-col gap-1.5">
                    {connected.map((a) => (
                      <li
                        key={a._id}
                        className="flex items-center justify-between gap-2 rounded-[10px] bg-surface-2 px-3 py-2"
                      >
                        <span className="truncate text-[13px] text-ink" title={a.username ?? a._id}>
                          {a.displayName ?? a.username ?? a._id}
                        </span>
                        <span
                          className={
                            (a.isActive ?? true)
                              ? 'shrink-0 rounded-full bg-[#22c55e]/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#22c55e] ring-1 ring-[#22c55e]/30'
                              : 'shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-muted'
                          }
                        >
                          {(a.isActive ?? true) ? 'active' : 'inactive'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <form action={startConnectionAction}>
                  <input type="hidden" name="platform" value={id} />
                  <button
                    type="submit"
                    disabled={!zernioConfigured || demoMode}
                    title={
                      demoMode
                        ? 'Demo accounts are pre-connected.'
                        : zernioConfigured
                          ? `Connect a new ${label} account via Zernio`
                          : 'Set ZERNIO_API_KEY first.'
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] border border-[#262626] bg-surface-2 px-3 py-2.5 text-[13px] font-medium text-ink transition hover:border-[#0099ff]/50 hover:bg-[#222] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#262626] disabled:hover:bg-surface-2"
                  >
                    <Plus size={14} />
                    {demoMode ? 'Demo connected' : `Connect ${isConnected ? 'another' : label}`}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ConnectErrorBanner({
  platform,
  message,
  code,
  billingUrl,
}: {
  platform: string;
  message: string;
  code?: string;
  billingUrl?: string;
}) {
  // X/Twitter requires Zernio billing because the X API charges Zernio
  // per-call. Surface this explicitly so the operator knows it's not our
  // app's failure — and link straight to Zernio's billing page.
  const isPaymentRequired = code === 'PAYMENT_REQUIRED';
  return (
    <div
      className="mb-6 rounded-[16px] border border-[#ff7a3d]/40 bg-[#ff7a3d]/[0.06] p-4"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ff7a3d]/15 text-[#ff7a3d] ring-1 ring-[#ff7a3d]/30">
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-ink">
            Couldn&apos;t start the <span className="capitalize">{platform}</span> connection
          </p>
          <p className="mt-1 text-[13px] leading-[1.5] text-ink-muted">{message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isPaymentRequired && billingUrl ? (
              <a
                href={billingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0099ff] px-3.5 text-[12px] font-medium text-white transition hover:bg-[#1aa6ff]"
              >
                Set up Zernio billing
              </a>
            ) : null}
            <a
              href="/accounts"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-2 px-3.5 text-[12px] font-medium text-ink transition hover:border-[#444]"
            >
              Dismiss
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'err' | 'ok';
  title?: string;
  children: React.ReactNode;
}) {
  const dot = {
    info: 'bg-[#0099ff]',
    warn: 'bg-[#ff7a3d]',
    err: 'bg-[#ff5577]',
    ok: 'bg-[#22c55e]',
  }[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-2 rounded-full bg-surface-1 px-3 py-1.5 text-[12px] text-ink"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
