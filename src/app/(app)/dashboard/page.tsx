import Link from 'next/link';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock3,
  Download,
  ImageIcon,
  MessageSquarePlus,
  PanelRight,
  PlayCircle,
  PlusSquare,
  Share2,
} from 'lucide-react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { listAiModels } from '@/lib/ai-models';
import { listPostsInRange } from '@/lib/posts';
import { formatReviewDecision, type ReviewDecision } from '@/lib/review-approvals-schema';
import { publicEnv, serverEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow, PostRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { getDefaultZernioProfileId, getZernioClient } from '@/lib/zernio';
import { PLATFORMS, type Platform } from '@/types/post';
import { cn } from '@/lib/utils';

export default async function DashboardPage() {
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let userEmail: string | null = null;
  let models: AiModelRow[] = [];
  let scheduled: PostRow[] = [];
  let drafts: PostRow[] = [];
  let loadError: string | null = null;
  let connectedPlatforms: Platform[] = [];

  if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        userEmail = user.email ?? null;
        const ws = await getOrCreateCurrentWorkspace(user);
        const now = new Date();
        const [m, postsInMonth] = await Promise.all([
          listAiModels(ws.id),
          listPostsInRange(ws.id, startOfMonth(now), endOfMonth(now)),
        ]);
        models = m;
        scheduled = postsInMonth.scheduled;
        drafts = postsInMonth.drafts;

        if (serverEnv.ZERNIO_API_KEY) {
          try {
            const profileId = await getDefaultZernioProfileId();
            const accounts = await getZernioClient().listAccounts(profileId);
            const known = new Set(PLATFORMS as readonly string[]);
            const seen = new Set<Platform>();
            for (const a of accounts) {
              const p = a.platform?.toLowerCase();
              if (p && known.has(p)) seen.add(p as Platform);
            }
            connectedPlatforms = Array.from(seen);
          } catch {
            // non-fatal
          }
        }
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unknown Supabase error';
    }
  }

  const modelNamesById: Record<string, string> = Object.fromEntries(
    models.map((m) => [m.id, m.name]),
  );

  const firstName = userEmail?.split('@')[0] ?? null;
  const reviewQueue = [...drafts, ...scheduled]
    .sort((a, b) => {
      const rank = (post: PostRow) =>
        post.review_status === 'needs_changes' ? 0 : post.review_status === 'approved' ? 1 : 2;
      return rank(a) - rank(b) || Date.parse(b.updated_at) - Date.parse(a.updated_at);
    })
    .slice(0, 8);
  const featuredPost = reviewQueue.find((post) => post.variants[0]?.url) ?? null;
  const featuredModel = featuredPost ? null : (models[0] ?? null);
  const heroUrl =
    featuredPost?.variants[0]?.url ??
    featuredModel?.full_body_url ??
    featuredModel?.portrait_url ??
    null;
  const heroTitle = featuredPost?.name ?? featuredModel?.name ?? 'No active asset yet';
  const heroEyebrow = featuredPost
    ? 'Client review'
    : featuredModel
      ? 'Persona review'
      : 'Dashboard';
  const reviewVersion = featuredPost?.review_version ?? 1;
  const heroAspect = featuredPost ? postAspect(featuredPost) : 'aspect-[3/4]';
  const heroMax = featuredPost ? postMaxWidth(featuredPost) : 'max-w-md';
  const activeStatus: ReviewDecision = featuredPost?.review_status ?? 'needs_changes';
  const needsChangesCount = reviewQueue.filter(
    (post) => post.review_status === 'needs_changes',
  ).length;
  const approvedCount = reviewQueue.filter((post) => post.review_status === 'approved').length;
  const finalCount = reviewQueue.filter((post) => post.review_status === 'final').length;
  const reviewReadyCount = reviewQueue.filter((post) => post.share_token).length;
  const publicReviewHref = featuredPost?.share_token
    ? `/p/${featuredPost.share_token}`
    : '/storyboard';

  return (
    <div className="app-page text-ink">
      <div className="grid min-h-[calc(100dvh-65px)] xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0 border-r border-[#1b1b1b]">
          <header className="app-detail-header flex flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-6">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
                {heroEyebrow}
              </p>
              <h1 className="mt-1 truncate text-[21px] font-medium tracking-tight text-ink">
                {heroTitle}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {loadError ? (
                <StatusPill tone="danger">{loadError}</StatusPill>
              ) : !supabaseConfigured ? (
                <StatusPill tone="warning">Supabase offline</StatusPill>
              ) : (
                <StatusPill tone="success">Review desk</StatusPill>
              )}
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-1 px-3 text-[11px] uppercase tracking-wider text-ink-muted ring-1 ring-[#262626]">
                <Clock3 size={12} />V{reviewVersion}
              </span>
            </div>
          </header>

          <div className="px-5 py-6 lg:px-8 lg:py-8">
            <div className={cn('mx-auto w-full', heroMax)}>
              <figure
                className={cn(
                  'relative w-full overflow-hidden rounded-[14px] border border-[#262626] bg-[#101010] shadow-[0_30px_90px_-50px_rgba(0,153,255,0.45)]',
                  heroAspect,
                )}
              >
                {heroUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={heroUrl} alt={heroTitle} className="h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center px-8 text-center">
                    <div>
                      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-[#0099ff] ring-1 ring-[#262626]">
                        <ImageIcon size={18} />
                      </span>
                      <p className="mt-4 text-[13px] font-medium text-ink">No asset staged</p>
                      <p className="mt-1 text-[12px] leading-[1.5] text-ink-muted">
                        Cast a persona or brief a campaign to populate this workspace.
                      </p>
                    </div>
                  </div>
                )}
                <span className="absolute bottom-3 left-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-black/65 px-3 text-[11px] font-medium uppercase tracking-wider text-white backdrop-blur">
                  <PlayCircle size={12} />
                  Main asset
                </span>
                <span className="absolute right-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-black/60 px-3 text-[11px] font-medium capitalize text-white backdrop-blur">
                  {featuredPost ? formatReviewDecision(activeStatus) : 'Persona'}
                </span>
              </figure>
            </div>
          </div>

          <div className="border-t border-[#1b1b1b] px-5 py-4 lg:px-6">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricTile
                href="/studio"
                label="Roster"
                value={models.length}
                sub={models.length === 1 ? 'persona' : 'personas'}
              />
              <MetricTile
                href="/calendar"
                label={`Scheduled · ${format(new Date(), 'MMM')}`}
                value={scheduled.length}
                sub={scheduled.length === 1 ? 'post' : 'posts'}
              />
              <MetricTile href="/calendar" label="Drafts" value={drafts.length} sub="waiting" />
            </div>
          </div>

          <ReviewTimeline
            featuredPost={featuredPost}
            models={models}
            modelNamesById={modelNamesById}
            connectedPlatforms={connectedPlatforms}
          />
        </section>

        <DashboardInspector
          firstName={firstName}
          heroUrl={heroUrl}
          featuredPost={featuredPost}
          reviewQueue={reviewQueue}
          connectedPlatforms={connectedPlatforms}
          modelNamesById={modelNamesById}
          needsChangesCount={needsChangesCount}
          approvedCount={approvedCount}
          finalCount={finalCount}
          reviewReadyCount={reviewReadyCount}
          publicReviewHref={publicReviewHref}
          modelsCount={models.length}
        />
      </div>
    </div>
  );
}

function DashboardInspector({
  firstName,
  heroUrl,
  featuredPost,
  reviewQueue,
  connectedPlatforms,
  modelNamesById,
  needsChangesCount,
  approvedCount,
  finalCount,
  reviewReadyCount,
  publicReviewHref,
  modelsCount,
}: {
  firstName: string | null;
  heroUrl: string | null;
  featuredPost: PostRow | null;
  reviewQueue: PostRow[];
  connectedPlatforms: Platform[];
  modelNamesById: Record<string, string>;
  needsChangesCount: number;
  approvedCount: number;
  finalCount: number;
  reviewReadyCount: number;
  publicReviewHref: string;
  modelsCount: number;
}) {
  const activeStatus: ReviewDecision = featuredPost?.review_status ?? 'needs_changes';

  return (
    <aside className="flex min-h-0 flex-col gap-5 px-5 py-5 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-65px)] xl:overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
            Command rail
          </p>
          <h2 className="mt-1 text-[16px] font-medium tracking-tight text-ink">
            {firstName ? `${firstName}'s queue` : 'Review queue'}
          </h2>
        </div>
        <Link
          href={publicReviewHref}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium uppercase tracking-wider ring-1 transition',
            featuredPost?.share_token
              ? 'bg-[#22c55e]/12 text-[#86efac] ring-[#22c55e]/30 hover:bg-[#22c55e]/18'
              : 'border border-[#262626] bg-surface-1 text-ink-muted ring-[#262626] hover:border-[#444] hover:text-ink',
          )}
        >
          <CheckCircle2 size={12} />
          {featuredPost?.share_token ? 'Review link' : 'Review room'}
        </Link>
      </div>

      <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#666]">
              Decision
            </p>
            <h3 className="mt-1 text-[15px] font-medium text-ink">
              {formatReviewDecision(activeStatus)}
            </h3>
          </div>
          <PanelRight size={15} className="text-[#0099ff]" />
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-[#262626] bg-[#0c0c0c] p-1">
          <DecisionCount
            label="Needs changes"
            value={needsChangesCount}
            active={activeStatus === 'needs_changes'}
          />
          <DecisionCount
            label="Approved"
            value={approvedCount}
            active={activeStatus === 'approved'}
          />
          <DecisionCount label="Final" value={finalCount} active={activeStatus === 'final'} />
        </div>

        <div className="mt-3 rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#666]">
              Review-ready links
            </span>
            <span className="text-[12px] font-medium text-[#86efac]">{reviewReadyCount}</span>
          </div>
        </div>

        <div className="mt-3 rounded-[12px] border border-[#262626] bg-surface-2 p-3">
          <p className="text-[12px] leading-[1.5] text-ink-muted">
            {featuredPost
              ? featuredPost.caption || 'No approval note has been added to this asset yet.'
              : 'No post is waiting for review yet.'}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href="/storyboard"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-white text-[12px] font-medium text-black transition hover:bg-white/90"
          >
            <MessageSquarePlus size={13} />
            Review
          </Link>
          {heroUrl ? (
            <a
              href={heroUrl}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#262626] bg-surface-2 text-[12px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink"
            >
              <Download size={13} />
              Download
            </a>
          ) : (
            <Link
              href="/studio"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#262626] bg-surface-2 text-[12px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink"
            >
              <ImageIcon size={13} />
              Studio
            </Link>
          )}
        </div>
      </section>

      <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Review queue
          </h3>
          <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] uppercase tracking-wider text-[#666] ring-1 ring-[#262626]">
            {reviewQueue.length}
          </span>
        </div>
        {reviewQueue.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {reviewQueue.map((post, index) => (
              <QueueItem
                key={post.id}
                post={post}
                index={index}
                connectedPlatforms={connectedPlatforms}
                modelName={post.model_id ? modelNamesById[post.model_id] : null}
              />
            ))}
          </ul>
        ) : (
          <EmptyRail modelsCount={modelsCount} />
        )}
      </section>

      <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Quick actions
          </h3>
          <Share2 size={14} className="text-[#0099ff]" />
        </div>
        <div className="grid gap-2">
          <QuickAction
            href="/studio"
            icon={<ImageIcon size={16} />}
            title="Cast model"
            sub="Open Studio"
          />
          <QuickAction
            href="/create-post"
            icon={<PlusSquare size={16} />}
            title="Brief campaign"
            sub={modelsCount === 0 ? 'Cast a model first' : 'Create variants'}
            disabled={modelsCount === 0}
          />
          <QuickAction
            href="/calendar"
            icon={<Calendar size={16} />}
            title="Plan month"
            sub="Open calendar"
          />
        </div>
      </section>
    </aside>
  );
}

function ReviewTimeline({
  featuredPost,
  models,
  modelNamesById,
  connectedPlatforms,
}: {
  featuredPost: PostRow | null;
  models: AiModelRow[];
  modelNamesById: Record<string, string>;
  connectedPlatforms: Platform[];
}) {
  const connected = connectedPlatforms.length > 0 ? connectedPlatforms.join(', ') : 'No channels';

  return (
    <section className="border-t border-[#1b1b1b] px-5 py-4 lg:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Review timeline
          </h2>
          <p className="mt-1 text-[12px] text-[#666]">
            {featuredPost ? connected : `${models.length} personas available`}
          </p>
        </div>
        <Link
          href={featuredPost ? '/calendar' : '/studio'}
          className="inline-flex items-center gap-1 text-[12px] text-ink-muted transition hover:text-ink"
        >
          Open
          <ArrowUpRight size={11} />
        </Link>
      </div>
      {featuredPost && featuredPost.variants.length > 0 ? (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {featuredPost.variants.map((variant, i) => (
            <li
              key={variant.generationId || i}
              className="w-[148px] shrink-0 overflow-hidden rounded-[12px] border border-[#262626] bg-surface-1"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={variant.url}
                alt={`${featuredPost.name} variant ${i + 1}`}
                className={cn(postAspect(featuredPost), 'w-full object-cover')}
              />
              <div className="flex items-center justify-between gap-2 p-2">
                <span className="truncate text-[11px] font-medium text-ink">V{i + 1}</span>
                <span className="text-[10px] uppercase tracking-wider text-[#666]">
                  {format(new Date(variant.generatedAt), 'HH:mm')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : models.length > 0 ? (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {models.slice(0, 8).map((model) => (
            <li
              key={model.id}
              className="w-[118px] shrink-0 overflow-hidden rounded-[12px] border border-[#262626] bg-surface-1"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={model.portrait_url}
                alt={model.name}
                className="aspect-[3/4] w-full object-cover"
              />
              <div className="p-2">
                <span className="block truncate text-[11px] font-medium text-ink">
                  {modelNamesById[model.id] ?? model.name}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[12px] border border-[#262626] bg-surface-1 p-4 text-[12px] text-ink-muted">
          No timeline assets yet.
        </div>
      )}
    </section>
  );
}

function QueueItem({
  post,
  index,
  connectedPlatforms,
  modelName,
}: {
  post: PostRow;
  index: number;
  connectedPlatforms: Platform[];
  modelName: string | null;
}) {
  const thumb = post.variants[0]?.url;
  const href = post.share_token ? `/p/${post.share_token}` : '/calendar';
  const platformLabel = post.platforms.length > 0 ? post.platforms.join(', ') : 'social';
  const connected = connectedPlatforms.length > 0;

  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-[12px] border border-[#262626] bg-surface-2 p-2 text-left transition hover:border-[#0099ff]/50 hover:bg-[#1a1a1a]"
      >
        <div className="relative h-[74px] w-[56px] shrink-0 overflow-hidden rounded-[8px] bg-[#101010]">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={post.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-[#444]">
              <ImageIcon size={15} />
            </div>
          )}
          <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[#0099ff] text-[10px] font-medium text-white shadow-lg shadow-black/30">
            {index + 1}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium capitalize ring-1',
                reviewTone(post.review_status),
              )}
            >
              {formatReviewDecision(post.review_status)}
            </span>
            {post.share_token ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[#22c55e]/12 px-2 text-[10px] font-medium text-[#86efac] ring-1 ring-[#22c55e]/30">
                <CheckCircle2 size={10} />
                Link
              </span>
            ) : null}
            <span className="text-[10px] uppercase tracking-wider text-[#666]">
              V{post.review_version}
            </span>
          </div>
          <p className="truncate text-[13px] font-medium text-ink">{post.name}</p>
          <p className="mt-1 truncate text-[11px] capitalize text-ink-muted">
            {modelName ? `${modelName} · ` : ''}
            {platformLabel}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-[#666]">
            {post.scheduled_for ? format(new Date(post.scheduled_for), 'MMM d, HH:mm') : 'Draft'}
            {connected ? ' · connected' : ''}
          </p>
        </div>
        <ArrowUpRight
          size={13}
          className="shrink-0 text-[#555] transition group-hover:text-[#0099ff]"
        />
      </Link>
    </li>
  );
}

function MetricTile({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number;
  sub: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[112px] items-end justify-between gap-4 rounded-[14px] border border-[#262626] bg-surface-1 px-4 py-3 transition hover:border-[#0099ff]/40 hover:bg-[#161616]"
    >
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          {label}
        </p>
        <p className="mt-3 text-[34px] font-medium leading-none tracking-normal text-ink">
          {value.toString().padStart(2, '0')}
        </p>
        <p className="mt-1.5 text-[11px] text-ink-muted">{sub}</p>
      </div>
      <ArrowUpRight
        size={16}
        className="shrink-0 text-ink-muted transition group-hover:text-[#0099ff]"
      />
    </Link>
  );
}

function QuickAction({
  href,
  icon,
  title,
  sub,
  disabled,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  disabled?: boolean;
}) {
  const inner = (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-[12px] border border-[#262626] bg-surface-2 p-3 transition',
        disabled
          ? 'pointer-events-none opacity-50'
          : 'hover:border-[#0099ff]/40 hover:bg-[#161616]',
      )}
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0099ff]/10 text-[#0099ff] ring-1 ring-[#0099ff]/30">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 truncate text-[11px] leading-[1.4] text-ink-muted">{sub}</p>
      </div>
      <ArrowUpRight size={12} className="text-[#555] transition group-hover:text-[#0099ff]" />
    </div>
  );
  return disabled ? inner : <Link href={href}>{inner}</Link>;
}

function DecisionCount({
  label,
  value,
  active,
}: {
  label: string;
  value: number;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-[8px] px-2 py-2 text-center transition',
        active ? 'bg-white text-black' : 'text-ink-muted',
      )}
    >
      <p className="text-[10px] font-medium">{value}</p>
      <p className="mt-0.5 truncate text-[10px]">{label}</p>
    </div>
  );
}

function EmptyRail({ modelsCount }: { modelsCount: number }) {
  return (
    <div className="rounded-[12px] border border-[#262626] bg-surface-2 p-4">
      <p className="text-[13px] font-medium text-ink">
        {modelsCount > 0 ? 'No drafts in review.' : 'No personas yet.'}
      </p>
      <p className="mt-1 text-[12px] leading-[1.5] text-ink-muted">
        {modelsCount > 0 ? 'Create a campaign to start the approval flow.' : 'Start in Studio.'}
      </p>
      <Link
        href={modelsCount > 0 ? '/create-post' : '/studio'}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-medium text-black transition hover:bg-white/90"
      >
        {modelsCount > 0 ? 'Create post' : 'Open Studio'}
        <ArrowUpRight size={11} />
      </Link>
    </div>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'success' | 'warning' | 'danger';
}) {
  return (
    <span
      className={cn(
        'inline-flex h-9 max-w-[220px] items-center gap-1.5 truncate rounded-full px-3 text-[11px] font-medium uppercase tracking-wider ring-1',
        tone === 'success' && 'bg-[#22c55e]/12 text-[#86efac] ring-[#22c55e]/30',
        tone === 'warning' && 'bg-[#ff7a3d]/10 text-[#ffb088] ring-[#ff7a3d]/30',
        tone === 'danger' && 'bg-[#ff5577]/10 text-[#ff8aa2] ring-[#ff5577]/30',
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function postAspect(post: PostRow): string {
  if (post.format === 'square') return 'aspect-square';
  if (post.format === 'portrait') return 'aspect-[9/16]';
  return 'aspect-[16/9]';
}

function postMaxWidth(post: PostRow): string {
  if (post.format === 'landscape') return 'max-w-4xl';
  if (post.format === 'portrait') return 'max-w-md';
  return 'max-w-xl';
}

function reviewTone(status: ReviewDecision): string {
  if (status === 'approved') return 'bg-[#22c55e]/12 text-[#86efac] ring-[#22c55e]/30';
  if (status === 'final') return 'bg-[#0099ff]/12 text-[#79cfff] ring-[#0099ff]/30';
  return 'bg-[#ff7a3d]/10 text-[#ffb088] ring-[#ff7a3d]/30';
}
