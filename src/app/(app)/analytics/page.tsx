import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowUpRight, Eye, Heart, MessageCircle, Send, Sparkles } from 'lucide-react';
import { listAiModels } from '@/lib/ai-models';
import { publicEnv, serverEnv } from '@/lib/env';
import { listPostsInRange } from '@/lib/posts';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow, PostRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { getZernioClient } from '@/lib/zernio';
import { cn } from '@/lib/utils';

const LOOKBACK_DAYS = 30;

/**
 * Analytics scaffold — Phase 4 of BUILD_PLAN.md. Seeds the data shape that
 * the Performance Coach agent (STRATEGY.md §AI roadmap) will reason
 * against. v1 surfaces placeholder metrics derived deterministically from
 * each post's id so the page reads as "alive" while we wire real Zernio
 * per-post engagement reads in the next milestone.
 */
export default async function AnalyticsPage() {
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let posts: PostRow[] = [];
  let models: AiModelRow[] = [];
  let loadError: string | null = null;

  if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        const now = new Date();
        const past = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const future = new Date(now.getTime() + LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const [postsInRange, m] = await Promise.all([
          listPostsInRange(ws.id, past, future),
          listAiModels(ws.id),
        ]);
        posts = postsInRange.scheduled;
        models = m;
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  const zernioConfigured = Boolean(serverEnv.ZERNIO_API_KEY);

  // Live metrics from Zernio. We fetch in parallel for every post that
  // has a zernio_post_id; falls back to a deterministic placeholder for
  // posts that haven't been pushed (drafts, locally-scheduled). Any
  // single Zernio request failing returns null and gracefully falls back.
  const enriched = await Promise.all(
    posts.map(async (p) => {
      if (zernioConfigured && p.zernio_post_id) {
        try {
          const live = await getZernioClient().getPostAnalytics(p.zernio_post_id);
          if (live) {
            return {
              ...p,
              metrics: {
                views: live.views,
                likes: live.likes,
                comments: live.comments,
                saves: live.saves,
              },
              isLive: true,
            };
          }
        } catch {
          // fall through to placeholder
        }
      }
      return { ...p, metrics: placeholderMetrics(p.id), isLive: false };
    }),
  );
  const liveCount = enriched.filter((p) => p.isLive).length;
  const totals = enriched.reduce(
    (acc, p) => ({
      views: acc.views + p.metrics.views,
      likes: acc.likes + p.metrics.likes,
      comments: acc.comments + p.metrics.comments,
      saves: acc.saves + p.metrics.saves,
    }),
    { views: 0, likes: 0, comments: 0, saves: 0 },
  );

  const top = [...enriched].sort((a, b) => b.metrics.views - a.metrics.views).slice(0, 5);

  const modelNameById: Record<string, string> = Object.fromEntries(
    models.map((m) => [m.id, m.name]),
  );

  return (
    <div className="min-h-full bg-[#070707] text-ink">
      <div className="px-5 py-5 lg:px-6 lg:py-6">
        <header className="mb-6 border-b border-[#1b1b1b] pb-5">
          <p className="framer-eyebrow">Analytics</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
            What worked.
            <br />
            What to ship next.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            Performance signals across your last {LOOKBACK_DAYS} days, ranked for fast creative
            decisions.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {!zernioConfigured ? (
              <StatusPill tone="warn">Zernio off · metrics are placeholders</StatusPill>
            ) : liveCount > 0 ? (
              <StatusPill tone="ok">
                <span className="font-medium text-ink">{liveCount}</span>{' '}
                {liveCount === 1 ? 'post' : 'posts'} reporting live · the rest are placeholders
              </StatusPill>
            ) : (
              <StatusPill tone="info">
                Zernio live · waiting for first post to report engagement
              </StatusPill>
            )}
            {loadError ? (
              <StatusPill tone="err" title={loadError}>
                Supabase fetch failed
              </StatusPill>
            ) : null}
          </div>
        </header>

        {/* Stat tiles */}
        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            icon={<Eye size={16} />}
            label="Views"
            value={totals.views}
            accent="#0099ff"
          />
          <MetricTile
            icon={<Heart size={16} />}
            label="Likes"
            value={totals.likes}
            accent="#ff5577"
          />
          <MetricTile
            icon={<MessageCircle size={16} />}
            label="Comments"
            value={totals.comments}
            accent="#a855f7"
          />
          <MetricTile
            icon={<Send size={16} />}
            label="Saves"
            value={totals.saves}
            accent="#22c55e"
          />
        </section>

        {/* Top posts + Insights */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
            <header className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                  Top posts · last {LOOKBACK_DAYS} days
                </p>
                <p className="mt-1 text-[14px] text-[#666]">
                  Ranked by views. Click any post to open details.
                </p>
              </div>
            </header>

            {top.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-[#262626] px-3 py-8 text-center text-[12px] text-ink-muted">
                No scheduled posts yet — ship some content and metrics will land here.
              </p>
            ) : (
              <ul className="grid gap-2">
                {top.map((p) => (
                  <TopPostRow
                    key={p.id}
                    post={p}
                    modelName={p.model_id ? modelNameById[p.model_id] : undefined}
                  />
                ))}
              </ul>
            )}
          </section>

          <aside className="flex flex-col gap-4">
            <CoachCard
              title="Signals"
              body="Best posting time, strongest persona, and strongest scene direction appear here as live metrics settle."
            />
            <CoachCard
              title="Comparisons"
              body="Track per-platform deltas, persona lift, and content-arc momentum from the same review rail."
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ---------- helpers ----------

interface Metrics {
  views: number;
  likes: number;
  comments: number;
  saves: number;
}

function placeholderMetrics(id: string): Metrics {
  // Deterministic per-id so the values don't flicker between renders.
  const h = simpleHash(id);
  const base = 800 + (h % 8000);
  return {
    views: base,
    likes: Math.round(base * (0.04 + ((h >> 4) % 8) / 100)),
    comments: Math.round(base * (0.005 + ((h >> 7) % 5) / 1000)),
    saves: Math.round(base * (0.015 + ((h >> 10) % 6) / 1000)),
  };
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

// ---------- components ----------

function MetricTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3 rounded-[16px] border border-[#262626] bg-surface-1 px-5 py-4">
      <div>
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          {icon}
        </span>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          {label}
        </p>
        <p className="mt-1 text-[34px] font-medium leading-none tracking-normal text-ink tabular-nums">
          {fmt(value)}
        </p>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: accent }}>
        last {LOOKBACK_DAYS}d
      </span>
    </div>
  );
}

function TopPostRow({
  post,
  modelName,
}: {
  post: PostRow & { metrics: Metrics; isLive?: boolean };
  modelName?: string;
}) {
  const thumb = post.variants[0]?.url;
  return (
    <li>
      <Link
        href="/calendar"
        className="group flex items-center gap-3 rounded-[12px] border border-[#262626] bg-surface-2 p-2.5 transition hover:border-[#0099ff]/50"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="h-12 w-12 shrink-0 rounded-[8px] object-cover ring-1 ring-[#262626]"
          />
        ) : (
          <span className="h-12 w-12 shrink-0 rounded-[8px] bg-[#262626]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-medium text-ink">{post.name}</p>
            {post.isLive ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[#22c55e]/10 px-1.5 text-[10px] font-medium uppercase tracking-wider text-[#22c55e] ring-1 ring-[#22c55e]/30">
                <span className="h-1 w-1 rounded-full bg-[#22c55e]" />
                live
              </span>
            ) : null}
          </div>
          <p className="truncate text-[11px] text-ink-muted">
            {modelName ?? '(unknown model)'}
            {post.platforms.length > 0
              ? ` · ${post.platforms.map((p) => p[0].toUpperCase() + p.slice(1)).join(', ')}`
              : ''}
            {post.scheduled_for ? ` · ${format(new Date(post.scheduled_for), 'MMM d')}` : ''}
          </p>
        </div>
        <div className="hidden shrink-0 gap-3 text-[11px] sm:flex">
          <MetricInline icon={<Eye size={11} />} value={post.metrics.views} />
          <MetricInline icon={<Heart size={11} />} value={post.metrics.likes} />
          <MetricInline icon={<MessageCircle size={11} />} value={post.metrics.comments} />
        </div>
        <ArrowUpRight size={12} className="shrink-0 text-ink-muted group-hover:text-ink" />
      </Link>
    </li>
  );
}

function MetricInline({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      <span className="text-[#666]">{icon}</span>
      <span className="tabular-nums">{fmt(value)}</span>
    </span>
  );
}

function CoachCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#0099ff]/10 px-2.5 text-[11px] font-medium text-[#0099ff] ring-1 ring-[#0099ff]/30">
          <Sparkles size={11} />
          {title}
        </span>
      </div>
      <p className="text-[13px] leading-[1.5] text-ink-muted">{body}</p>
    </div>
  );
}

function StatusPill({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'err' | 'ok';
  title?: string;
  children: React.ReactNode;
}) {
  const dot = {
    info: 'bg-[#0099ff]',
    warn: 'bg-[#ff7a3d]',
    err: 'bg-[#ff5577]',
    ok: 'bg-[#22c55e]',
  }[tone];
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-surface-1 px-3 py-1.5 text-[12px] text-ink',
      )}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
