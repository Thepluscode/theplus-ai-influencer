'use client';

import { useMemo, useState } from 'react';
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
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { PostDetailsModal } from '@/components/posts/post-details-modal';
import type { PostRow } from '@/lib/supabase/types';
import type { Platform } from '@/types/post';
import { cn } from '@/lib/utils';

interface Props {
  monthStart: Date;
  scheduled: PostRow[];
  drafts: PostRow[];
  saveDisabledReason: string | null;
  connectedPlatforms: Platform[];
  modelNamesById: Record<string, string>;
}

export function CalendarView({
  monthStart,
  scheduled,
  drafts,
  saveDisabledReason,
  connectedPlatforms,
  modelNamesById,
}: Props) {
  const [editing, setEditing] = useState<PostRow | null>(null);
  const [picker, setPicker] = useState<{ date: Date } | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });
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
      <Toolbar
        monthStart={monthStart}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        scheduledCount={scheduled.length}
        draftCount={drafts.length}
      />

      <div className="workflow-panel overflow-hidden backdrop-blur">
        {/* Day-name header row */}
        <div className="grid grid-cols-7 border-b border-[#1a1a1a]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div
              key={d}
              className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-muted"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const inMonth = isSameMonth(day, monthStart);
            const dayKey = format(day, 'yyyy-MM-dd');
            const posts = byDay.get(dayKey) ?? [];
            const today = isSameDay(day, new Date());
            return (
              <div
                key={dayKey + i}
                className={cn(
                  'group/cell relative min-h-[132px] border-b border-r border-white/[0.06] px-3 py-2.5 transition-colors',
                  !inMonth && 'opacity-40',
                  'hover:bg-white/[0.015]',
                )}
              >
                {/* Day number — big, top-left. Today is cyan. */}
                <div
                  className={cn(
                    'mb-2 text-[15px] font-medium tabular-nums leading-none',
                    today ? 'text-[#0099ff]' : 'text-ink-muted group-hover/cell:text-ink',
                  )}
                >
                  {format(day, 'd')}
                </div>

                {/* Hover-only "+" — opens a picker keyed to this date */}
                {inMonth && drafts.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPicker({ date: day })}
                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0099ff] text-white opacity-0 shadow-[0_4px_18px_-6px_rgba(0,153,255,0.7)] transition group-hover/cell:opacity-100 hover:bg-[#1aa6ff]"
                    aria-label={`Add post to ${format(day, 'MMM d')}`}
                  >
                    <Plus size={14} strokeWidth={2.5} />
                  </button>
                ) : null}

                {/* Event chips */}
                <div className="flex flex-col gap-1.5">
                  {posts.map((p) => (
                    <EventPill key={p.id} post={p} onClick={() => setEditing(p)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drafts strip lives below the grid so the canvas above stays clean,
          matching the reference's quiet layout. */}
      {drafts.length > 0 ? <DraftsShelf drafts={drafts} onPick={(p) => setEditing(p)} /> : null}

      <PostDetailsModal
        post={editing}
        connectedPlatforms={connectedPlatforms}
        modelName={editing?.model_id ? modelNamesById[editing.model_id] : null}
        saveDisabledReason={saveDisabledReason}
        onClose={() => setEditing(null)}
      />

      {picker ? (
        <DraftPicker
          date={picker.date}
          drafts={drafts}
          onPick={(p) => {
            setPicker(null);
            setEditing(p);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </>
  );
}

function Toolbar({
  monthStart,
  prevMonth,
  nextMonth,
  scheduledCount,
  draftCount,
}: {
  monthStart: Date;
  prevMonth: Date;
  nextMonth: Date;
  scheduledCount: number;
  draftCount: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-ink">
          {format(monthStart, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-1">
          <Link
            href={`/calendar?month=${format(prevMonth, 'yyyy-MM')}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.045] text-ink-muted transition hover:border-white/25 hover:text-ink"
            aria-label="Previous month"
          >
            <ChevronLeft size={14} />
          </Link>
          <Link
            href={`/calendar?month=${format(nextMonth, 'yyyy-MM')}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.045] text-ink-muted transition hover:border-white/25 hover:text-ink"
            aria-label="Next month"
          >
            <ChevronRight size={14} />
          </Link>
          <Link
            href="/calendar"
            className="ml-1 inline-flex h-7 items-center rounded-md border border-white/10 bg-white/[0.045] px-2.5 text-[11px] font-medium uppercase tracking-wider text-ink transition hover:border-white/25 hover:text-ink"
          >
            Today
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <CountPill tone="sky" label="scheduled" value={scheduledCount} />
        <CountPill tone="muted" label="drafts" value={draftCount} />
      </div>
    </div>
  );
}

function CountPill({
  tone,
  label,
  value,
}: {
  tone: 'sky' | 'muted';
  label: string;
  value: number;
}) {
  const dot = tone === 'sky' ? 'bg-[#0099ff]' : 'bg-ink-muted';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-1 text-ink-muted">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      <span className="font-semibold tabular-nums text-ink">{value}</span>
      <span className="uppercase tracking-wider">{label}</span>
    </span>
  );
}

function EventPill({ post, onClick }: { post: PostRow; onClick: () => void }) {
  const thumb = post.variants[0]?.url;
  const time = post.scheduled_for ? format(new Date(post.scheduled_for), 'h:mm a') : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/pill flex w-full items-center gap-2 overflow-hidden rounded-full border border-white/10 bg-black/30 py-1.5 pl-1.5 pr-3 text-left transition hover:border-[#0099ff]/50 hover:bg-white/[0.06]"
      title={post.name}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/10"
        />
      ) : (
        <span className="h-7 w-7 shrink-0 rounded-full bg-surface-2" />
      )}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-center gap-1 text-[12px] font-medium text-ink">
          <Camera size={11} className="shrink-0 text-ink-muted" />
          <span className="truncate">{post.name}</span>
          {post.share_token ? <CheckCircle2 size={11} className="shrink-0 text-[#86efac]" /> : null}
        </span>
        {time ? <span className="text-[10px] text-ink-muted">{time}</span> : null}
      </span>
    </button>
  );
}

function DraftsShelf({ drafts, onPick }: { drafts: PostRow[]; onPick: (p: PostRow) => void }) {
  return (
    <section className="workflow-panel mt-6 p-4 backdrop-blur">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-muted">
            Drafts shelf
          </h3>
          <p className="mt-0.5 text-[11px] text-ink-muted">Click any draft to schedule it.</p>
        </div>
        <span className="rounded-md border border-[#262626] bg-surface-2/80 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-muted">
          {drafts.length} pending
        </span>
      </header>
      <ul className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {drafts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="group relative block w-[148px] shrink-0 snap-start overflow-hidden rounded-xl ring-1 ring-[#262626] transition hover:ring-[#0099ff]/50"
            >
              {p.variants[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.variants[0].url}
                  alt=""
                  className="aspect-square w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <span className="block aspect-square w-full bg-surface-2" />
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 truncate px-2 py-1.5 text-left text-[11px] font-medium text-white">
                {p.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DraftPicker({
  date,
  drafts,
  onPick,
  onClose,
}: {
  date: Date;
  drafts: PostRow[];
  onPick: (p: PostRow) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#262626] bg-surface-1 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        <header className="flex items-center justify-between border-b border-[#1a1a1a] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0099ff]">
              Schedule on
            </p>
            <h3 className="mt-0.5 text-sm font-semibold text-ink">{format(date, 'EEEE, MMM d')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#262626] bg-surface-2 text-ink-muted transition hover:border-[#444] hover:text-ink"
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {drafts.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-ink-muted">
              No drafts available. Create one in <strong>/create-post</strong>.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {drafts.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    className="group relative block w-full overflow-hidden rounded-lg ring-1 ring-[#262626] transition hover:ring-[#0099ff]/50"
                  >
                    {p.variants[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.variants[0].url}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <span className="block aspect-square w-full bg-surface-2" />
                    )}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/85 to-transparent" />
                    <span className="absolute inset-x-0 bottom-0 truncate px-2 py-1 text-left text-[11px] font-medium text-white">
                      {p.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
