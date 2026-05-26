import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowUpRight, CalendarRange, CheckCircle2, Plus, Sparkles } from 'lucide-react';
import { listContentPlans } from '@/lib/content-plans';
import {
  getPlanReviewSummary,
  getPostReviewLinksForPlans,
  type ReviewLinkLookup,
} from '@/lib/content-plan-review-links';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { ContentPlanRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { DeletePlanButton } from './delete-plan-button';

export default async function SeriesIndexPage() {
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let plans: ContentPlanRow[] = [];
  let postReviewLinks: ReviewLinkLookup = new Map();
  let loadError: string | null = null;

  if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        plans = await listContentPlans(ws.id);
        postReviewLinks = await getPostReviewLinksForPlans(ws.id, plans);
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  return (
    <div className="app-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="framer-eyebrow">Content Engine</p>
            <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
              Campaigns, scripts,
              <br />
              carousels, and SEO.
            </h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
              Pick a persona, brief the topics, and generate a full multi-format campaign: face-led
              carousels, short-video scripts, LinkedIn posts, emails, SEO/AEO blogs, and exact
              go-live times.
            </p>
            {loadError ? (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-1.5 text-[12px] text-[#ff5577]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff5577]" />
                {loadError}
              </p>
            ) : null}
          </div>
          <Link
            href="/series/new"
            className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#0099ff] px-4 text-[14px] font-medium text-white shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)] transition hover:bg-[#1aa6ff] active:scale-[0.99]"
          >
            <Plus size={14} />
            New campaign
          </Link>
        </header>

        {plans.length === 0 ? (
          <Link
            href="/series/new"
            className="group block rounded-[16px] border border-dashed border-[#262626] bg-surface-1/50 px-6 py-12 text-center transition hover:border-[#0099ff]/50 hover:bg-surface-1"
          >
            <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0099ff]/15 text-[#0099ff] ring-1 ring-[#0099ff]/30">
              <Sparkles size={16} />
            </span>
            <p className="text-[15px] font-medium text-ink">
              No campaigns yet — generate your first
            </p>
            <p className="mt-1 text-[13px] text-ink-muted">
              10 credits per campaign · runs against any saved persona
            </p>
          </Link>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} postReviewLinks={postReviewLinks} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  postReviewLinks,
}: {
  plan: ContentPlanRow;
  postReviewLinks: ReviewLinkLookup;
}) {
  const items = Array.isArray(plan.items) ? plan.items : [];
  const seed = (plan.seed_inputs ?? {}) as { deliverables?: string[] };
  const review = getPlanReviewSummary(plan, postReviewLinks);
  return (
    <li className="group relative">
      <Link
        href={`/series/${plan.id}`}
        className="group block rounded-[16px] border border-[#262626] bg-surface-1 p-5 transition hover:border-[#0099ff]/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <p
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider',
                  'bg-[#0099ff]/10 text-[#0099ff] ring-1 ring-[#0099ff]/30',
                )}
              >
                <CalendarRange size={10} />
                {plan.goal} · {plan.duration_days}d · {plan.cadence_per_week}/wk
              </p>
              {review.count > 0 ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-[#22c55e]/12 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[#86efac] ring-1 ring-[#22c55e]/30">
                  <CheckCircle2 size={10} />
                  {review.count} review-ready
                </p>
              ) : null}
            </div>
            <h3 className="mt-2 truncate text-[18px] font-medium text-ink" title={plan.name}>
              {plan.name}
            </h3>
            <p className="mt-1 text-[12px] text-ink-muted">
              {items.length} {items.length === 1 ? 'post' : 'posts'} · starts{' '}
              {format(new Date(plan.start_date), 'MMM d')} · created{' '}
              {format(new Date(plan.created_at), 'MMM d')}
            </p>
            {seed.deliverables?.length ? (
              <p className="mt-2 text-[11px] text-[#666]">
                Outputs: {seed.deliverables.map((item) => item.replace(/_/g, ' ')).join(', ')}
              </p>
            ) : null}
          </div>
          <ArrowUpRight size={16} className="shrink-0 text-ink-muted group-hover:text-ink" />
        </div>
      </Link>
      {review.firstHref ? (
        <Link
          href={review.firstHref}
          className="absolute bottom-3 right-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#22c55e]/12 px-3 text-[10px] font-medium uppercase tracking-wider text-[#86efac] ring-1 ring-[#22c55e]/30 transition hover:bg-[#22c55e]/18"
          aria-label={`Open review link for ${plan.name}`}
        >
          Review link
          <ArrowUpRight size={10} />
        </Link>
      ) : null}
      <DeletePlanButton planId={plan.id} />
    </li>
  );
}
