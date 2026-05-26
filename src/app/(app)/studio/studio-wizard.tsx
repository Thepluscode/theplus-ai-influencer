'use client';

import { useActionState, useState } from 'react';
import { ArrowUpRight, Check, Download, Loader2, RefreshCw, Save, Sparkles } from 'lucide-react';
import {
  generateInfluencer,
  saveGeneratedInfluencer,
  type GenerateState,
  type SaveState,
} from './actions';
import { InsufficientCreditsBanner } from '@/components/credits/insufficient-credits-banner';
import { cn } from '@/lib/utils';

const GENDERS = ['woman', 'man', 'non-binary'] as const;
const BODY_TYPES = ['slim', 'athletic', 'curvy', 'plus-size'] as const;
// Taxonomy matches the InfluencerAI reference. See src/types/influencer.ts
// for the canonical zod schema (which also accepts legacy aliases on read).
const SKIN_TONES = ['fair', 'tan', 'olive', 'brown', 'deep'] as const;
const AGE_RANGES = ['18-24', '25-34', '35-45'] as const;
const VIBES = [
  'minimal',
  'cyber',
  'retro',
  'street',
  'luxury',
  'e-girl',
  'cinematic',
  'editorial',
] as const;

type Gender = (typeof GENDERS)[number];
type BodyType = (typeof BODY_TYPES)[number];
type SkinTone = (typeof SKIN_TONES)[number];
type AgeRange = (typeof AGE_RANGES)[number];
type Vibe = (typeof VIBES)[number];

// Emoji prefixes — matches the InfluencerAI reference's chip aesthetic.
// Emoji renders consistently across platforms via the system color emoji
// font; no fallback needed.
const GENDER_EMOJI: Record<Gender, string> = {
  woman: '👩',
  man: '👨',
  'non-binary': '🧑',
};
const BODY_EMOJI: Record<BodyType, string> = {
  slim: '🧍',
  athletic: '💪',
  curvy: '💃',
  'plus-size': '👗',
};
const AGE_EMOJI: Record<AgeRange, string> = {
  '18-24': '❤️',
  '25-34': '💼',
  '35-45': '🍷',
};
const VIBE_EMOJI: Record<Vibe, string> = {
  minimal: '⚪',
  cyber: '🤖',
  retro: '📺',
  street: '🎨',
  luxury: '💎',
  'e-girl': '🎮',
  cinematic: '🎬',
  editorial: '✨',
};

const SKIN_SWATCHES: Record<SkinTone, string> = {
  fair: '#f4d5b8',
  tan: '#e0b48c',
  olive: '#c08a5e',
  brown: '#8a5a3c',
  deep: '#5a3621',
};

export function StudioWizard({ saveDisabledReason }: { saveDisabledReason: string | null }) {
  const [state, formAction, pending] = useActionState<GenerateState | null, FormData>(
    generateInfluencer,
    null,
  );
  const [saveState, saveAction, saving] = useActionState<SaveState | null, FormData>(
    saveGeneratedInfluencer,
    null,
  );

  const last = state?.status === 'success' ? state.input : null;
  const fe = state?.status === 'error' ? state.fieldErrors : undefined;

  const [name, setName] = useState(last?.name ?? '');
  const [gender, setGender] = useState<Gender>((last?.gender as Gender) ?? 'woman');
  const [bodyType, setBodyType] = useState<BodyType>((last?.bodyType as BodyType) ?? 'athletic');
  const [skinTone, setSkinTone] = useState<SkinTone>((last?.skinTone as SkinTone) ?? 'olive');
  const [ageRange, setAgeRange] = useState<AgeRange>((last?.ageRange as AgeRange) ?? '25-34');
  const [hair, setHair] = useState(last?.hair ?? '');
  const [vibe, setVibe] = useState<Vibe>((last?.vibe as Vibe) ?? 'cinematic');
  const [customPrompt, setCustomPrompt] = useState(last?.customPrompt ?? '');

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
      {/* === LEFT: control panel === */}
      <form action={formAction} className="flex flex-col gap-5">
        <PanelCard label="Identity" hint="Persona handle">
          <TextField
            value={name}
            onChange={setName}
            name="name"
            placeholder="e.g. Aria Vance"
            error={fe?.name}
            required
          />
        </PanelCard>

        <PanelCard label="Build">
          <ChipGrid label="Gender" cols={3}>
            {GENDERS.map((g) => (
              <Chip
                key={g}
                active={gender === g}
                onClick={() => setGender(g)}
                icon={GENDER_EMOJI[g]}
              >
                <span className="capitalize">{g}</span>
              </Chip>
            ))}
          </ChipGrid>

          <ChipGrid label="Body type" cols={2}>
            {BODY_TYPES.map((b) => (
              <Chip
                key={b}
                active={bodyType === b}
                onClick={() => setBodyType(b)}
                icon={BODY_EMOJI[b]}
              >
                <span className="capitalize">{b.replace('-', ' ')}</span>
              </Chip>
            ))}
          </ChipGrid>

          <ChipGrid label="Skin tone" cols={5}>
            {SKIN_TONES.map((s) => (
              <Chip
                key={s}
                active={skinTone === s}
                onClick={() => setSkinTone(s)}
                icon={
                  <span
                    className="h-3 w-3 rounded-full ring-1 ring-[#262626]"
                    style={{ backgroundColor: SKIN_SWATCHES[s] }}
                  />
                }
              >
                <span className="capitalize text-[11px]">{s.split('-')[0]}</span>
              </Chip>
            ))}
          </ChipGrid>

          <ChipGrid label="Age range" cols={3}>
            {AGE_RANGES.map((a) => (
              <Chip
                key={a}
                active={ageRange === a}
                onClick={() => setAgeRange(a)}
                icon={AGE_EMOJI[a]}
              >
                <span className="tabular-nums">{a}</span>
              </Chip>
            ))}
          </ChipGrid>
        </PanelCard>

        <PanelCard label="Styling">
          <TextField
            value={hair}
            onChange={setHair}
            name="hair"
            placeholder="e.g. long brown wavy with curtain bangs"
            error={fe?.hair}
            required
          />

          <ChipGrid label="Vibe" cols={3}>
            {VIBES.map((v) => (
              <Chip key={v} active={vibe === v} onClick={() => setVibe(v)} icon={VIBE_EMOJI[v]}>
                <span className="capitalize">{v}</span>
              </Chip>
            ))}
          </ChipGrid>
        </PanelCard>

        <PanelCard label="Prompt builder" hint="Optional · sharpens the render">
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            name="customPrompt"
            placeholder="e.g. brown eyes, freckles, holding a takeaway coffee, golden hour"
            className="min-h-24 w-full rounded-[12px] border border-[#262626] bg-surface-1 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          />
          {fe?.customPrompt ? (
            <p className="text-[12px] text-[#ff5577]">{fe.customPrompt}</p>
          ) : null}
        </PanelCard>

        <input type="hidden" name="gender" value={gender} />
        <input type="hidden" name="bodyType" value={bodyType} />
        <input type="hidden" name="skinTone" value={skinTone} />
        <input type="hidden" name="ageRange" value={ageRange} />
        <input type="hidden" name="vibe" value={vibe} />

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
        {state?.status === 'plan_limit' ? (
          <div className="rounded-[12px] border border-[#ff7a3d]/40 bg-[#ff7a3d]/[0.07] p-4">
            <p className="text-[14px] font-medium text-ink">{state.planName} plan limit reached</p>
            <p className="mt-1 text-[12px] leading-[1.4] text-ink-muted">
              You have {state.current} of {state.max} influencers on the {state.planName} plan.
              Upgrade to add more.
            </p>
            <a
              href="/settings#billing"
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#0099ff] px-3 text-[12px] font-medium text-white transition hover:bg-[#1aa6ff]"
            >
              Upgrade plan
            </a>
          </div>
        ) : null}

        {/* Primary CTA — full-width blue pill per the InfluencerAI reference */}
        <button
          type="submit"
          disabled={pending}
          className={cn(
            'inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-[14px] text-[15px] font-medium text-white transition',
            'bg-[#0099ff] hover:bg-[#1aa6ff] active:scale-[0.99]',
            'shadow-[0_8px_28px_-6px_rgba(0,153,255,0.45)]',
            'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666] disabled:shadow-none',
          )}
        >
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating with Luma…
            </>
          ) : (
            <>
              <Sparkles size={15} />
              {state?.status === 'success'
                ? 'Regenerate (50 credits)'
                : 'Generate Influencer (50 credits)'}
            </>
          )}
        </button>
      </form>

      {/* === RIGHT: cinematic preview canvas === */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[#262626] bg-surface-1 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[11px] font-medium text-ink">
              <Sparkles size={11} className="text-[#0099ff]" />
              Render
            </span>
            <span className="truncate text-[14px] text-ink">
              {name || <span className="italic text-[#666]">Unnamed model</span>}
            </span>
          </div>

          {state?.status === 'success' ? (
            <div className="flex items-center gap-2">
              <form action={saveAction}>
                <input type="hidden" name="input" value={JSON.stringify(state.input)} />
                <input type="hidden" name="visuals" value={JSON.stringify(state.visuals)} />
                <button
                  type="submit"
                  disabled={saving || saveState?.status === 'saved' || Boolean(saveDisabledReason)}
                  title={saveDisabledReason ?? undefined}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12px] font-medium text-ink ring-1 ring-[#262626] transition hover:bg-[#222] disabled:cursor-not-allowed disabled:text-[#666]"
                >
                  {saving ? (
                    <>
                      <Loader2 size={11} className="animate-spin" />
                      Saving…
                    </>
                  ) : saveState?.status === 'saved' ? (
                    <>
                      <Check size={11} />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save size={11} />
                      Save
                    </>
                  )}
                </button>
              </form>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-muted transition hover:text-ink"
                aria-label="Reset wizard"
                title="Reset wizard"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          ) : null}
        </div>

        {saveState?.status === 'error' ? (
          <p
            className="rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-2 text-[12px] text-[#ff5577]"
            role="alert"
          >
            {saveState.error}
          </p>
        ) : null}

        <div className="flex flex-col gap-4">
          <PreviewTile
            label="Portrait"
            corner="01"
            imageUrl={state?.status === 'success' ? state.visuals.portraitUrl : undefined}
            loading={pending}
            aspectClass="aspect-[3/4]"
          />
          <PreviewTile
            label="Full body"
            corner="02"
            imageUrl={state?.status === 'success' ? state.visuals.fullBodyUrl : undefined}
            loading={pending}
            aspectClass="aspect-[9/16]"
          />
        </div>
      </section>
    </div>
  );
}

// ---------- subcomponents ----------

function PanelCard({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          {label}
        </span>
        {hint ? <span className="text-[11px] text-[#666]">{hint}</span> : null}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function ChipGrid({
  label,
  cols,
  children,
}: {
  label: string;
  cols: number;
  children: React.ReactNode;
}) {
  const colsClass: Record<number, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">{label}</span>
      <div className={cn('grid gap-2', colsClass[cols] ?? 'grid-cols-3')}>{children}</div>
    </div>
  );
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
  // Reference-spec: rounded-[12px] surface card with a left icon, label,
  // and a small blue check on the right when active. Active state =
  // 1px blue ring + soft blue glow.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative flex h-11 items-center gap-2 overflow-hidden rounded-[12px] border bg-surface-1 px-3 text-left text-[13px] transition',
        active
          ? 'border-[#0099ff] text-ink shadow-[0_0_0_1px_rgba(0,153,255,0.25),0_0_18px_-6px_rgba(0,153,255,0.45)]'
          : 'border-[#262626] text-ink-muted hover:border-[#444] hover:text-ink',
      )}
    >
      {icon ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[14px] leading-none">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0099ff] text-white">
          <Check size={10} strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

function TextField({
  value,
  onChange,
  name,
  placeholder,
  error,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  name: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        name={name}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-[12px] border border-[#262626] bg-surface-1 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
      />
      {error ? <span className="text-[12px] text-[#ff5577]">{error}</span> : null}
    </div>
  );
}

function PreviewTile({
  label,
  corner,
  imageUrl,
  loading,
  aspectClass,
}: {
  label: string;
  corner: string;
  imageUrl?: string;
  loading: boolean;
  aspectClass: string;
}) {
  return (
    <figure
      className={cn(
        'group relative w-full overflow-hidden rounded-[20px] border border-[#262626] bg-surface-1',
        aspectClass,
      )}
    >
      {imageUrl && !loading ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={`${label} preview`}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-surface-1">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-ink-muted">
              <Loader2 size={20} className="animate-spin text-[#0099ff]" />
              <span className="text-[10px] uppercase tracking-wider">Rendering</span>
            </div>
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-[#444]">
              awaiting render
            </span>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3 text-[10px] uppercase tracking-wider text-white">
        <span className="font-medium">{label}</span>
        <span className="rounded bg-black/40 px-1.5 py-0.5 backdrop-blur">{corner}</span>
      </div>

      {imageUrl && !loading ? (
        <div className="pointer-events-none absolute right-3 top-3 flex translate-y-1 gap-1.5 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink ring-1 ring-[#262626] transition hover:bg-surface-1"
            aria-label={`Open ${label} in new tab`}
          >
            <ArrowUpRight size={12} />
          </a>
          <a
            href={imageUrl}
            download
            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink ring-1 ring-[#262626] transition hover:bg-surface-1"
            aria-label={`Download ${label}`}
          >
            <Download size={12} />
          </a>
        </div>
      ) : null}
    </figure>
  );
}
