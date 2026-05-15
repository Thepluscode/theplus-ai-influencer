'use client';

import { useActionState, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { generateSeriesPlanAction, type SeriesPlanState } from '../actions';
import { InsufficientCreditsBanner } from '@/components/credits/insufficient-credits-banner';
import type { AiModelRow } from '@/lib/supabase/types';
import { PLATFORMS, POST_GOALS, type Platform, type PostGoal } from '@/types/post';
import { cn } from '@/lib/utils';

const PLATFORM_GRADIENT: Record<Platform, string> = {
  instagram:
    'bg-[linear-gradient(135deg,#feda75_0%,#fa7e1e_25%,#d62976_55%,#962fbf_80%,#4f5bd5_100%)]',
  tiktok: 'bg-[linear-gradient(135deg,#25f4ee_0%,#000_55%,#fe2c55_100%)]',
  twitter: 'bg-[linear-gradient(135deg,#1d1d1d_0%,#000_100%)]',
  youtube: 'bg-[linear-gradient(135deg,#ff0000_0%,#cc0000_100%)]',
  facebook: 'bg-[linear-gradient(135deg,#0866ff_0%,#0a4cb5_100%)]',
  linkedin: 'bg-[linear-gradient(135deg,#0a66c2_0%,#004182_100%)]',
  pinterest: 'bg-[linear-gradient(135deg,#e60023_0%,#bd081c_100%)]',
  threads: 'bg-[linear-gradient(135deg,#0a0a0a_0%,#3a3a3a_100%)]',
  reddit: 'bg-[linear-gradient(135deg,#ff4500_0%,#cc3700_100%)]',
};

const GOAL_EMOJI: Record<PostGoal, string> = {
  awareness: '📢',
  engagement: '💬',
  launch: '🚀',
  sales: '💰',
  community: '🤝',
};

export function SeriesPlanForm({ models }: { models: AiModelRow[] }) {
  const [state, formAction, pending] = useActionState<SeriesPlanState | null, FormData>(
    generateSeriesPlanAction,
    null,
  );

  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const [name, setName] = useState('');
  const [campaign, setCampaign] = useState('');
  const [goal, setGoal] = useState<PostGoal>('engagement');
  const [durationDays, setDurationDays] = useState(14);
  const [cadencePerWeek, setCadencePerWeek] = useState(4);
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set(['instagram']));
  const defaultStart = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [startDate, setStartDate] = useState(defaultStart);

  const fe = state?.status === 'error' ? state.fieldErrors : undefined;
  const estimatedPostCount = Math.max(1, Math.round((durationDays * cadencePerWeek) / 7));

  function togglePlatform(p: Platform) {
    const next = new Set(platforms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPlatforms(next);
  }

  if (models.length === 0) {
    return (
      <div className="rounded-[16px] border border-[#ff7a3d]/40 bg-[#ff7a3d]/[0.07] p-5">
        <p className="text-[14px] font-medium text-ink">No influencers yet</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          Cast at least one persona in Studio before generating a plan — the planner needs a
          voice to write against.
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
    <form action={formAction} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-5">
        <Panel label="Influencer">
          <ModelRail
            models={models}
            value={modelId}
            onChange={setModelId}
            error={fe?.modelId}
          />
        </Panel>

        <Panel label="Plan">
          <Field
            label="Plan name"
            name="name"
            value={name}
            onChange={setName}
            placeholder="e.g. October citrus drink push"
            error={fe?.name}
            required
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Campaign
            </span>
            <textarea
              name="campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              required
              rows={4}
              placeholder="What's the arc about? e.g. Launch the citrus drink to Gen-Z fitness creators across IG + TikTok."
              className="w-full rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
            />
            {fe?.campaign ? (
              <span className="text-[12px] text-[#ff5577]">{fe.campaign}</span>
            ) : null}
          </label>
        </Panel>

        <Panel label="Goal">
          <ChipGrid cols={3}>
            {POST_GOALS.map((g) => (
              <Chip key={g} active={goal === g} onClick={() => setGoal(g)} icon={GOAL_EMOJI[g]}>
                <span className="capitalize">{g}</span>
              </Chip>
            ))}
          </ChipGrid>
        </Panel>

        <Panel label="Cadence">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberField
              label="Duration (days)"
              value={durationDays}
              min={3}
              max={60}
              onChange={setDurationDays}
              error={fe?.durationDays}
            />
            <NumberField
              label="Posts / week"
              value={cadencePerWeek}
              min={1}
              max={14}
              onChange={setCadencePerWeek}
              error={fe?.cadencePerWeek}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                Start date
              </span>
              <input
                type="date"
                name="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
                required
              />
              {fe?.startDate ? (
                <span className="text-[12px] text-[#ff5577]">{fe.startDate}</span>
              ) : null}
            </label>
          </div>
          <p className="text-[11px] text-[#666]">
            Estimated ≈ <span className="tabular-nums text-ink">{estimatedPostCount}</span>{' '}
            posts across {durationDays} days.
          </p>
        </Panel>

        <Panel label="Platforms">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(PLATFORMS as readonly Platform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                aria-pressed={platforms.has(p)}
                className={cn(
                  'relative flex h-10 items-center justify-center overflow-hidden rounded-[10px] border transition',
                  platforms.has(p)
                    ? 'border-[#0099ff] shadow-[0_0_0_1px_rgba(0,153,255,0.25)]'
                    : 'border-[#262626] hover:border-[#444]',
                )}
              >
                <span
                  className={cn('absolute inset-0 opacity-80', PLATFORM_GRADIENT[p])}
                  aria-hidden
                />
                <span className="absolute inset-0 bg-black/40" />
                <span className="relative text-[11px] font-medium capitalize text-white">
                  {p}
                </span>
              </button>
            ))}
          </div>
          {fe?.platforms ? (
            <p className="text-[12px] text-[#ff5577]">{fe.platforms}</p>
          ) : null}
        </Panel>

        <input type="hidden" name="modelId" value={modelId} />
        <input type="hidden" name="goal" value={goal} />
        <input type="hidden" name="durationDays" value={durationDays} />
        <input type="hidden" name="cadencePerWeek" value={cadencePerWeek} />
        {Array.from(platforms).map((p) => (
          <input key={p} type="hidden" name="platforms" value={p} />
        ))}

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
              Generating plan…
            </>
          ) : (
            <>
              <Sparkles size={15} />
              Generate plan (10 credits)
            </>
          )}
        </button>
      </div>

      {/* Side rail */}
      <aside className="rounded-[16px] border border-[#262626] bg-surface-1 p-5 xl:sticky xl:top-0 xl:self-start">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          How this works
        </p>
        <ol className="mt-3 grid gap-3 text-[13px] leading-[1.5] text-ink-muted">
          <SideStep n={1} title="Pick the persona">
            The plan inherits the persona&apos;s vibe — voice, aesthetic, age bracket.
          </SideStep>
          <SideStep n={2} title="Frame the campaign">
            One paragraph the LLM uses to build the narrative arc.
          </SideStep>
          <SideStep n={3} title="Set cadence">
            Choose duration + posts/week. The planner spreads posts evenly across the window.
          </SideStep>
          <SideStep n={4} title="Brief the keepers">
            Each plan item one-clicks into Create Post with the fields pre-filled.
          </SideStep>
        </ol>
      </aside>
    </form>
  );
}

// ---------- subcomponents ----------

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

function ChipGrid({ cols, children }: { cols: number; children: React.ReactNode }) {
  const c: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' };
  return <div className={cn('grid gap-2', c[cols] ?? 'grid-cols-3')}>{children}</div>;
}

function Chip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-11 items-center gap-2 rounded-[10px] border bg-surface-2 px-3 text-left text-[13px] transition',
        active
          ? 'border-[#0099ff] text-ink shadow-[0_0_0_1px_rgba(0,153,255,0.25)]'
          : 'border-[#262626] text-ink-muted hover:border-[#444] hover:text-ink',
      )}
    >
      {icon ? <span className="text-[14px]">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      {active ? (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0099ff] text-white">
          <Check size={10} strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  error,
  required,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
      />
      {error ? <span className="text-[12px] text-[#ff5577]">{error}</span> : null}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  error,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[14px] tabular-nums text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
      />
      {error ? <span className="text-[12px] text-[#ff5577]">{error}</span> : null}
    </label>
  );
}

function ModelRail({
  models,
  value,
  onChange,
  error,
}: {
  models: AiModelRow[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="-mx-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-2 pb-1">
        {models.map((m) => {
          const active = m.id === value;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onChange(m.id)}
                aria-pressed={active}
                className={cn(
                  'group relative block w-[112px] shrink-0 snap-start overflow-hidden rounded-[12px] border bg-surface-2 transition',
                  active
                    ? 'border-[#0099ff] shadow-[0_0_24px_-8px_rgba(0,153,255,0.55)]'
                    : 'border-[#262626] hover:border-[#444]',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.portrait_url} alt={m.name} className="aspect-[3/4] w-full object-cover" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 truncate px-2 py-1 text-left text-[11px] font-medium text-white">
                  {m.name}
                </span>
                {active ? (
                  <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0099ff] text-white shadow">
                    <Check size={11} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? <span className="text-[12px] text-[#ff5577]">{error}</span> : null}
    </div>
  );
}

function SideStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
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
