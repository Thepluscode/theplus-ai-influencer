import Link from 'next/link';
import { ArrowUpRight, Film, ImageIcon, PlusSquare } from 'lucide-react';
import { listAiModels } from '@/lib/ai-models';
import { publicEnv, serverEnv } from '@/lib/env';
import { isLumaStubbed } from '@/lib/luma-stub';
import { listDraftPosts, listPostsInRange } from '@/lib/posts';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow, PostRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { getDefaultZernioProfileId, getZernioClient } from '@/lib/zernio';
import { PLATFORMS, type Platform } from '@/types/post';
import { PostsRail } from '@/components/posts/posts-rail';
import { cn } from '@/lib/utils';
import { SavedModels } from './saved-models';

const ACTIVITY_RANGE_DAYS = 30;

export default async function StudioPage() {
  const stubbed = isLumaStubbed();
  const lumaConfigured = stubbed || Boolean(serverEnv.LUMA_API_KEY);
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let savedModels: AiModelRow[] = [];
  let recentPosts: PostRow[] = [];
  let modelsErrorReason: string | null = null;
  let connectedPlatforms: Platform[] = [];

  if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        const now = new Date();
        const past = new Date(now.getTime() - ACTIVITY_RANGE_DAYS * 24 * 60 * 60 * 1000);
        const future = new Date(now.getTime() + ACTIVITY_RANGE_DAYS * 24 * 60 * 60 * 1000);
        const [models, postsInRange, drafts] = await Promise.all([
          listAiModels(ws.id),
          listPostsInRange(ws.id, past, future),
          listDraftPosts(ws.id, 5),
        ]);
        savedModels = models;
        // Recent activity = newest 6 across scheduled + drafts
        recentPosts = [...postsInRange.scheduled, ...drafts]
          .sort(
            (a, b) =>
              new Date(b.updated_at ?? b.created_at).getTime() -
              new Date(a.updated_at ?? a.created_at).getTime(),
          )
          .slice(0, 6);

        // Connected platforms — drives Connections-required warning in the
        // modal that opens from the activity chips below.
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
      modelsErrorReason = err instanceof Error ? err.message : 'Unknown Supabase error';
    }
  }

  const modelNamesById: Record<string, string> = Object.fromEntries(
    savedModels.map((m) => [m.id, m.name]),
  );

  return (
    <div className="app-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header">
          <p className="framer-eyebrow">AI Studio</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
            Manage models.
            <br />
            Generate viral content.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            Your roster, your campaigns, and the latest activity — all in one place.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {stubbed ? (
              <StatusPill tone="info">
                <span className="text-white">LUMA_STUB</span> on · placeholders
              </StatusPill>
            ) : !lumaConfigured ? (
              <StatusPill tone="warn">LUMA_API_KEY missing</StatusPill>
            ) : (
              <StatusPill tone="ok">Luma live</StatusPill>
            )}
            {!supabaseConfigured ? (
              <StatusPill tone="warn">Supabase off · roster empty</StatusPill>
            ) : null}
            {modelsErrorReason ? (
              <StatusPill tone="err" title={modelsErrorReason}>
                Supabase fetch failed
              </StatusPill>
            ) : null}
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-5">
            <section className="grid gap-3 md:grid-cols-3">
              <HubCard
                href="/studio/new"
                tone="blue"
                icon={<ImageIcon size={20} />}
                title="Cast model"
                sub="Generate a persona and lock the visual identity."
                cta="Studio"
              />
              <HubCard
                href="/create-post"
                tone="purple"
                icon={<PlusSquare size={20} />}
                title="Brief post"
                sub="Turn a persona into platform-ready campaign variants."
                cta="Open"
                disabled={savedModels.length === 0}
                disabledHint="Create a model first"
              />
              <HubCard
                href="/storyboard/new"
                tone="orange"
                icon={<Film size={20} />}
                title="Storyboard reel"
                sub="Build a shot list and review the reel frame by frame."
                cta="Open"
                disabled={savedModels.length === 0}
                disabledHint="Create a model first"
              />
            </section>

            {supabaseConfigured ? (
              <section className="rounded-[16px] border border-[#1b1b1b] bg-[#0b0b0b] p-4">
                <header className="mb-4 flex items-end justify-between border-b border-[#1b1b1b] pb-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
                      Asset roster
                    </p>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      {savedModels.length} {savedModels.length === 1 ? 'persona' : 'personas'} on
                      the roster
                    </p>
                  </div>
                  {savedModels.length > 0 ? (
                    <Link
                      href="/studio/new"
                      className="inline-flex items-center gap-1 text-[12px] text-ink-muted transition hover:text-ink"
                    >
                      New persona
                      <ArrowUpRight size={11} />
                    </Link>
                  ) : null}
                </header>
                <SavedModels models={savedModels} />
              </section>
            ) : null}
          </div>

          <aside className="rounded-[16px] border border-[#262626] bg-surface-1 p-4 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
            <header className="mb-4 flex items-center justify-between border-b border-[#1b1b1b] pb-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
                  Review rail
                </p>
                <p className="mt-1 text-[13px] font-medium text-ink">Recent activity</p>
              </div>
              <Link
                href="/calendar"
                className="inline-flex items-center gap-1 text-[11px] text-ink-muted transition hover:text-ink"
              >
                Open calendar
                <ArrowUpRight size={10} />
              </Link>
            </header>
            {recentPosts.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-[#262626] bg-surface-2/40 px-3 py-6 text-center text-[12px] text-ink-muted">
                Nothing scheduled yet. Brief a campaign and it lands here.
              </p>
            ) : (
              <PostsRail
                posts={recentPosts}
                connectedPlatforms={connectedPlatforms}
                modelNamesById={modelNamesById}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function HubCard({
  href,
  tone,
  icon,
  title,
  sub,
  cta,
  disabled,
  disabledHint,
}: {
  href: string;
  tone: 'blue' | 'purple' | 'orange';
  icon: React.ReactNode;
  title: string;
  sub: string;
  cta: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const accent = tone === 'blue' ? '#0099ff' : tone === 'purple' ? '#a855f7' : '#ff7a3d';
  const ring =
    tone === 'blue'
      ? 'hover:border-[#0099ff]/40'
      : tone === 'purple'
        ? 'hover:border-[#a855f7]/40'
        : 'hover:border-[#ff7a3d]/40';

  const body = (
    <div
      className={cn(
        'group relative flex h-full min-h-[132px] flex-col justify-between gap-4 rounded-[14px] border border-[#262626] bg-surface-1 p-4 transition',
        disabled ? 'opacity-50' : ring,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1"
          style={{
            backgroundColor: `${accent}18`,
            color: accent,
            boxShadow: `inset 0 0 0 1px ${accent}33`,
          }}
        >
          {icon}
        </span>
        <span
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium uppercase tracking-wider ring-1"
          style={{
            color: accent,
            backgroundColor: `${accent}12`,
            boxShadow: `inset 0 0 0 1px ${accent}33`,
          }}
        >
          {cta}
          <ArrowUpRight size={10} />
        </span>
      </div>
      <div>
        <h3 className="text-[15px] font-medium text-ink">{title}</h3>
        <p className="mt-1.5 text-[12px] leading-[1.45] text-ink-muted">
          {disabled && disabledHint ? disabledHint : sub}
        </p>
      </div>
    </div>
  );

  return disabled ? (
    <div title={disabledHint}>{body}</div>
  ) : (
    <Link href={href} className="block">
      {body}
    </Link>
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
      className="inline-flex items-center gap-2 rounded-full bg-surface-1 px-3 py-1.5 text-[12px] text-ink"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
