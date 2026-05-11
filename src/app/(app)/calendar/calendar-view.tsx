'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import {
  deletePostAction,
  reschedulePostAction,
  type ReschedState,
} from './actions';
import type { PostRow } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';

interface Props {
  monthStart: Date;
  scheduled: PostRow[];
  drafts: PostRow[];
  saveDisabledReason: string | null;
}

export function CalendarView({ monthStart, scheduled, drafts, saveDisabledReason }: Props) {
  const [editing, setEditing] = useState<PostRow | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthStart]);

  const byDay = useMemo(() => {
    const m = new Map<string, PostRow[]>();
    for (const p of scheduled) {
      if (!p.scheduled_for) continue;
      const key = format(new Date(p.scheduled_for), 'yyyy-MM-dd');
      const list = m.get(key) ?? [];
      list.push(p);
      m.set(key, list);
    }
    return m;
  }, [scheduled]);

  const prevMonth = subMonths(monthStart, 1);
  const nextMonth = addMonths(monthStart, 1);

  return (
    <>
      <Toolbar monthStart={monthStart} prevMonth={prevMonth} nextMonth={nextMonth} />

      {drafts.length > 0 ? (
        <DraftsShelf drafts={drafts} onPick={(p) => setEditing(p)} />
      ) : null}

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div
            key={d}
            className="border-b border-zinc-800 px-2 py-2 text-xs uppercase tracking-wide text-zinc-500"
          >
            {d}
          </div>
        ))}

        {days.map((day, i) => {
          const inMonth = isSameMonth(day, monthStart);
          const dayKey = format(day, 'yyyy-MM-dd');
          const posts = byDay.get(dayKey) ?? [];
          const today = isSameDay(day, new Date());
          return (
            <div
              key={dayKey + i}
              className={cn(
                'min-h-32 border-b border-r border-zinc-800 p-2 text-xs',
                !inMonth && 'bg-zinc-950/50 text-zinc-700',
                inMonth && 'text-zinc-300',
              )}
            >
              <div
                className={cn(
                  'mb-1 flex items-center gap-1 text-[11px]',
                  today && inMonth && 'font-semibold text-zinc-100',
                )}
              >
                <span>{format(day, 'd')}</span>
                {today && inMonth ? (
                  <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] text-zinc-900">
                    today
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                {posts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setEditing(p)}
                    className="flex items-center gap-2 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-left transition hover:border-zinc-700"
                  >
                    {p.variants[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.variants[0].url}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="h-6 w-6 shrink-0 rounded bg-zinc-800" />
                    )}
                    <span className="truncate text-[11px] text-zinc-200" title={p.name}>
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {editing ? (
        <EditModal
          post={editing}
          onClose={() => setEditing(null)}
          saveDisabledReason={saveDisabledReason}
        />
      ) : null}
    </>
  );
}

function Toolbar({
  monthStart,
  prevMonth,
  nextMonth,
}: {
  monthStart: Date;
  prevMonth: Date;
  nextMonth: Date;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Link
          href={`/calendar?month=${format(prevMonth, 'yyyy-MM')}`}
          className="rounded-md border border-zinc-800 bg-zinc-950 p-2 text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </Link>
        <Link
          href="/calendar"
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs uppercase tracking-wide text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
        >
          Today
        </Link>
        <Link
          href={`/calendar?month=${format(nextMonth, 'yyyy-MM')}`}
          className="rounded-md border border-zinc-800 bg-zinc-950 p-2 text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </Link>
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
        {format(monthStart, 'MMMM yyyy')}
      </h2>
    </div>
  );
}

function DraftsShelf({ drafts, onPick }: { drafts: PostRow[]; onPick: (p: PostRow) => void }) {
  return (
    <section className="mb-6">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">Drafts</h3>
        <span className="text-[11px] text-zinc-600">click to schedule</span>
      </header>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {drafts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="flex w-32 shrink-0 flex-col gap-1 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 p-1.5 text-left transition hover:border-zinc-700"
            >
              {p.variants[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.variants[0].url}
                  alt=""
                  className="aspect-square w-full rounded object-cover"
                />
              ) : (
                <span className="aspect-square w-full rounded bg-zinc-900" />
              )}
              <span className="truncate text-[11px] text-zinc-200" title={p.name}>
                {p.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EditModal({
  post,
  onClose,
  saveDisabledReason,
}: {
  post: PostRow;
  onClose: () => void;
  saveDisabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState<ReschedState | null, FormData>(
    reschedulePostAction,
    null,
  );

  // datetime-local needs "YYYY-MM-DDTHH:mm" in *local* time.
  const initialWhen = post.scheduled_for
    ? format(new Date(post.scheduled_for), "yyyy-MM-dd'T'HH:mm")
    : '';

  const settled = state?.status === 'saved' || state?.status === 'partial';
  const saveDisabled = pending || settled || Boolean(saveDisabledReason);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <header className="border-b border-zinc-800 px-4 py-3">
          <h3 className="truncate text-sm font-semibold text-zinc-100" title={post.name}>
            {post.name}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {post.platforms.length > 0
              ? post.platforms.map((p) => p[0].toUpperCase() + p.slice(1)).join(' · ')
              : 'no platforms'}{' '}
            · {post.format} · {post.status}
          </p>
        </header>

        {post.variants[0]?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.variants[0].url}
            alt=""
            className={cn(
              'w-full object-cover',
              post.format === 'square' && 'aspect-square',
              post.format === 'portrait' && 'aspect-[9/16]',
              post.format === 'landscape' && 'aspect-[16/9]',
            )}
          />
        ) : null}

        <form action={formAction} className="flex flex-col gap-3 p-4">
          <input type="hidden" name="postId" value={post.id} />
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Scheduled for</span>
            <input
              name="scheduledFor"
              type="datetime-local"
              defaultValue={initialWhen}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
            />
            <span className="text-[11px] text-zinc-600">
              Leave blank to move back to drafts.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Caption</span>
            <textarea
              name="caption"
              defaultValue={post.caption ?? ''}
              rows={3}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
            />
          </label>

          {state?.status === 'error' ? (
            <p className="text-xs text-red-400" role="alert">
              {state.error}
            </p>
          ) : null}
          {state?.status === 'partial' ? (
            <p className="text-xs text-amber-300" role="status">
              Saved with caveat: {state.warning}
            </p>
          ) : null}
          {state?.status === 'saved' && state.pushedToZernio ? (
            <p className="text-xs text-emerald-300" role="status">
              Pushed to Zernio.
            </p>
          ) : null}
          {saveDisabledReason ? (
            <p className="text-xs text-zinc-500">{saveDisabledReason}</p>
          ) : null}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saveDisabled}
              title={saveDisabledReason ?? undefined}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-500"
            >
              {pending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save size={14} />
                  {settled ? 'Saved' : 'Save'}
                </>
              )}
            </button>
            <DeleteButton postId={post.id} onDeleted={onClose} />
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteButton({ postId, onDeleted }: { postId: string; onDeleted: () => void }) {
  return (
    <form
      action={async (fd) => {
        if (!confirm('Delete this post? This cannot be undone.')) return;
        await deletePostAction(fd);
        onDeleted();
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <button
        type="submit"
        className="rounded-md border border-zinc-800 bg-zinc-950 p-2 text-zinc-400 transition hover:border-red-900/60 hover:bg-red-950/20 hover:text-red-300"
        aria-label="Delete post"
        title="Delete post"
      >
        <Trash2 size={14} />
      </button>
    </form>
  );
}
