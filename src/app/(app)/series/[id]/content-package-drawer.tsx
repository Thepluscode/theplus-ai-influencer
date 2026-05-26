'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Calendar,
  Check,
  Copy,
  FileText,
  Images,
  Link2,
  Mail,
  SearchCheck,
  Send,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { CarouselSlide, ContentPackage, PlanItem } from '@/lib/series-planner';
import { cn } from '@/lib/utils';
import {
  createCarouselCalendarDraftAction,
  generateCarouselAssetsAction,
  sendCarouselPackageToReviewAction,
  scheduleCarouselRecommendedSlotAction,
  type CalendarDraftState,
  type CarouselAssetsState,
  type RecommendedScheduleState,
  type ReviewLinkState,
} from './actions';

type ModelPreview = {
  name: string;
  portraitUrl: string;
};

type SectionKey = 'carousel' | 'script' | 'linkedin' | 'email' | 'blog';

const SECTIONS: Array<{ key: SectionKey; label: string; icon: LucideIcon }> = [
  { key: 'carousel', label: 'Carousel', icon: Images },
  { key: 'script', label: 'Script', icon: Video },
  { key: 'linkedin', label: 'LinkedIn', icon: FileText },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'blog', label: 'Blog + AEO', icon: SearchCheck },
];

export function ContentPackageDrawer({
  planId,
  itemIndex,
  item,
  pkg,
  model,
  createPostHref,
  initialReviewHref,
}: {
  planId: string;
  itemIndex: number;
  item: PlanItem;
  pkg: ContentPackage;
  model: ModelPreview | null;
  createPostHref: string;
  initialReviewHref?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>('carousel');
  const [copied, setCopied] = useState<string | null>(null);
  const [assetState, assetAction, assetPending] = useActionState<CarouselAssetsState, FormData>(
    generateCarouselAssetsAction,
    { status: 'idle' },
  );
  const [calendarState, calendarAction, calendarPending] = useActionState<
    CalendarDraftState,
    FormData
  >(createCarouselCalendarDraftAction, { status: 'idle' });
  const [scheduleState, scheduleAction, schedulePending] = useActionState<
    RecommendedScheduleState,
    FormData
  >(scheduleCarouselRecommendedSlotAction, { status: 'idle' });
  const [reviewState, reviewAction, reviewPending] = useActionState<ReviewLinkState, FormData>(
    sendCarouselPackageToReviewAction,
    { status: 'idle' },
  );
  const linkedinCopy = pkg.linkedinPost;
  const emailCopy = useMemo(
    () => `Subject: ${pkg.email.subject}\nPreview: ${pkg.email.preview}\n\n${pkg.email.body}`,
    [pkg.email.body, pkg.email.preview, pkg.email.subject],
  );
  const readyCount = pkg.carouselSlides.filter((slide) => slide.asset?.status === 'ready').length;
  const failedCount = pkg.carouselSlides.filter((slide) => slide.asset?.status === 'failed').length;
  const allReady = pkg.carouselSlides.length > 0 && readyCount === pkg.carouselSlides.length;
  const assetMode = allReady ? 'regenerate' : 'missing';
  const reviewPostId = reviewState.status === 'ready' ? reviewState.postId : null;
  const calendarDraftPostId =
    calendarState.status === 'saved'
      ? calendarState.postId
      : (pkg.calendarDraft?.postId ?? reviewPostId);
  const scheduledPostId =
    scheduleState.status === 'scheduled' || scheduleState.status === 'partial'
      ? scheduleState.postId
      : (pkg.scheduledPost?.postId ?? null);
  const reviewToken =
    reviewState.status === 'ready' ? reviewState.token : (pkg.reviewLink?.token ?? null);
  const reviewHref = reviewToken ? `/p/${reviewToken}` : (initialReviewHref ?? null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => (current === label ? null : current)), 1600);
    } catch {
      setCopied('Copy unavailable');
      window.setTimeout(() => setCopied(null), 1600);
    }
  }

  function openSection(section: SectionKey) {
    setActiveSection(section);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => openSection('carousel')}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[#262626] bg-surface-2 px-4 text-[12px] font-medium text-ink transition hover:border-[#0099ff]/50"
      >
        <FileText size={11} />
        Open package
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close package drawer"
            className="absolute inset-0 cursor-default bg-black/72 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-dvh w-full max-w-[780px] flex-col border-l border-[#262626] bg-[#080808] shadow-[-30px_0_80px_rgba(0,0,0,0.42)]">
            <header className="border-b border-[#1b1b1b] px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="framer-eyebrow">{pkg.style.replace(/_/g, ' ')} package</p>
                  <h2 className="mt-2 text-[20px] font-medium leading-tight text-ink">
                    {item.theme}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-ink-muted">
                    {item.brief}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#262626] bg-surface-2 text-ink-muted transition hover:border-[#444] hover:text-ink"
                  aria-label="Close package drawer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <ActionLink href={createPostHref} icon={Send} label="Create social post" />
                <CalendarDraftAction
                  action={calendarAction}
                  pending={calendarPending}
                  planId={planId}
                  itemIndex={itemIndex}
                  readyCount={readyCount}
                  draftPostId={calendarDraftPostId}
                />
                <RecommendedScheduleAction
                  action={scheduleAction}
                  pending={schedulePending}
                  planId={planId}
                  itemIndex={itemIndex}
                  readyCount={readyCount}
                  scheduledPostId={scheduledPostId}
                />
                <CarouselAssetAction
                  action={assetAction}
                  pending={assetPending}
                  planId={planId}
                  itemIndex={itemIndex}
                  mode={assetMode}
                  disabled={!model}
                  readyCount={readyCount}
                  slideCount={pkg.carouselSlides.length}
                  failedCount={failedCount}
                />
              </div>
              <PackageStatusRail
                assetsReady={readyCount > 0}
                drafted={Boolean(calendarDraftPostId)}
                scheduled={Boolean(scheduledPostId)}
                reviewReady={Boolean(reviewHref)}
              />
              <div className="mt-2">
                <ReviewAction
                  action={reviewAction}
                  pending={reviewPending}
                  planId={planId}
                  itemIndex={itemIndex}
                  readyCount={readyCount}
                  reviewHref={reviewHref}
                />
              </div>
              <AssetStateMessage state={assetState} />
              <CalendarStateMessage state={calendarState} />
              <ScheduleStateMessage state={scheduleState} />
              <ReviewStateMessage state={reviewState} reviewHref={reviewHref} />
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <ActionButton
                  icon={Copy}
                  label={copied === 'LinkedIn' ? 'LinkedIn copied' : 'Copy LinkedIn'}
                  onClick={() => copyText('LinkedIn', linkedinCopy)}
                  done={copied === 'LinkedIn'}
                />
                <ActionButton
                  icon={Copy}
                  label={copied === 'Email' ? 'Email copied' : 'Copy email'}
                  onClick={() => copyText('Email', emailCopy)}
                  done={copied === 'Email'}
                />
                <ActionButton
                  icon={SearchCheck}
                  label="Open blog draft"
                  onClick={() => setActiveSection('blog')}
                />
              </div>
            </header>

            <div className="border-b border-[#1b1b1b] px-4 py-3 sm:px-5">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {SECTIONS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveSection(key)}
                    className={cn(
                      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition',
                      activeSection === key
                        ? 'border-[#0099ff]/50 bg-[#0099ff]/12 text-[#79cfff]'
                        : 'border-[#262626] bg-surface-2 text-ink-muted hover:border-[#444] hover:text-ink',
                    )}
                  >
                    <Icon size={11} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {activeSection === 'carousel' ? (
                <CarouselSection pkg={pkg} model={model} pending={assetPending} />
              ) : null}
              {activeSection === 'script' ? <ScriptSection pkg={pkg} /> : null}
              {activeSection === 'linkedin' ? (
                <LongCopySection
                  icon={FileText}
                  title="LinkedIn post"
                  body={pkg.linkedinPost}
                  onCopy={() => copyText('LinkedIn', linkedinCopy)}
                  copied={copied === 'LinkedIn'}
                />
              ) : null}
              {activeSection === 'email' ? (
                <EmailSection
                  pkg={pkg}
                  onCopy={() => copyText('Email', emailCopy)}
                  copied={copied === 'Email'}
                />
              ) : null}
              {activeSection === 'blog' ? <BlogSection pkg={pkg} /> : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function ReviewAction({
  action,
  pending,
  planId,
  itemIndex,
  readyCount,
  reviewHref,
}: {
  action: (payload: FormData) => void;
  pending: boolean;
  planId: string;
  itemIndex: number;
  readyCount: number;
  reviewHref: string | null;
}) {
  if (reviewHref) {
    return <ActionLink href={reviewHref} icon={Link2} label="Open review link" />;
  }

  return (
    <form action={action}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="itemIndex" value={itemIndex} />
      <button
        type="submit"
        disabled={pending || readyCount === 0}
        className={cn(
          'inline-flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border px-3 text-[12px] font-medium transition',
          pending
            ? 'border-[#22c55e]/35 bg-[#22c55e]/12 text-[#86efac]'
            : 'border-[#262626] bg-surface-2 text-ink hover:border-[#22c55e]/45',
          readyCount === 0 && 'cursor-not-allowed opacity-50 hover:border-[#262626]',
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <Link2 size={13} />
          {pending
            ? 'Preparing review link'
            : readyCount === 0
              ? 'Generate assets first'
              : 'Send to review'}
        </span>
        {pending ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#86efac]" />
        ) : (
          <ArrowUpRight size={11} className="text-[#666]" />
        )}
      </button>
    </form>
  );
}

function CalendarDraftAction({
  action,
  pending,
  planId,
  itemIndex,
  readyCount,
  draftPostId,
}: {
  action: (payload: FormData) => void;
  pending: boolean;
  planId: string;
  itemIndex: number;
  readyCount: number;
  draftPostId: string | null;
}) {
  if (draftPostId) {
    return <ActionLink href="/calendar" icon={Calendar} label="Open calendar draft" />;
  }

  return (
    <form action={action}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="itemIndex" value={itemIndex} />
      <button
        type="submit"
        disabled={pending || readyCount === 0}
        className={cn(
          'inline-flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border px-3 text-[12px] font-medium transition',
          pending
            ? 'border-[#0099ff]/40 bg-[#0099ff]/12 text-[#79cfff]'
            : 'border-[#262626] bg-surface-2 text-ink hover:border-[#0099ff]/50',
          readyCount === 0 && 'cursor-not-allowed opacity-50 hover:border-[#262626]',
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={13} />
          {pending
            ? 'Creating draft'
            : readyCount === 0
              ? 'Generate assets first'
              : 'Create calendar draft'}
        </span>
        {pending ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#79cfff]" />
        ) : (
          <ArrowUpRight size={11} className="text-[#666]" />
        )}
      </button>
    </form>
  );
}

function RecommendedScheduleAction({
  action,
  pending,
  planId,
  itemIndex,
  readyCount,
  scheduledPostId,
}: {
  action: (payload: FormData) => void;
  pending: boolean;
  planId: string;
  itemIndex: number;
  readyCount: number;
  scheduledPostId: string | null;
}) {
  if (scheduledPostId) {
    return <ActionLink href="/calendar" icon={Calendar} label="Open scheduled post" />;
  }

  return (
    <form action={action}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="itemIndex" value={itemIndex} />
      <button
        type="submit"
        disabled={pending || readyCount === 0}
        className={cn(
          'inline-flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border px-3 text-[12px] font-medium transition',
          pending
            ? 'border-[#0099ff]/40 bg-[#0099ff]/12 text-[#79cfff]'
            : 'border-[#262626] bg-surface-2 text-ink hover:border-[#0099ff]/50',
          readyCount === 0 && 'cursor-not-allowed opacity-50 hover:border-[#262626]',
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={13} />
          {pending ? 'Scheduling' : readyCount === 0 ? 'Generate first' : 'Schedule recommended'}
        </span>
        {pending ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#79cfff]" />
        ) : (
          <ArrowUpRight size={11} className="text-[#666]" />
        )}
      </button>
    </form>
  );
}

function CarouselAssetAction({
  action,
  pending,
  planId,
  itemIndex,
  mode,
  disabled,
  readyCount,
  slideCount,
  failedCount,
}: {
  action: (payload: FormData) => void;
  pending: boolean;
  planId: string;
  itemIndex: number;
  mode: 'missing' | 'regenerate';
  disabled: boolean;
  readyCount: number;
  slideCount: number;
  failedCount: number;
}) {
  const label = pending
    ? 'Generating assets'
    : mode === 'regenerate'
      ? 'Regenerate carousel assets'
      : failedCount > 0
        ? 'Retry failed assets'
        : readyCount > 0
          ? `Generate remaining assets`
          : 'Generate carousel assets';
  return (
    <form action={action}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="itemIndex" value={itemIndex} />
      <input type="hidden" name="mode" value={mode} />
      <button
        type="submit"
        disabled={pending || disabled || slideCount === 0}
        className={cn(
          'inline-flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border px-3 text-[12px] font-medium transition',
          pending
            ? 'border-[#0099ff]/40 bg-[#0099ff]/12 text-[#79cfff]'
            : 'border-[#262626] bg-surface-2 text-ink hover:border-[#0099ff]/50',
          (disabled || slideCount === 0) && 'cursor-not-allowed opacity-50 hover:border-[#262626]',
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <Images size={13} />
          {label}
        </span>
        {pending ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#79cfff]" />
        ) : (
          <ArrowUpRight size={11} className="text-[#666]" />
        )}
      </button>
    </form>
  );
}

function PackageStatusRail({
  assetsReady,
  drafted,
  scheduled,
  reviewReady,
}: {
  assetsReady: boolean;
  drafted: boolean;
  scheduled: boolean;
  reviewReady: boolean;
}) {
  const steps = [
    { label: 'Assets ready', active: assetsReady },
    { label: 'Drafted', active: drafted },
    { label: 'Scheduled', active: scheduled },
    { label: 'Review link', active: reviewReady },
  ];
  return (
    <div className="mt-3 grid gap-1.5 rounded-[12px] border border-[#1f1f1f] bg-black/24 p-2 sm:grid-cols-4">
      {steps.map((step, index) => (
        <div
          key={step.label}
          className={cn(
            'flex min-h-9 items-center gap-2 rounded-[9px] px-2.5 py-2 text-[11px] font-medium transition',
            step.active
              ? 'bg-[#22c55e]/12 text-[#86efac] ring-1 ring-[#22c55e]/25'
              : 'bg-surface-2 text-[#666] ring-1 ring-[#262626]',
          )}
        >
          <span
            className={cn(
              'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]',
              step.active ? 'bg-[#22c55e] text-black' : 'bg-[#1a1a1a] text-[#777]',
            )}
          >
            {step.active ? <Check size={11} /> : index + 1}
          </span>
          <span className="truncate">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function AssetStateMessage({ state }: { state: CarouselAssetsState }) {
  if (state.status === 'idle') return null;
  if (state.status === 'insufficient_credits') {
    return (
      <p className="mt-2 rounded-[10px] border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-3 py-2 text-[12px] text-[#facc15]">
        Not enough credits: {state.balance} available, {state.required} required.
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p className="mt-2 rounded-[10px] border border-[#ef4444]/25 bg-[#ef4444]/10 px-3 py-2 text-[12px] text-[#fca5a5]">
        {state.error}
      </p>
    );
  }
  return (
    <p className="mt-2 rounded-[10px] border border-[#22c55e]/25 bg-[#22c55e]/10 px-3 py-2 text-[12px] text-[#86efac]">
      {state.generated} asset{state.generated === 1 ? '' : 's'} ready
      {state.failed > 0 ? ` · ${state.failed} failed and credits were refunded` : ''}.
    </p>
  );
}

function ReviewStateMessage({
  state,
  reviewHref,
}: {
  state: ReviewLinkState;
  reviewHref: string | null;
}) {
  if (state.status === 'idle') return null;
  if (state.status === 'error') {
    return (
      <p className="mt-2 rounded-[10px] border border-[#ef4444]/25 bg-[#ef4444]/10 px-3 py-2 text-[12px] text-[#fca5a5]">
        {state.error}
      </p>
    );
  }
  return (
    <p className="mt-2 rounded-[10px] border border-[#22c55e]/25 bg-[#22c55e]/10 px-3 py-2 text-[12px] text-[#86efac]">
      {state.reused ? 'Existing review link ready.' : 'Review link ready.'}{' '}
      {reviewHref ? (
        <Link href={reviewHref} className="font-medium underline underline-offset-2">
          Open review link
        </Link>
      ) : null}
    </p>
  );
}

function ActionLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-between gap-2 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[12px] font-medium text-ink transition hover:border-[#0099ff]/50"
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon size={13} />
        {label}
      </span>
      <ArrowUpRight size={11} className="text-[#666]" />
    </Link>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  done = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  done?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border px-3 text-[12px] font-medium transition',
        done
          ? 'border-[#22c55e]/30 bg-[#22c55e]/12 text-[#86efac]'
          : 'border-[#262626] bg-surface-2 text-ink hover:border-[#444]',
      )}
    >
      {done ? <Check size={13} /> : <Icon size={13} />}
      {label}
    </button>
  );
}

function CalendarStateMessage({ state }: { state: CalendarDraftState }) {
  if (state.status === 'idle') return null;
  if (state.status === 'error') {
    return (
      <p className="mt-2 rounded-[10px] border border-[#ef4444]/25 bg-[#ef4444]/10 px-3 py-2 text-[12px] text-[#fca5a5]">
        {state.error}
      </p>
    );
  }
  return (
    <p className="mt-2 rounded-[10px] border border-[#22c55e]/25 bg-[#22c55e]/10 px-3 py-2 text-[12px] text-[#86efac]">
      {state.reused ? 'Existing calendar draft ready.' : 'Calendar draft created.'}{' '}
      <Link href="/calendar" className="font-medium underline underline-offset-2">
        Open calendar
      </Link>
    </p>
  );
}

function ScheduleStateMessage({ state }: { state: RecommendedScheduleState }) {
  if (state.status === 'idle') return null;
  if (state.status === 'error') {
    return (
      <p className="mt-2 rounded-[10px] border border-[#ef4444]/25 bg-[#ef4444]/10 px-3 py-2 text-[12px] text-[#fca5a5]">
        {state.error}
      </p>
    );
  }
  if (state.status === 'partial') {
    return (
      <p className="mt-2 rounded-[10px] border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-3 py-2 text-[12px] text-[#facc15]">
        Scheduled locally for {formatDateTime(state.scheduledFor)}. {state.warning}{' '}
        <Link href="/calendar" className="font-medium underline underline-offset-2">
          Open calendar
        </Link>
      </p>
    );
  }
  return (
    <p className="mt-2 rounded-[10px] border border-[#22c55e]/25 bg-[#22c55e]/10 px-3 py-2 text-[12px] text-[#86efac]">
      {state.reused ? 'Existing scheduled post ready.' : 'Scheduled recommended slot'} for{' '}
      {formatDateTime(state.scheduledFor)}
      {state.pushedToZernio ? ' · pushed to Zernio' : ''}.{' '}
      <Link href="/calendar" className="font-medium underline underline-offset-2">
        Open calendar
      </Link>
    </p>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function CarouselSection({
  pkg,
  model,
  pending,
}: {
  pkg: ContentPackage;
  model: ModelPreview | null;
  pending: boolean;
}) {
  const readyCount = pkg.carouselSlides.filter((slide) => slide.asset?.status === 'ready').length;
  return (
    <section className="grid gap-4">
      <SectionHeader
        icon={Images}
        title="Carousel slides"
        meta={
          readyCount > 0
            ? `${readyCount}/${pkg.carouselSlides.length} rendered`
            : pkg.visualMode.replace(/_/g, ' ')
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {pkg.carouselSlides.map((slide, index) => (
          <FullSlideCard
            key={`${slide.title}-${index}`}
            slide={slide}
            index={index}
            model={model}
            pending={pending}
          />
        ))}
      </div>
    </section>
  );
}

function FullSlideCard({
  slide,
  index,
  model,
  pending,
}: {
  slide: CarouselSlide;
  index: number;
  model: ModelPreview | null;
  pending: boolean;
}) {
  const showFace = model && slide.facePlacement !== 'none';
  const asset = slide.asset;
  const isReady = asset?.status === 'ready' && asset.url;
  return (
    <article className="overflow-hidden rounded-[12px] border border-[#262626] bg-surface-1">
      <div className="relative aspect-[4/5] bg-surface-2 p-4">
        {isReady ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/20 to-transparent" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(0,153,255,0.26),transparent_35%)]" />
            {showFace ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={model.portraitUrl}
                  alt=""
                  className="absolute bottom-0 right-0 h-[76%] w-[48%] object-cover opacity-90"
                />
                <span className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-transparent via-black/10 to-[#111]" />
              </>
            ) : null}
          </>
        )}
        <div
          className={cn(
            'relative flex h-full flex-col',
            isReady ? 'justify-end' : showFace ? 'max-w-[62%]' : 'max-w-full',
          )}
        >
          <SlideStatus slide={slide} index={index} pending={pending && !isReady} />
          <h3 className="mt-3 text-[18px] font-medium leading-tight text-ink">{slide.title}</h3>
          <p className="mt-3 text-[13px] leading-[1.45] text-ink-muted">{slide.copy}</p>
        </div>
      </div>
      <div className="grid gap-1.5 p-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#666]">
          Visual brief
        </p>
        <p className="text-[12px] leading-[1.45] text-ink-muted">{slide.visualBrief}</p>
        {asset?.status === 'ready' && asset.generationId ? (
          <p className="truncate text-[10px] uppercase tracking-[0.12em] text-[#666]">
            Luma {asset.generationId}
          </p>
        ) : null}
        {asset?.status === 'failed' || asset?.lastError ? (
          <p className="rounded-[8px] border border-[#ef4444]/25 bg-[#ef4444]/10 px-2 py-1.5 text-[11px] leading-[1.35] text-[#fca5a5]">
            {asset.lastError ?? asset.error}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function SlideStatus({
  slide,
  index,
  pending,
}: {
  slide: CarouselSlide;
  index: number;
  pending: boolean;
}) {
  const asset = slide.asset;
  const label = pending
    ? 'Generating'
    : asset?.status === 'ready'
      ? 'Ready'
      : asset?.status === 'failed'
        ? 'Failed'
        : 'Not rendered';
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider',
        pending
          ? 'border-[#0099ff]/35 bg-[#0099ff]/12 text-[#79cfff]'
          : asset?.status === 'ready'
            ? 'border-[#22c55e]/30 bg-[#22c55e]/12 text-[#86efac]'
            : asset?.status === 'failed'
              ? 'border-[#ef4444]/30 bg-[#ef4444]/12 text-[#fca5a5]'
              : 'border-[#262626] bg-black/25 text-[#79cfff]',
      )}
    >
      Slide {index + 1} / {label}
    </span>
  );
}

function ScriptSection({ pkg }: { pkg: ContentPackage }) {
  return (
    <section className="grid gap-4">
      <SectionHeader icon={Video} title="Filming script" meta={pkg.style.replace(/_/g, ' ')} />
      <div className="rounded-[12px] border border-[#262626] bg-surface-1 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#666]">Hook</p>
        <p className="mt-2 text-[18px] font-medium leading-tight text-ink">
          {pkg.filmingScript.hook}
        </p>
      </div>
      <TwoColumnList title="Beats" items={pkg.filmingScript.beats} />
      <TwoColumnList title="B-roll" items={pkg.filmingScript.broll} />
      <div className="rounded-[12px] border border-[#262626] bg-[#0099ff]/10 p-4 ring-1 ring-[#0099ff]/20">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#79cfff]">CTA</p>
        <p className="mt-2 text-[14px] leading-[1.5] text-ink">{pkg.filmingScript.cta}</p>
      </div>
    </section>
  );
}

function EmailSection({
  pkg,
  onCopy,
  copied,
}: {
  pkg: ContentPackage;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <section className="grid gap-4">
      <SectionHeader icon={Mail} title="Email draft" meta="subject + preview + body" />
      <div className="rounded-[12px] border border-[#262626] bg-surface-1 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#666]">Subject</p>
        <p className="mt-2 text-[18px] font-medium leading-tight text-ink">{pkg.email.subject}</p>
        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-[#666]">
          Preview
        </p>
        <p className="mt-2 text-[13px] leading-[1.45] text-ink-muted">{pkg.email.preview}</p>
      </div>
      <LongCopySection
        icon={Mail}
        title="Body"
        body={pkg.email.body}
        onCopy={onCopy}
        copied={copied}
      />
    </section>
  );
}

function BlogSection({ pkg }: { pkg: ContentPackage }) {
  return (
    <section className="grid gap-4">
      <SectionHeader icon={SearchCheck} title="SEO / AEO blog draft" meta={pkg.blog.slug} />
      <div className="rounded-[12px] border border-[#262626] bg-surface-1 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#666]">Title</p>
        <h3 className="mt-2 text-[20px] font-medium leading-tight text-ink">{pkg.blog.title}</h3>
        <p className="mt-3 text-[13px] leading-[1.45] text-ink-muted">{pkg.blog.metaDescription}</p>
      </div>
      <TwoColumnList title="Outline" items={pkg.blog.outline} />
      <TwoColumnList title="AEO questions" items={pkg.blog.aeoQuestions} />
      <div className="rounded-[12px] border border-[#262626] bg-surface-1 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#666]">
          SEO keywords
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pkg.seoKeywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] capitalize text-ink-muted ring-1 ring-[#262626]"
            >
              {keyword}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-[12px] border border-[#262626] bg-[#22c55e]/10 p-4 ring-1 ring-[#22c55e]/20">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#86efac]">
          Conversion CTA
        </p>
        <p className="mt-2 text-[14px] leading-[1.5] text-ink">{pkg.blog.conversionCta}</p>
      </div>
    </section>
  );
}

function LongCopySection({
  icon,
  title,
  body,
  onCopy,
  copied,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  onCopy: () => void;
  copied: boolean;
}) {
  const Icon = icon;
  return (
    <section className="rounded-[12px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          <Icon size={12} />
          {title}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-2 px-3 text-[11px] font-medium text-ink transition hover:border-[#444]"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-[1.6] text-ink-muted">{body}</p>
    </section>
  );
}

function TwoColumnList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[12px] border border-[#262626] bg-surface-1 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#666]">{title}</p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="flex gap-2 text-[13px] leading-[1.45] text-ink-muted"
          >
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0099ff]/12 text-[10px] text-[#79cfff] ring-1 ring-[#0099ff]/25">
              {index + 1}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  meta,
}: {
  icon: LucideIcon;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#0099ff]/12 text-[#79cfff] ring-1 ring-[#0099ff]/25">
          <Icon size={14} />
        </span>
        <h3 className="text-[18px] font-medium text-ink">{title}</h3>
      </div>
      <span className="rounded-full border border-[#262626] bg-surface-2 px-3 py-1 text-[10px] uppercase tracking-wider text-[#666]">
        {meta}
      </span>
    </div>
  );
}
