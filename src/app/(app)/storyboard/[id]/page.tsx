import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  Film,
  Layers3,
  PanelRight,
  Radio,
  Share2,
} from 'lucide-react';
import { getStoryboard } from '@/lib/storyboards';
import { publicEnv } from '@/lib/env';
import { listAiModels } from '@/lib/ai-models';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import type { RenderedShot } from '@/lib/storyboard';
import { COSTS } from '@/lib/credits';
import { getLatestJobForStoryboard } from '@/lib/storyboard-jobs';
import { listReviewDecisionsForStoryboard } from '@/lib/review-approvals';
import type { ReviewDecision } from '@/lib/review-approvals-schema';
import { listReviewCommentsForStoryboard } from '@/lib/review-comments';
import { StoryboardDecisionPanel } from '@/components/review/storyboard-decision-panel';
import { StoryboardReviewPanel } from '@/components/review/storyboard-review-panel';
import { ReelPreview } from './reel-preview';
import { AnimateButton } from './animate-button';
import { JobStatusPoller } from './job-status-poller';
import { cn } from '@/lib/utils';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StoryboardDetailPage({ params }: Props) {
  const { id } = await params;
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!supabaseConfigured) notFound();

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const ws = await getOrCreateCurrentWorkspace(user);
  const sb = await getStoryboard(id);
  if (!sb || sb.workspace_id !== ws.id) notFound();

  const shots = (Array.isArray(sb.shots) ? sb.shots : []) as RenderedShot[];
  const models = await listAiModels(ws.id);
  const model = sb.model_id ? models.find((m) => m.id === sb.model_id) : undefined;

  const animatedCount = shots.filter((s) => Boolean(s.videoUrl)).length;
  const pendingShotCount = shots.length - animatedCount;
  const allAnimated = shots.length > 0 && pendingShotCount === 0;

  const latestJob = await getLatestJobForStoryboard(id);
  let reviewComments: Awaited<ReturnType<typeof listReviewCommentsForStoryboard>> = [];
  let reviewDecisions: Awaited<ReturnType<typeof listReviewDecisionsForStoryboard>> = [];
  try {
    reviewComments = await listReviewCommentsForStoryboard(sb.id, ws.id);
  } catch (err) {
    console.error('Failed to load storyboard review comments', err);
  }
  try {
    reviewDecisions = await listReviewDecisionsForStoryboard(sb.id, ws.id);
  } catch (err) {
    console.error('Failed to load storyboard review decisions', err);
  }
  const jobInFlight = latestJob?.status === 'pending' || latestJob?.status === 'processing';
  const reviewStatus: ReviewDecision = sb.review_status || 'needs_changes';
  const reviewVersion = sb.review_version || 1;
  const reviewApproved = reviewStatus === 'approved' || reviewStatus === 'final';
  const totalDurationMs = shots.reduce(
    (sum, s) => sum + (s.videoDurationMs ?? s.durationMs ?? 2500),
    0,
  );

  return (
    <div className="min-h-full bg-[#070707] text-ink">
      <header className="sticky top-0 z-30 border-b border-[#171717] bg-[#070707]/92 px-6 py-3 backdrop-blur-xl lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/storyboard"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#262626] bg-surface-1 text-ink-muted transition hover:border-[#444] hover:text-ink"
              aria-label="Back to Storyboards"
            >
              <ArrowLeft size={14} />
            </Link>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
                  Storyboard review
                </p>
                <ReviewStatusBadge allAnimated={allAnimated} jobInFlight={jobInFlight} />
              </div>
              <h1 className="truncate text-[18px] font-medium tracking-tight text-ink">
                {sb.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-1 px-3 text-[12px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink"
            >
              <Share2 size={12} />
              Review link
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-1 px-3 text-[12px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink"
            >
              <Download size={12} />
              Export
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-5 px-6 py-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="flex min-w-0 flex-col gap-5">
          <ReelPreview shots={shots} format={sb.format} />
          <ShotAssetStrip shots={shots} />
          <CompositionTimeline shots={shots} totalDurationMs={totalDurationMs} />
        </main>

        <aside className="flex flex-col gap-5 xl:sticky xl:top-[82px] xl:max-h-[calc(100dvh-104px)] xl:overflow-y-auto">
          <ReviewSummaryPanel
            summary={sb.summary}
            createdAt={sb.created_at}
            format={sb.format}
            shotCount={shots.length}
            animatedCount={animatedCount}
            totalDurationMs={totalDurationMs}
            modelName={model?.name ?? null}
            reviewVersion={reviewVersion}
          />

          <RenderQueuePanel
            storyboardId={sb.id}
            latestJob={latestJob}
            pendingShotCount={pendingShotCount}
            totalShots={shots.length}
            allAnimated={allAnimated}
            jobInFlight={jobInFlight}
            reviewApproved={reviewApproved}
          />

          <StoryboardDecisionPanel
            storyboardId={sb.id}
            status={reviewStatus}
            version={reviewVersion}
            decisions={reviewDecisions}
            defaultReviewerName={user.email?.split('@')[0] ?? 'Reviewer'}
          />

          <StoryboardReviewPanel
            storyboardId={sb.id}
            shots={shots}
            comments={reviewComments}
            defaultAuthorName={user.email?.split('@')[0] ?? 'Reviewer'}
          />
        </aside>
      </div>
    </div>
  );
}

function ReviewStatusBadge({
  allAnimated,
  jobInFlight,
}: {
  allAnimated: boolean;
  jobInFlight: boolean;
}) {
  if (jobInFlight) {
    return (
      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[#a855f7]/12 px-2 text-[10px] font-medium uppercase tracking-wider text-[#c084fc] ring-1 ring-[#a855f7]/30">
        <Radio size={9} />
        Rendering
      </span>
    );
  }
  if (allAnimated) {
    return (
      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[#22c55e]/12 px-2 text-[10px] font-medium uppercase tracking-wider text-[#86efac] ring-1 ring-[#22c55e]/30">
        <CheckCircle2 size={9} />
        Ready for review
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[#ff7a3d]/12 px-2 text-[10px] font-medium uppercase tracking-wider text-[#ffb38a] ring-1 ring-[#ff7a3d]/30">
      <Clock3 size={9} />
      Assembly
    </span>
  );
}

function ReviewSummaryPanel({
  summary,
  createdAt,
  format,
  shotCount,
  animatedCount,
  totalDurationMs,
  modelName,
  reviewVersion,
}: {
  summary: string | null;
  createdAt: string;
  format: string;
  shotCount: number;
  animatedCount: number;
  totalDurationMs: number;
  modelName: string | null;
  reviewVersion: number;
}) {
  return (
    <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PanelRight size={14} className="text-[#0099ff]" />
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Inspector
          </h2>
        </div>
        <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] uppercase tracking-wider text-[#666] ring-1 ring-[#262626]">
          V{reviewVersion}
        </span>
      </div>

      {summary ? (
        <p className="rounded-[12px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] leading-[1.5] text-ink">
          {summary}
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Meta label="Format" value={format} />
        <Meta label="Duration" value={formatDuration(totalDurationMs)} />
        <Meta label="Shots" value={String(shotCount)} />
        <Meta label="Animated" value={`${animatedCount}/${shotCount}`} />
        <Meta label="Created" value={formatDate(createdAt)} wide />
        {modelName ? <Meta label="Influencer" value={modelName} wide /> : null}
      </dl>
    </section>
  );
}

function RenderQueuePanel({
  storyboardId,
  latestJob,
  pendingShotCount,
  totalShots,
  allAnimated,
  jobInFlight,
  reviewApproved,
}: {
  storyboardId: string;
  latestJob: Awaited<ReturnType<typeof getLatestJobForStoryboard>>;
  pendingShotCount: number;
  totalShots: number;
  allAnimated: boolean;
  jobInFlight: boolean;
  reviewApproved: boolean;
}) {
  return (
    <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Film size={14} className="text-[#a855f7]" />
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Render queue
        </h2>
      </div>
      {latestJob ? (
        <div className="mb-4">
          <JobStatusPoller
            storyboardId={storyboardId}
            initialStatus={latestJob.status}
            initialShotsCompleted={latestJob.shots_completed}
            initialShotsTotal={latestJob.shots_total}
          />
        </div>
      ) : null}
      <AnimateButton
        storyboardId={storyboardId}
        pendingShotCount={pendingShotCount}
        totalShots={totalShots}
        allAnimated={allAnimated}
        jobInFlight={jobInFlight}
        reviewApproved={reviewApproved}
        costPerShot={COSTS.STORYBOARD_VIDEO_RENDER}
      />
    </section>
  );
}

function ShotAssetStrip({ shots }: { shots: RenderedShot[] }) {
  return (
    <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Assets
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-[#666]">
          Hover scrub-ready frames
        </span>
      </div>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {shots.map((s) => (
          <li
            key={s.index}
            className="group w-[156px] shrink-0 overflow-hidden rounded-[12px] border border-[#262626] bg-surface-2 transition hover:border-[#0099ff]/50"
          >
            <div className="relative aspect-video overflow-hidden bg-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.imageUrl}
                alt={`Shot ${s.index + 1}`}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              />
              {s.videoUrl ? (
                <span className="absolute left-2 top-2 inline-flex h-5 items-center gap-1 rounded-full bg-[#a855f7]/80 px-2 text-[9px] font-medium uppercase tracking-wider text-white backdrop-blur">
                  <Film size={9} />
                  video
                </span>
              ) : null}
            </div>
            <div className="p-2">
              <p className="text-[11px] font-medium text-ink">Shot {s.index + 1}</p>
              <p className="mt-0.5 truncate text-[10px] text-ink-muted">
                {s.hookCaption || s.prompt}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompositionTimeline({
  shots,
  totalDurationMs,
}: {
  shots: RenderedShot[];
  totalDurationMs: number;
}) {
  let cursor = 0;
  return (
    <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers3 size={14} className="text-[#0099ff]" />
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Remotion composition
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[#666]">
          {formatDuration(totalDurationMs)} · 30fps
        </span>
      </div>
      <div className="grid gap-2">
        {['Visuals', 'Text overlays', 'Comments'].map((layer, layerIndex) => {
          cursor = 0;
          return (
            <div key={layer} className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">{layer}</span>
              <div className="relative h-9 overflow-hidden rounded-[8px] border border-[#262626] bg-surface-2">
                {shots.map((shot) => {
                  const duration = shot.videoDurationMs ?? shot.durationMs ?? 2500;
                  const start = totalDurationMs > 0 ? (cursor / totalDurationMs) * 100 : 0;
                  const width = totalDurationMs > 0 ? (duration / totalDurationMs) * 100 : 0;
                  cursor += duration;
                  return (
                    <span
                      key={`${layer}-${shot.index}`}
                      className={cn(
                        'absolute inset-y-1 rounded-[5px] border',
                        layerIndex === 0
                          ? 'border-[#0099ff]/30 bg-[#0099ff]/18'
                          : layerIndex === 1
                            ? 'border-[#a855f7]/30 bg-[#a855f7]/16'
                            : 'border-[#22c55e]/25 bg-[#22c55e]/12',
                      )}
                      style={{ left: `${start}%`, width: `${Math.max(width, 2)}%` }}
                      title={`Shot ${shot.index + 1} · ${formatDuration(duration)}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Meta({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2',
        wide && 'col-span-2',
      )}
    >
      <dt className="text-[10px] uppercase tracking-wider text-[#666]">{label}</dt>
      <dd className="mt-1 truncate text-[12px] font-medium text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(value: string): string {
  return format(new Date(value), 'MMM d, h:mm a');
}
