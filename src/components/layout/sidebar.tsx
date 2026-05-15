'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bot,
  Calendar,
  CalendarRange,
  Film,
  Home,
  ImageIcon,
  Inbox,
  LinkIcon,
  LogOut,
  MessageCircle,
  PlusSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_GROUPS = [
  {
    label: 'Operate',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Home },
      { href: '/agents', label: 'Agents', icon: Bot },
      { href: '/studio', label: 'Studio', icon: ImageIcon },
      { href: '/create-post', label: 'Create post', icon: PlusSquare },
      { href: '/storyboard', label: 'Storyboard', icon: Film },
    ],
  },
  {
    label: 'Plan',
    items: [
      { href: '/series', label: 'Series', icon: CalendarRange },
      { href: '/trends', label: 'Trends', icon: TrendingUp },
      { href: '/calendar', label: 'Calendar', icon: Calendar },
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Review',
    items: [
      { href: '/comments', label: 'Comments', icon: MessageCircle },
      { href: '/inbox', label: 'Inbox', icon: Inbox },
      { href: '/safety', label: 'Safety', icon: ShieldCheck },
      { href: '/accounts', label: 'Accounts', icon: LinkIcon },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
] as const;

export function Sidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-dvh w-[72px] shrink-0 flex-col border-r border-[#171717] bg-[#070707] text-ink-muted lg:w-[248px]">
      <div className="border-b border-[#171717] px-3 py-4 lg:px-4">
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2.5 text-[14px] font-medium tracking-tight text-ink lg:justify-start"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-black">
            <Sparkles size={14} />
          </span>
          <span className="hidden min-w-0 lg:block">
            <span className="block leading-tight">ThePlus.AI</span>
            <span className="block text-[11px] font-normal uppercase tracking-[0.18em] text-[#666]">
              Influencer OS
            </span>
          </span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-4 lg:px-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 hidden px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#555] lg:block">
              {group.label}
            </p>
            <div className="grid gap-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'group relative flex h-9 items-center justify-center gap-3 rounded-[10px] px-3 text-[13px] transition lg:justify-start',
                      active
                        ? 'bg-surface-1 text-ink ring-1 ring-[#262626]'
                        : 'text-ink-muted hover:bg-surface-1/70 hover:text-ink',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full transition',
                        active ? 'bg-[#0099ff]' : 'bg-transparent',
                      )}
                    />
                    <Icon
                      size={15}
                      className={cn(
                        'transition',
                        active ? 'text-[#79cfff]' : 'text-[#666] group-hover:text-ink-muted',
                      )}
                    />
                    <span className="hidden truncate lg:inline">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#171717] px-2 py-4 lg:px-4">
        <div className="mb-3 hidden rounded-[12px] border border-[#262626] bg-surface-1 p-3 lg:block">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#666]">
            Review pipeline
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
            <p className="text-[12px] font-medium text-ink">Approval gates on</p>
          </div>
        </div>
        {userEmail ? (
          <div className="flex items-center justify-center gap-2 lg:justify-between">
            <span
              className="hidden truncate text-[12px] text-ink-muted lg:inline"
              title={userEmail}
            >
              {userEmail}
            </span>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="rounded-full p-1.5 text-ink-muted transition hover:bg-surface-1 hover:text-ink"
                aria-label="Sign out"
              >
                <LogOut size={13} />
              </button>
            </form>
          </div>
        ) : (
          <span className="text-[12px] text-[#666]">review room locked</span>
        )}
      </div>
    </aside>
  );
}
