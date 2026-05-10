'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Home, ImageIcon, LinkIcon, PlusSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/studio', label: 'Studio', icon: ImageIcon },
  { href: '/create-post', label: 'Create post', icon: PlusSquare },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/accounts', label: 'Accounts', icon: LinkIcon },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-dvh w-60 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-300">
      <div className="px-6 py-5">
        <Link href="/dashboard" className="text-sm font-semibold tracking-wide text-zinc-100">
          ThePlus.AI <span className="text-zinc-500">Influencer</span>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                active
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-800 px-6 py-4 text-xs text-zinc-600">
        scaffold · sign-out wiring TBD
      </div>
    </aside>
  );
}
