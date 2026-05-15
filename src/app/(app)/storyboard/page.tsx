import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowUpRight, Film, Plus, Trash2 } from 'lucide-react';
import { publicEnv } from '@/lib/env';
import { listStoryboards } from '@/lib/storyboards';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { StoryboardRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import type { RenderedShot } from '@/lib/storyboard';
import { cn } from '@/lib/utils';
import { deleteStoryboardAction } from './actions';

export default async function StoryboardIndexPage() {
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let storyboards: StoryboardRow[] = [];
  let loadError: string | null = null;

  if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        storyboards = await listStoryboards(ws.id);
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  return (
    <div className="min-h-full bg-[#070707] text-ink">
      <div className="px-5 py-5 lg:px-6 lg:py-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#1b1b1b] pb-5">
          <div className="max-w-2xl">
            <p className="framer-eyebrow">Storyboard</p>
            <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
              From brief to reel.
              <br />
              In a single shot.
            </h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
              Brief a campaign — the storyboarder writes a 3-6 shot reel script, renders every shot
              with the persona&apos;s face locked, and stitches a preview you can ship to social.
            </p>
            {loadError ? (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-1.5 text-[12px] text-[#ff5577]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff5577]" />
                {loadError}
              </p>
            ) : null}
          </div>
          <Link
            href="/storyboard/new"
            className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#0099ff] px-4 text-[14px] font-medium text-white shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)] transition hover:bg-[#1aa6ff] active:scale-[0.99]"
          >
            <Plus size={14} />
            New storyboard
          </Link>
        </header>

        {storyboards.length === 0 ? (
          <Link
            href="/storyboard/new"
            className="group block rounded-[16px] border border-dashed border-[#262626] bg-surface-1/50 px-6 py-12 text-center transition hover:border-[#0099ff]/50 hover:bg-surface-1"
          >
            <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0099ff]/15 text-[#0099ff] ring-1 ring-[#0099ff]/30">
              <Film size={16} />
            </span>
            <p className="text-[15px] font-medium text-ink">No storyboards yet</p>
            <p className="mt-1 text-[13px] text-ink-muted">
              ~95 credits per 4-shot reel · runs against any saved persona
            </p>
          </Link>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {storyboards.map((s) => (
              <StoryboardCard key={s.id} sb={s} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StoryboardCard({ sb }: { sb: StoryboardRow }) {
  const shots = (Array.isArray(sb.shots) ? sb.shots : []) as RenderedShot[];
  const cover = shots[0]?.imageUrl;
  const aspect =
    sb.format === 'square'
      ? 'aspect-square'
      : sb.format === 'portrait'
        ? 'aspect-[9/16]'
        : 'aspect-[16/9]';
  return (
    <li className="group relative">
      <Link
        href={`/storyboard/${sb.id}`}
        className="block overflow-hidden rounded-[16px] border border-[#262626] bg-surface-1 transition hover:border-[#0099ff]/40"
      >
        <div className={cn('relative overflow-hidden bg-surface-2', aspect)}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[#444]">
              <Film size={20} />
            </div>
          )}
          <span className="absolute left-2.5 top-2.5 inline-flex h-6 items-center gap-1 rounded-full bg-black/55 px-2 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur">
            <Film size={10} />
            {shots.length} shots
          </span>
        </div>
        <div className="flex items-start justify-between gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-ink" title={sb.name}>
              {sb.name}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {format(new Date(sb.created_at), 'MMM d')} · {sb.format}
            </p>
          </div>
          <ArrowUpRight size={14} className="shrink-0 text-ink-muted group-hover:text-ink" />
        </div>
      </Link>
      <form action={deleteStoryboardAction} className="absolute right-2 top-2 z-10">
        <input type="hidden" name="storyboardId" value={sb.id} />
        <button
          type="submit"
          onClick={(e) => {
            if (typeof window !== 'undefined' && !window.confirm('Delete this storyboard?')) {
              e.preventDefault();
            }
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#262626] bg-surface-2 text-ink-muted opacity-0 transition group-hover:opacity-100 hover:border-[#ff5577]/40 hover:bg-[#ff5577]/10 hover:text-[#ff5577]"
          aria-label="Delete storyboard"
          title="Delete storyboard"
        >
          <Trash2 size={11} />
        </button>
      </form>
    </li>
  );
}
