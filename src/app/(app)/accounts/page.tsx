import { Plus } from 'lucide-react';
import { serverEnv } from '@/lib/env';
import { getZernioClient, type ZernioAccount, type ZernioPlatform } from '@/lib/zernio';
import { startConnectionAction } from './actions';

const ALL_PLATFORMS: { id: ZernioPlatform; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'twitter', label: 'X / Twitter' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'threads', label: 'Threads' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'reddit', label: 'Reddit' },
];

export default async function AccountsPage() {
  const zernioConfigured = Boolean(serverEnv.ZERNIO_API_KEY);

  let accounts: ZernioAccount[] = [];
  let loadError: string | null = null;
  if (zernioConfigured) {
    try {
      accounts = await getZernioClient().listAccounts();
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unknown Zernio error';
    }
  }

  const accountsByPlatform = new Map<string, ZernioAccount[]>();
  for (const a of accounts) {
    const list = accountsByPlatform.get(a.platform.toLowerCase()) ?? [];
    list.push(a);
    accountsByPlatform.set(a.platform.toLowerCase(), list);
  }

  return (
    <div className="px-10 py-10">
      <header className="mb-8 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Connected social accounts via{' '}
          <a
            href="https://zernio.com"
            target="_blank"
            rel="noreferrer"
            className="text-zinc-200 underline-offset-2 hover:underline"
          >
            Zernio
          </a>
          . The Calendar uses these to push scheduled posts to the actual platform.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {!zernioConfigured ? (
            <span className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-1.5 text-amber-300">
              ZERNIO_API_KEY missing — set it in <code>.env.local</code> to connect accounts.
            </span>
          ) : null}
          {loadError ? (
            <span className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-red-300">
              {loadError}
            </span>
          ) : null}
        </div>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_PLATFORMS.map(({ id, label }) => {
          const connected = accountsByPlatform.get(id) ?? [];
          return (
            <li
              key={id}
              className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium text-zinc-100">{label}</h3>
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  {connected.length === 0
                    ? 'not connected'
                    : `${connected.length} account${connected.length === 1 ? '' : 's'}`}
                </span>
              </div>
              {connected.length > 0 ? (
                <ul className="mb-3 flex flex-col gap-1.5">
                  {connected.map((a) => (
                    <li key={a._id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-zinc-200" title={a.username ?? a._id}>
                        {a.displayName ?? a.username ?? a._id}
                      </span>
                      <span
                        className={
                          a.isActive ?? true
                            ? 'shrink-0 rounded-full bg-emerald-950/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300'
                            : 'shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500'
                        }
                      >
                        {a.isActive ?? true ? 'active' : 'inactive'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form action={startConnectionAction}>
                <input type="hidden" name="platform" value={id} />
                <button
                  type="submit"
                  disabled={!zernioConfigured}
                  title={
                    zernioConfigured ? `Connect a new ${label} account via Zernio` : 'Set ZERNIO_API_KEY first.'
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={14} />
                  Connect {connected.length > 0 ? 'another' : label}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
