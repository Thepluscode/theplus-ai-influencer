'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckCircle2, LogOut, Sparkles } from 'lucide-react';
import { ThePlusTechBrand } from '@/components/brand/theplus-tech-logo';
import {
  navItemMatches,
  PRIMARY_NAV,
  SECONDARY_NAV,
  SETTINGS_NAV,
} from '@/components/layout/nav-config';
import { cn } from '@/lib/utils';

export function Sidebar({
  userEmail,
  demoMode = false,
}: {
  userEmail: string | null;
  demoMode?: boolean;
}) {
  const pathname = usePathname();
  const [clientPathname, setClientPathname] = useState('');
  const hasClientPathname = clientPathname.length > 0;
  const settingsActive = hasClientPathname && navItemMatches(clientPathname, SETTINGS_NAV);
  const secondaryActive =
    hasClientPathname && SECONDARY_NAV.some((item) => navItemMatches(clientPathname, item));
  const SettingsIcon = SETTINGS_NAV.icon;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setClientPathname(pathname));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <aside className="flex h-dvh w-[76px] shrink-0 flex-col border-r border-[#1b1b1b] bg-[#070707]/96 text-ink-muted shadow-[inset_-1px_0_0_rgba(255,255,255,0.02)] backdrop-blur-xl lg:w-[268px]">
      <div className="border-b border-[#1b1b1b] px-3 py-4 lg:px-4">
        <Link
          href="/dashboard"
          className="group flex items-center justify-center gap-2.5 text-[14px] font-medium tracking-tight text-ink lg:justify-start"
        >
          <ThePlusTechBrand
            sublabel="Influencer OS"
            className="[&>span:last-child]:hidden lg:[&>span:last-child]:block"
          />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-4 lg:px-3">
        <div>
          <p className="mb-2 hidden px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#5d5d5d] lg:block">
            Core workflow
          </p>
          <div className="grid gap-1">
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              const active = hasClientPathname && navItemMatches(clientPathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={cn(
                    'group relative flex h-11 items-center justify-center gap-3 overflow-hidden rounded-[12px] px-3 text-[13px] transition lg:justify-start',
                    active
                      ? 'bg-[#151515] text-ink ring-1 ring-[#2c2c2c]'
                      : 'text-ink-muted hover:bg-[#111] hover:text-ink',
                  )}
                >
                  <span
                    className={cn(
                      'absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full transition',
                      active ? 'bg-[#0099ff]' : 'bg-transparent',
                    )}
                  />
                  <Icon
                    size={16}
                    className={cn(
                      'shrink-0 transition',
                      active ? 'text-[#79cfff]' : 'text-[#6d6d6d] group-hover:text-ink-muted',
                    )}
                  />
                  <span className="hidden min-w-0 flex-1 lg:block">
                    <span className="block truncate font-medium">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-[#6b6b6b]">
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>

          <details
            className="group/tools mt-5 hidden rounded-[14px] border border-[#1f1f1f] bg-[#0c0c0c] p-2 lg:block"
            open={secondaryActive}
          >
            <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-[10px] px-2 text-[12px] font-medium text-ink-muted transition hover:bg-[#121212] hover:text-ink [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Sparkles size={13} className="text-[#777]" />
                Tools
              </span>
              <span className="rounded-full border border-[#2a2a2a] px-2 py-0.5 text-[10px] text-[#777]">
                {SECONDARY_NAV.length}
              </span>
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {SECONDARY_NAV.map((item) => {
                const Icon = item.icon;
                const active = hasClientPathname && navItemMatches(clientPathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex min-h-10 items-center gap-2 rounded-[10px] border px-2.5 py-2 text-[11px] font-medium transition',
                      active
                        ? 'border-[#285f8a] bg-[#082235] text-[#bde8ff]'
                        : 'border-transparent bg-[#111] text-[#8b8b8b] hover:border-[#2a2a2a] hover:text-ink',
                    )}
                  >
                    <Icon
                      size={13}
                      className={cn(
                        'shrink-0',
                        active ? 'text-[#79cfff]' : 'text-[#666] group-hover:text-ink-muted',
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </details>
        </div>
      </nav>

      <div className="border-t border-[#1b1b1b] px-2 py-4 lg:px-4">
        <div className="mb-3 hidden rounded-[14px] border border-[#232323] bg-[#101010] p-3 lg:block">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#22c55e]/12 text-[#86efac] ring-1 ring-[#22c55e]/25">
              <CheckCircle2 size={13} />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-ink">
                {demoMode ? 'Demo workspace' : 'Approval gates on'}
              </p>
              <p className="truncate text-[11px] text-[#777]">
                {demoMode ? 'No paid APIs or real posts' : 'Review rooms ready'}
              </p>
            </div>
          </div>
        </div>
        <Link
          href={SETTINGS_NAV.href}
          title={SETTINGS_NAV.label}
          className={cn(
            'mb-3 flex h-10 items-center justify-center gap-3 rounded-[12px] px-3 text-[13px] transition lg:justify-start',
            settingsActive
              ? 'bg-[#151515] text-ink ring-1 ring-[#2c2c2c]'
              : 'text-ink-muted hover:bg-[#111] hover:text-ink',
          )}
        >
          <SettingsIcon
            size={15}
            className={settingsActive ? 'text-[#79cfff]' : 'text-[#6d6d6d]'}
          />
          <span className="hidden truncate lg:inline">{SETTINGS_NAV.label}</span>
        </Link>
        {userEmail ? (
          <div className="flex items-center justify-center gap-2 lg:justify-between">
            <span
              className="hidden truncate text-[12px] text-ink-muted lg:inline"
              title={userEmail}
            >
              {userEmail}
            </span>
            {demoMode ? null : (
              <form action="/auth/sign-out" method="post">
                <button
                  type="submit"
                  className="rounded-full p-1.5 text-ink-muted transition hover:bg-surface-1 hover:text-ink"
                  aria-label="Sign out"
                >
                  <LogOut size={13} />
                </button>
              </form>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-[#666]">workspace locked</span>
        )}
      </div>
    </aside>
  );
}
