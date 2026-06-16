'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Film, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CHANNELS,
  VISUAL_CHANNELS,
  type ChannelKey,
} from '@/lib/content-sources-schema';
import { packItemToPlainText } from '@/lib/content-repackage-schema';
import type {
  ContentAtomRow,
  ContentPackItemRow,
  ContentPackRow,
  ContentSourceRow,
} from '@/lib/supabase/types';
import {
  approvePackItemAction,
  generateContentPackAction,
  generateMediaForItemAction,
  runSourceExtractionAction,
  schedulePackItemAction,
} from '../actions';

interface Props {
  source: ContentSourceRow;
  atoms: ContentAtomRow[];
  pack: ContentPackRow | null;
  items: ContentPackItemRow[];
  demoMode: boolean;
}

function channelLabel(key: string): string {
  return CHANNELS.find((c) => c.key === key)?.label ?? key;
}

export function SourceDetailClient({ source, atoms, pack, items, demoMode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(
    demoMode ? 'Demo mode — actions are simulated; nothing is published.' : null,
  );

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setBanner(res.error ?? 'Something went wrong.');
        return;
      }
      router.refresh();
    });
  }

  const canExtract = source.status === 'failed';
  const canGeneratePack =
    !pack && (source.status === 'extracted' || source.status === 'ready') && atoms.length > 0;

  return (
    <div className="space-y-6">
      {banner ? (
        <p className="rounded-[10px] border border-[#262626] bg-[#0c0c0c] px-3 py-2 text-[12px] text-ink-muted">
          {banner}
        </p>
      ) : null}

      {source.last_error ? (
        <p className="rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/10 px-3 py-2 text-[12px] text-[#ff5577]">
          {source.last_error}
        </p>
      ) : null}

      {/* Extracted text preview */}
      {source.extracted_text ? (
        <section className="rounded-[14px] border border-[#262626] bg-surface-2/40 p-4">
          <h2 className="mb-2 text-[13px] font-medium">Extracted text</h2>
          <p className="line-clamp-4 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-muted">
            {source.extracted_text}
          </p>
        </section>
      ) : null}

      {/* Atoms */}
      <section className="rounded-[14px] border border-[#262626] bg-surface-2/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-medium">Content atoms ({atoms.length})</h2>
          {canExtract ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => runSourceExtractionAction(source.id))}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#262626] px-3 py-1 text-[12px] text-ink-muted transition hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={12} /> Re-run extraction
            </button>
          ) : null}
        </div>
        {atoms.length === 0 ? (
          <p className="text-[12px] text-ink-muted">
            {source.status === 'extracting' ? 'Extraction in progress…' : 'No atoms yet.'}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {atoms.map((a) => (
              <div key={a.id} className="rounded-[10px] bg-[#0c0c0c] p-3">
                <span className="text-[10px] uppercase tracking-wider text-[#0099ff]">{a.kind}</span>
                <p className="mt-1 text-[12px] leading-relaxed text-ink">{a.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pack */}
      <section className="rounded-[14px] border border-[#262626] bg-surface-2/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-medium">
            Content pack {pack ? `(${items.length} channels)` : ''}
          </h2>
          {canGeneratePack ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => generateContentPackAction(source.id))}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0099ff] px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#0088ee] disabled:opacity-50"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Generate 10-channel pack
            </button>
          ) : null}
        </div>

        {!pack ? (
          <p className="text-[12px] text-ink-muted">
            {source.status === 'repackaging'
              ? 'Repackaging in progress…'
              : canGeneratePack
                ? 'Generate a pack to repurpose this source across 10 channels.'
                : 'Extract the source first, then generate a pack.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <PackItemCard key={item.id} item={item} pending={pending} run={run} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PackItemCard({
  item,
  pending,
  run,
}: {
  item: ContentPackItemRow;
  pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [scheduleAt, setScheduleAt] = useState('');
  const preview = packItemToPlainText(item.channel, item.body);
  const mediaImages = ((item.body as Record<string, unknown>)?.mediaImages as string[]) ?? [];
  const isVisual = VISUAL_CHANNELS.includes(item.channel as ChannelKey);
  const canApprove = item.status === 'draft' || item.status === 'ready_for_approval';
  const canSchedule = item.status === 'approved';
  const canMedia = isVisual && item.status === 'draft';

  return (
    <li className="rounded-[10px] bg-[#0c0c0c] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink">{channelLabel(item.channel)}</span>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px]',
            item.status === 'scheduled' || item.status === 'published'
              ? 'text-[#22c55e]'
              : item.status === 'approved'
                ? 'text-[#0099ff]'
                : item.status === 'failed'
                  ? 'text-[#ff5577]'
                  : 'text-ink-muted',
          )}
        >
          {item.status === 'scheduled' || item.status === 'published' ? (
            <CheckCircle2 size={12} />
          ) : null}
          {item.status}
        </span>
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-muted">
        {preview}
      </p>

      {mediaImages.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {mediaImages.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt=""
              className="h-16 w-16 rounded-[8px] border border-[#262626] object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canMedia ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => generateMediaForItemAction(item.id))}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#262626] px-3 py-1 text-[11px] text-ink-muted transition hover:text-ink disabled:opacity-50"
          >
            <Film size={11} /> Media brief
          </button>
        ) : null}

        {canApprove ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => approvePackItemAction(item.id))}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0099ff] px-3 py-1 text-[11px] font-medium text-white transition hover:bg-[#0088ee] disabled:opacity-50"
          >
            <CheckCircle2 size={11} /> Approve
          </button>
        ) : null}

        {canSchedule ? (
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-[8px] border border-[#262626] bg-[#0c0c0c] px-2 py-1 text-[11px] text-ink outline-none focus:border-[#0099ff]/60"
            />
            <button
              type="button"
              disabled={pending || !scheduleAt}
              onClick={() =>
                run(() => schedulePackItemAction(item.id, new Date(scheduleAt).toISOString()))
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-[#22c55e] px-3 py-1 text-[11px] font-medium text-black transition hover:bg-[#1eb555] disabled:opacity-50"
            >
              <Clock size={11} /> Schedule
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
