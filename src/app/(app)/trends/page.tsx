import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowUpRight, Flame, Send, TrendingUp } from 'lucide-react';
import {
  CATEGORIES,
  CATEGORY_EMOJI,
  KIND_EMOJI,
  TRENDS,
  filterTrends,
  type Trend,
  type TrendCategory,
} from '@/lib/trends/catalog';
import { cn } from '@/lib/utils';

interface PageProps {
  searchParams: Promise<{ category?: string }>;
}

const ALL_CATEGORIES: (TrendCategory | 'all')[] = ['all', ...CATEGORIES];

export default async function TrendsPage({ searchParams }: PageProps) {
  const { category: catParam } = await searchParams;
  const activeCategory: TrendCategory | 'all' =
    catParam && (CATEGORIES as readonly string[]).includes(catParam)
      ? (catParam as TrendCategory)
      : 'all';

  const trends = activeCategory === 'all' ? TRENDS : filterTrends({ category: activeCategory });
  const breakingThisWeek = getBreakingThisWeek(trends);

  return (
    <div className="min-h-full bg-[#070707] text-ink">
      <div className="px-5 py-5 lg:px-6 lg:py-6">
        <header className="mb-6 border-b border-[#1b1b1b] pb-5">
          <p className="framer-eyebrow">Trends</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
            What&apos;s breaking right now.
            <br />
            Brief it before everyone else.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            Curated audios, hooks, formats, and hashtags pulled from this week&apos;s breakout
            content. One-click brief into the Create Post wizard.
          </p>
          {breakingThisWeek.length > 0 ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#0099ff]/30 bg-[#0099ff]/[0.07] px-3 py-1.5 text-[12px] text-[#0099ff]">
              <Flame size={11} />
              <span className="font-medium text-ink">{breakingThisWeek.length}</span> trends new
              this week
            </p>
          ) : null}
        </header>

        {/* Category filter */}
        <nav className="mb-6 -mx-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-2 pb-1">
          {ALL_CATEGORIES.map((c) => (
            <Link
              key={c}
              href={c === 'all' ? '/trends' : `/trends?category=${c}`}
              scroll={false}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-medium capitalize transition',
                activeCategory === c
                  ? 'border-[#0099ff] bg-[#0099ff]/15 text-[#0099ff]'
                  : 'border-[#262626] bg-surface-1 text-ink-muted hover:border-[#444] hover:text-ink',
              )}
            >
              {c !== 'all' ? <span>{CATEGORY_EMOJI[c]}</span> : <TrendingUp size={11} />}
              {c}
            </Link>
          ))}
        </nav>

        {trends.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[#262626] bg-surface-1/50 px-6 py-12 text-center">
            <p className="text-[14px] text-ink-muted">
              No trends in this category right now. Try another category.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {trends.map((t) => (
              <TrendCard key={t.id} trend={t} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function getBreakingThisWeek(trends: Trend[]): Trend[] {
  const now = Date.now();
  return trends.filter((t) => now - new Date(t.trendingSince).getTime() < 7 * 24 * 60 * 60 * 1000);
}

// ---------- subcomponents ----------

function TrendCard({ trend }: { trend: Trend }) {
  const since = formatDistanceToNow(new Date(trend.trendingSince), { addSuffix: true });
  return (
    <li className="group relative flex flex-col gap-3 rounded-[16px] border border-[#262626] bg-surface-1 p-5 transition hover:border-[#0099ff]/40">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[#0099ff]/10 px-2 text-[10px] font-medium uppercase tracking-wider text-[#0099ff] ring-1 ring-[#0099ff]/30">
            {KIND_EMOJI[trend.kind]} {trend.kind}
          </span>
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2 text-[10px] font-medium capitalize text-ink-muted ring-1 ring-[#262626]">
            {CATEGORY_EMOJI[trend.category]} {trend.category}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[#666]">{since}</span>
      </header>

      <div>
        <h3 className="text-[16px] font-medium text-ink">{trend.title}</h3>
        <p className="mt-1.5 text-[13px] leading-[1.5] text-ink-muted">{trend.description}</p>
        <p className="mt-2 rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[12px] leading-[1.5] text-ink-muted">
          <Flame size={10} className="-mt-px mr-1 inline text-[#ff7a3d]" />
          <span className="text-[#ff7a3d]">Why now:</span> {trend.why}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wider">
        {trend.platforms.map((p) => (
          <span
            key={p}
            className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2 font-medium capitalize text-ink ring-1 ring-[#262626]"
          >
            {p}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Link
          href={`/create-post?trendId=${trend.id}`}
          className={cn(
            'inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-medium transition',
            'bg-[#0099ff] text-white hover:bg-[#1aa6ff] active:scale-[0.99]',
          )}
        >
          <Send size={12} />
          Brief this trend
          <ArrowUpRight size={12} />
        </Link>
        {trend.source ? (
          <a
            href={trend.source}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[12px] font-medium text-ink transition hover:border-[#0099ff]/50 hover:text-[#0099ff]"
          >
            Example
            <ArrowUpRight size={11} />
          </a>
        ) : null}
      </div>
    </li>
  );
}
