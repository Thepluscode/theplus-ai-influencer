'use client';

import { useActionState, useState } from 'react';
import { Check, Film, Loader2, RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';
import { generateStoryboardAction, type StoryboardState } from '../actions';
import { InsufficientCreditsBanner } from '@/components/credits/insufficient-credits-banner';
import type { AiModelRow } from '@/lib/supabase/types';
import type { PostFormat } from '@/types/post';
import { cn } from '@/lib/utils';

export function StoryboardForm({ models }: { models: AiModelRow[] }) {
  const [state, formAction, pending] = useActionState<StoryboardState | null, FormData>(
    generateStoryboardAction,
    null,
  );

  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [format, setFormat] = useState<PostFormat>('portrait');
  const [shotCount, setShotCount] = useState(4);

  const fe = state?.status === 'error' ? state.fieldErrors : undefined;
  const totalCost = 15 + shotCount * 20;

  if (models.length === 0) {
    return (
      <div className="rounded-[16px] border border-[#ff7a3d]/40 bg-[#ff7a3d]/[0.07] p-5">
        <p className="text-[14px] font-medium text-ink">No influencers yet</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          Cast at least one persona in Studio before generating a storyboard — each shot is
          face-locked via <code className="rounded bg-surface-2 px-1 py-px">character_ref</code>.
        </p>
        <a
          href="/studio/new"
          className="mt-3 inline-flex h-9 items-center rounded-full bg-[#0099ff] px-3.5 text-[12px] font-medium text-white transition hover:bg-[#1aa6ff]"
        >
          Open Studio
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-5">
        <Panel label="Influencer">
          <ul className="-mx-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-2 pb-1">
            {models.map((m) => {
              const active = m.id === modelId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setModelId(m.id)}
                    aria-pressed={active}
                    className={cn(
                      'group relative block w-[112px] shrink-0 snap-start overflow-hidden rounded-[12px] border bg-surface-2 transition',
                      active
                        ? 'border-[#0099ff] shadow-[0_0_24px_-8px_rgba(0,153,255,0.55)]'
                        : 'border-[#262626] hover:border-[#444]',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.portrait_url}
                      alt={m.name}
                      className="aspect-[3/4] w-full object-cover"
                    />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <span className="absolute inset-x-0 bottom-0 truncate px-2 py-1 text-left text-[11px] font-medium text-white">
                      {m.name}
                    </span>
                    {active ? (
                      <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0099ff] text-white">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel label="Reel">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Storyboard name
            </span>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. October citrus launch teaser"
              className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
            />
            {fe?.name ? <span className="text-[12px] text-[#ff5577]">{fe.name}</span> : null}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Brief
            </span>
            <textarea
              name="brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              required
              rows={4}
              placeholder="What's the reel? e.g. Hook with a slow-mo product reveal, mid-reel reaction shot, end with the persona walking out of frame."
              className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
            />
            {fe?.brief ? <span className="text-[12px] text-[#ff5577]">{fe.brief}</span> : null}
          </label>
        </Panel>

        <Panel label="Layout">
          <div className="grid grid-cols-3 gap-2">
            <FormatChip
              active={format === 'portrait'}
              onClick={() => setFormat('portrait')}
              icon={<RectangleVertical size={14} />}
              title="Portrait"
              sub="9:16 · reels"
            />
            <FormatChip
              active={format === 'square'}
              onClick={() => setFormat('square')}
              icon={<Square size={14} />}
              title="Square"
              sub="1:1 · feed"
            />
            <FormatChip
              active={format === 'landscape'}
              onClick={() => setFormat('landscape')}
              icon={<RectangleHorizontal size={14} />}
              title="Landscape"
              sub="16:9 · yt"
            />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Shot count
            </span>
            <input
              type="range"
              min={3}
              max={6}
              value={shotCount}
              onChange={(e) => setShotCount(Number(e.target.value))}
              className="accent-[#0099ff]"
            />
            <span className="text-[12px] text-ink-muted">
              <span className="tabular-nums text-ink">{shotCount}</span> shots ·{' '}
              <span className="tabular-nums text-ink">{totalCost}</span> credits total
            </span>
          </label>
        </Panel>

        {/* hidden inputs */}
        <input type="hidden" name="modelId" value={modelId} />
        <input type="hidden" name="format" value={format} />
        <input type="hidden" name="shotCount" value={shotCount} />

        {state?.status === 'error' ? (
          <p
            className="rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-2 text-[12px] text-[#ff5577]"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}
        {state?.status === 'insufficient_credits' ? (
          <InsufficientCreditsBanner balance={state.balance} required={state.required} />
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className={cn(
            'inline-flex h-12 items-center justify-center gap-2 rounded-[12px] text-[14px] font-medium text-white transition',
            'bg-[#0099ff] hover:bg-[#1aa6ff] active:scale-[0.99]',
            'shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)]',
            'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666] disabled:shadow-none',
          )}
        >
          {pending ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Rendering {shotCount} shots…
            </>
          ) : (
            <>
              <Film size={15} />
              Generate storyboard ({totalCost} credits)
            </>
          )}
        </button>
      </div>

      <aside className="rounded-[16px] border border-[#262626] bg-surface-1 p-5 xl:sticky xl:top-0 xl:self-start">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          How this works
        </p>
        <ol className="mt-3 grid gap-3 text-[13px] leading-[1.5] text-ink-muted">
          <SideStep n={1} title="Script">
            LLM breaks your brief into {shotCount} render-ready shot prompts with hook captions.
          </SideStep>
          <SideStep n={2} title="Render">
            Each shot renders through Luma with the persona&apos;s portrait as{' '}
            <code className="rounded bg-surface-2 px-1 py-px text-ink">character_ref</code>.
          </SideStep>
          <SideStep n={3} title="Preview">
            The detail page cycles shots as an auto-playing reel mock.
          </SideStep>
          <SideStep n={4} title="Cost">
            15 credits for the script + 20 / shot. Refunded if anything fails.
          </SideStep>
        </ol>
      </aside>
    </form>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function FormatChip({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-12 items-center gap-2 rounded-[10px] border bg-surface-2 px-3 text-left transition',
        active
          ? 'border-[#0099ff] shadow-[0_0_0_1px_rgba(0,153,255,0.25)]'
          : 'border-[#262626] hover:border-[#444]',
      )}
    >
      <span className={active ? 'text-[#0099ff]' : 'text-ink-muted'}>{icon}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[12px] font-medium text-ink">{title}</span>
        <span className="text-[10px] text-ink-muted">{sub}</span>
      </span>
    </button>
  );
}

function SideStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0099ff]/15 text-[11px] font-medium text-[#0099ff] ring-1 ring-[#0099ff]/30">
        {n}
      </span>
      <span>
        <span className="text-ink">{title}</span>
        <span className="block text-ink-muted">{children}</span>
      </span>
    </li>
  );
}
