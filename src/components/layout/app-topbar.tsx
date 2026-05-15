'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, CheckCircle2, CircleDot, Clock3, ExternalLink, PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROUTES = [
  { href: '/dashboard', label: 'Dashboard', section: 'Command' },
  { href: '/agents', label: 'Creative Agents', section: 'Orchestration' },
  { href: '/studio', label: 'Studio', section: 'Persona ops' },
  { href: '/create-post', label: 'Create post', section: 'Production' },
  { href: '/storyboard', label: 'Storyboard', section: 'Review room' },
  { href: '/series', label: 'Series', section: 'Planning' },
  { href: '/trends', label: 'Trends', section: 'Discovery' },
  { href: '/calendar', label: 'Calendar', section: 'Scheduling' },
  { href: '/analytics', label: 'Analytics', section: 'Performance' },
  { href: '/comments', label: 'Comments', section: 'Community' },
  { href: '/inbox', label: 'Inbox', section: 'Community' },
  { href: '/safety', label: 'Safety', section: 'Governance' },
  { href: '/accounts', label: 'Accounts', section: 'Distribution' },
  { href: '/settings', label: 'Settings', section: 'Workspace' },
] as const;

export function AppTopbar({ credits }: { credits: ReactNode }) {
  const pathname = usePathname();
  const route =
    ROUTES.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
    ROUTES[0];
  const inReviewMode =
    pathname.startsWith('/storyboard') ||
    pathname.startsWith('/comments') ||
    pathname.startsWith('/inbox');

  return (
    <header className="sticky top-0 z-40 border-b border-[#171717] bg-[#070707]/92 px-4 py-3 backdrop-blur-xl lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1',
              inReviewMode
                ? 'bg-[#22c55e]/12 text-[#86efac] ring-[#22c55e]/30'
                : 'bg-[#0099ff]/12 text-[#79cfff] ring-[#0099ff]/30',
            )}
          >
            {inReviewMode ? <PanelRight size={15} /> : <Activity size={15} />}
          </span>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
                {route.section}
              </p>
              <span className="hidden h-1 w-1 rounded-full bg-[#333] sm:inline-flex" />
              <span className="hidden items-center gap-1 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted sm:inline-flex">
                <CircleDot size={9} className="text-[#0099ff]" />
                Workspace
              </span>
            </div>
            <h1 className="truncate text-[16px] font-medium tracking-tight text-ink sm:text-[18px]">
              {route.label}
            </h1>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden h-8 items-center gap-1.5 rounded-full bg-[#22c55e]/12 px-3 text-[10px] font-medium uppercase tracking-wider text-[#86efac] ring-1 ring-[#22c55e]/30 md:inline-flex">
            <CheckCircle2 size={11} />
            Review-ready
          </span>
          <span className="hidden h-8 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-1 px-3 text-[10px] font-medium uppercase tracking-wider text-ink-muted lg:inline-flex">
            <Clock3 size={11} />
            30fps pipeline
          </span>
          <Link
            href="/storyboard"
            className="hidden h-8 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-1 px-3 text-[11px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink xl:inline-flex"
          >
            Review rooms
            <ExternalLink size={11} />
          </Link>
          {credits}
        </div>
      </div>
    </header>
  );
}
