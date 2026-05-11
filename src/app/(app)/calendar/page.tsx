import {
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { publicEnv } from '@/lib/env';
import { listPostsInRange } from '@/lib/posts';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { PostRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
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

  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let scheduled: PostRow[] = [];
  let drafts: PostRow[] = [];
  let saveDisabledReason: string | null = null;
  let dataErrorReason: string | null = null;

  if (!supabaseConfigured) {
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
        const rangeStart = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 1 });
        const rangeEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
        const result = await listPostsInRange(ws.id, rangeStart, rangeEnd);
        scheduled = result.scheduled;
        drafts = result.drafts;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Supabase error';
      dataErrorReason = message;
      saveDisabledReason = 'Supabase tables not ready — apply migrations 0001 + 0002.';
    }
  }

  return (
    <div className="px-10 py-10">
      <header className="mb-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Drafts you haven&apos;t scheduled sit in the shelf. Click any draft to put it on a
          date, or click any scheduled post to edit its time, caption, or delete it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {!supabaseConfigured ? (
            <span className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-1.5 text-amber-300">
              Supabase not configured — calendar is empty.
            </span>
          ) : null}
          {dataErrorReason ? (
            <span className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-red-300">
              {dataErrorReason}
            </span>
          ) : null}
        </div>
      </header>

      <CalendarView
        monthStart={monthStart}
        scheduled={scheduled}
        drafts={drafts}
        saveDisabledReason={saveDisabledReason}
      />
    </div>
  );
}
