'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckCircle2, CircleDot, ExternalLink, PanelRight } from 'lucide-react';
import { getRouteMeta } from '@/components/layout/nav-config';
import { cn } from '@/lib/utils';

export function AppTopbar({
  credits,
  demoMode = false,
}: {
  credits: ReactNode;
  demoMode?: boolean;
}) {
  const pathname = usePathname();
  const [clientPathname, setClientPathname] = useState('');

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setClientPathname(pathname));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  const route = clientPathname ? getRouteMeta(clientPathname) : null;
  const RouteIcon = route?.icon ?? CircleDot;
  const inReviewMode =
    clientPathname.startsWith('/storyboard') ||
    clientPathname.startsWith('/comments') ||
    clientPathname.startsWith('/inbox');

  return (
    <header className="sticky top-0 z-40 border-b border-[#1b1b1b] bg-[#070707]/88 px-4 py-3 backdrop-blur-xl lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ring-1',
              inReviewMode
                ? 'bg-[#22c55e]/12 text-[#86efac] ring-[#22c55e]/30'
                : 'bg-[#0099ff]/12 text-[#79cfff] ring-[#0099ff]/30',
            )}
          >
            {inReviewMode ? <PanelRight size={15} /> : <RouteIcon size={15} />}
          </span>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
                ThePlus AI Influencer / {route?.section ?? 'Workspace'}
              </p>
              <span className="hidden h-1 w-1 rounded-full bg-[#333] sm:inline-flex" />
              <span className="hidden items-center gap-1 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted sm:inline-flex">
                <CircleDot size={9} className="text-[#0099ff]" />
                Live workspace
              </span>
            </div>
            <h1 className="truncate text-[16px] font-medium tracking-tight text-ink sm:text-[18px]">
              {route?.label ?? 'Workspace'}
            </h1>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden h-8 items-center gap-1.5 rounded-full border border-[#1f3f2a] bg-[#102015] px-3 text-[10px] font-medium uppercase tracking-wider text-[#9bf3b8] md:inline-flex">
            <CheckCircle2 size={11} />
            {demoMode ? 'Demo mode' : 'Review-ready'}
          </span>
          <Link
            href="/storyboard"
            className="hidden h-8 items-center gap-1.5 rounded-full border border-[#2a2a2a] bg-[#101010] px-3 text-[11px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink xl:inline-flex"
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
