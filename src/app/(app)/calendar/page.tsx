import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { listAiModels } from '@/lib/ai-models';
import { DEMO_CONNECTED_PLATFORMS, getDemoModels, getDemoPosts, isDemoMode } from '@/lib/demo-mode';
import { publicEnv, serverEnv } from '@/lib/env';
import { listPostsInRange } from '@/lib/posts';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { PostRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { getDefaultZernioProfileId, getZernioClient } from '@/lib/zernio';
import { PLATFORMS, type Platform } from '@/types/post';
import { CalendarView } from './calendar-view';

const MONTH_PARAM = /^(\d{4})-(\d{2})$/;

function parseMonth(value: string | undefined): Date {
  const m = typeof value === 'string' ? MONTH_PARAM.exec(value) : null;
  if (!m) return startOfMonth(new Date());
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (Number.isNaN(year) || month < 1 || month > 12) return startOfMonth(new Date());
  return new Date(year, month - 1, 1);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const monthStart = parseMonth(month);
  const demoMode = isDemoMode();

  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let scheduled: PostRow[] = [];
  let drafts: PostRow[] = [];
  let saveDisabledReason: string | null = null;
  let dataErrorReason: string | null = null;
  let connectedPlatforms: Platform[] = [];
  let modelNamesById: Record<string, string> = {};

  if (demoMode) {
    const posts = getDemoPosts();
    scheduled = posts.filter((post) => post.status === 'scheduled');
    drafts = posts.filter((post) => post.status === 'draft');
    connectedPlatforms = DEMO_CONNECTED_PLATFORMS;
    modelNamesById = Object.fromEntries(getDemoModels().map((m) => [m.id, m.name]));
  } else if (!supabaseConfigured) {
    saveDisabledReason = 'Set Supabase env vars in .env.local to enable rescheduling.';
  } else {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        saveDisabledReason = 'Sign in to view your scheduled posts.';
      } else {
        const ws = await getOrCreateCurrentWorkspace(user);
        const rangeStart = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 0 });
        const rangeEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });
        const [result, models] = await Promise.all([
          listPostsInRange(ws.id, rangeStart, rangeEnd),
          listAiModels(ws.id),
        ]);
        scheduled = result.scheduled;
        drafts = result.drafts;
        modelNamesById = Object.fromEntries(models.map((m) => [m.id, m.name]));

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
      const message = err instanceof Error ? err.message : 'Unknown Supabase error';
      dataErrorReason = message;
      saveDisabledReason = 'Supabase tables not ready — apply migrations 0001 + 0002.';
    }
  }

  return (
    <div className="app-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header">
          <p className="framer-eyebrow">Calendar</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
            Plan the month.
            <br />
            Ship on cadence.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            Manage and visualize your AI influencer&apos;s social presence. Click any scheduled post
            to edit it, or click <span className="text-ink">+</span> on a date to assign a draft.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {demoMode ? (
              <StatusPill tone="info">Demo workspace · rescheduling is local-only</StatusPill>
            ) : null}
            {!demoMode && !supabaseConfigured ? (
              <StatusPill tone="warn">Supabase off · calendar empty</StatusPill>
            ) : null}
            {connectedPlatforms.length > 0 ? (
              <StatusPill tone="ok">{connectedPlatforms.length} platforms connected</StatusPill>
            ) : null}
            {dataErrorReason ? (
              <StatusPill tone="err" title={dataErrorReason}>
                Supabase schema not ready
              </StatusPill>
            ) : null}
          </div>
        </header>

        <CalendarView
          monthStart={monthStart}
          scheduled={scheduled}
          drafts={drafts}
          saveDisabledReason={saveDisabledReason}
          connectedPlatforms={connectedPlatforms}
          modelNamesById={modelNamesById}
        />
      </div>
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
      className="inline-flex items-center gap-2 rounded-full bg-surface-1 px-3 py-1.5 text-[12px] text-ink"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
