import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bot,
  Calendar,
  CalendarRange,
  Film,
  Home,
  ImageIcon,
  Inbox,
  Layers,
  LinkIcon,
  MessageCircle,
  PlusSquare,
  Settings,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

export type AppNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  section: string;
  description: string;
  icon: LucideIcon;
  aliases?: readonly string[];
};

export const PRIMARY_NAV: readonly AppNavItem[] = [
  {
    href: '/content-os',
    label: 'Content OS',
    section: 'Workflow',
    description: 'Extract → repackage → distribute',
    icon: Layers,
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    section: 'Command',
    description: 'Workspace overview',
    icon: Home,
  },
  {
    href: '/studio',
    label: 'Studio',
    section: 'Persona ops',
    description: 'Influencer assets',
    icon: ImageIcon,
  },
  {
    href: '/create-post',
    label: 'Create',
    section: 'Production',
    description: 'Build a post',
    icon: PlusSquare,
  },
  {
    href: '/series',
    label: 'Campaigns',
    section: 'Planning',
    description: 'Content engine',
    icon: CalendarRange,
    aliases: ['/content-engine'],
  },
  {
    href: '/calendar',
    label: 'Calendar',
    section: 'Scheduling',
    description: 'Publish queue',
    icon: Calendar,
  },
  {
    href: '/storyboard',
    label: 'Review',
    section: 'Review room',
    description: 'Storyboard approvals',
    icon: Film,
  },
];

export const SECONDARY_NAV: readonly AppNavItem[] = [
  {
    href: '/agents',
    label: 'Agents',
    section: 'Orchestration',
    description: 'Creative workers',
    icon: Bot,
  },
  {
    href: '/trends',
    label: 'Trends',
    section: 'Discovery',
    description: 'Market signals',
    icon: TrendingUp,
  },
  {
    href: '/analytics',
    label: 'Analytics',
    section: 'Performance',
    description: 'Growth metrics',
    icon: BarChart3,
  },
  {
    href: '/comments',
    label: 'Comments',
    section: 'Community',
    description: 'Review replies',
    icon: MessageCircle,
  },
  {
    href: '/inbox',
    label: 'Inbox',
    section: 'Community',
    description: 'DM triage',
    icon: Inbox,
  },
  {
    href: '/safety',
    label: 'Safety',
    section: 'Governance',
    description: 'Brand checks',
    icon: ShieldCheck,
  },
  {
    href: '/accounts',
    label: 'Accounts',
    section: 'Distribution',
    description: 'Channels',
    icon: LinkIcon,
  },
];

export const SETTINGS_NAV: AppNavItem = {
  href: '/settings',
  label: 'Settings',
  section: 'Workspace',
  description: 'Controls',
  icon: Settings,
};

const ROUTE_META: readonly AppNavItem[] = [
  ...PRIMARY_NAV,
  ...SECONDARY_NAV,
  SETTINGS_NAV,
  {
    href: '/series/new',
    label: 'New Campaign',
    section: 'Planning',
    description: 'Campaign setup',
    icon: CalendarRange,
  },
  {
    href: '/storyboard/new',
    label: 'New Storyboard',
    section: 'Review room',
    description: 'Storyboard setup',
    icon: Film,
  },
  {
    href: '/studio/new',
    label: 'New Influencer',
    section: 'Persona ops',
    description: 'Persona setup',
    icon: ImageIcon,
  },
  {
    href: '/content-engine/new',
    label: 'New Content Engine',
    section: 'Planning',
    description: 'Campaign setup',
    icon: CalendarRange,
  },
];

export function navItemMatches(pathname: string, item: AppNavItem) {
  const candidates = [item.href, ...(item.aliases ?? [])];
  return candidates.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

export function getRouteMeta(pathname: string) {
  const ordered = [...ROUTE_META].sort((a, b) => b.href.length - a.href.length);
  return ordered.find((item) => navItemMatches(pathname, item)) ?? PRIMARY_NAV[0];
}
