'use client';

import { useActionState, useState } from 'react';
import {
  Check,
  Copy,
  Hash,
  Loader2,
  RotateCw,
  Sparkles,
  Square,
  Wand2,
  RectangleVertical,
  RectangleHorizontal,
} from 'lucide-react';
import {
  generateCaptionsAction,
  generatePostVariantsAction,
  reformatCaptionAction,
  type CaptionsState,
  type GeneratePostState,
  type ReformatState,
} from './actions';
import { InsufficientCreditsBanner } from '@/components/credits/insufficient-credits-banner';
import { UploadSlot } from './upload-slot';
import { LivePreview } from './live-preview';
import { SchedulePanel } from './schedule-panel';
import type { AiModelRow, WorkspaceBrandDefaultsRow } from '@/lib/supabase/types';
import {
  BRAND_TONES,
  CTAS,
  FORMATS,
  LIGHTING_STYLES,
  PLATFORMS,
  POST_GOALS,
  type LightingStyle,
  type Platform,
  type PostGoal,
} from '@/types/post';
import { cn } from '@/lib/utils';

export interface CreatePostPrefill {
  modelId: string | null;
  name: string;
  brief: string;
  scene: string;
  outfit: string;
  props: string;
  postGoal: PostGoal;
  lighting: LightingStyle;
  brandTone: (typeof BRAND_TONES)[number];
  cta: (typeof CTAS)[number];
  platforms: Platform[];
  format: (typeof FORMATS)[number];
}

interface Props {
  models: AiModelRow[];
  workspaceId: string | null;
  connectedPlatforms: Platform[];
  saveDisabledReason: string | null;
  prefill?: CreatePostPrefill;
  brandDefaults?: WorkspaceBrandDefaultsRow;
}

// Brand-tinted gradients keep platform chips recognizable at a glance.
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

const TONE_EMOJI: Record<(typeof BRAND_TONES)[number], string> = {
  professional: '🤵',
  casual: '👋',
  playful: '🎉',
  luxe: '💎',
  edgy: '⚡',
};

const CTA_EMOJI: Record<(typeof CTAS)[number], string> = {
  shop_now: '🛒',
  learn_more: '📖',
  sign_up: '✍️',
  swipe_up: '👆',
  dm_me: '💬',
  no_cta: '⛔',
};

const POST_GOAL_EMOJI: Record<PostGoal, string> = {
  awareness: '📢',
  engagement: '💬',
  launch: '🚀',
  sales: '💰',
  community: '🤝',
};

const LIGHTING_EMOJI: Record<LightingStyle, string> = {
  natural: '🌤️',
  golden_hour: '🌇',
  studio: '🎬',
  neon: '🪩',
  overcast: '☁️',
  cinematic: '🎞️',
};

export function CreatePostForm({
  models,
  workspaceId,
  connectedPlatforms,
  saveDisabledReason,
  prefill,
  brandDefaults,
}: Props) {
  const [state, formAction, pending] = useActionState<GeneratePostState | null, FormData>(
    generatePostVariantsAction,
    null,
  );
  const [selectedVariant, setSelectedVariant] = useState(0);

  // Caption Writer + Cross-Platform Reformatter state — lifted from the
  // save panel so the captions panel can write into the same `caption`
  // value the operator submits.
  const [captionsState, captionsAction, generatingCaptions] = useActionState<
    CaptionsState | null,
    FormData
  >(generateCaptionsAction, null);
  const [reformatState, reformatAction, reformatting] = useActionState<
    ReformatState | null,
    FormData
  >(reformatCaptionAction, null);
  const [caption, setCaption] = useState('');
  const [chosenCandidateId, setChosenCandidateId] = useState<string | null>(null);
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);

  const [modelId, setModelId] = useState<string>(prefill?.modelId ?? models[0]?.id ?? '');
  const [platforms, setPlatforms] = useState<Set<Platform>>(
    new Set(prefill?.platforms?.length ? prefill.platforms : (['instagram'] as Platform[])),
  );
  const [format, setFormat] = useState<(typeof FORMATS)[number]>(prefill?.format ?? 'square');
  const [brandTone, setBrandTone] = useState<(typeof BRAND_TONES)[number]>(
    prefill?.brandTone ?? brandDefaults?.brand_tone ?? 'casual',
  );
  const [cta, setCta] = useState<(typeof CTAS)[number]>(
    prefill?.cta ?? brandDefaults?.default_cta ?? 'no_cta',
  );
  const [postGoal, setPostGoal] = useState<PostGoal>(prefill?.postGoal ?? 'engagement');
  const [lighting, setLighting] = useState<LightingStyle>(prefill?.lighting ?? 'natural');
  const brandVibe = brandDefaults?.brand_vibe ?? '';
  const brandPalette = brandDefaults?.brand_palette ?? '';

  // Operator-uploaded image URLs. When `uploadedImageUrl` is set, the
  // action picks the skip-render code path. Up to 3 product references
  // ride together as image_refs to Luma.
  const [uploadedImageUrl, setUploadedImageUrl] = useState('');
  const [productRefUrls, setProductRefUrls] = useState<string[]>(['', '', '']);
  const setProductRefAt = (i: number, url: string) =>
    setProductRefUrls((prev) => prev.map((v, idx) => (idx === i ? url : v)));
  const hasAnyProductRef = productRefUrls.some(Boolean);
  const skipRender = Boolean(uploadedImageUrl);

  const fe = state?.status === 'error' ? state.fieldErrors : undefined;
  const selectedModel = models.find((m) => m.id === modelId);

  function togglePlatform(p: Platform) {
    const next = new Set(platforms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPlatforms(next);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
      {/* === LEFT: brief panel === */}
      <form action={formAction} className="flex flex-col gap-5">
        <PanelCard
          label="01 · Model"
          hint={selectedModel ? selectedModel.name : 'Pick a saved persona'}
        >
          <ModelRail models={models} value={modelId} onChange={setModelId} error={fe?.modelId} />
        </PanelCard>

        <PanelCard
          label="02 · Campaign"
          hint={prefill ? 'Pre-filled from a Series plan' : undefined}
        >
          <Input
            name="name"
            placeholder="e.g. Citrus energy drink launch"
            error={fe?.name}
            defaultValue={prefill?.name}
            required
          />
          <textarea
            name="brief"
            placeholder="What's the post about? e.g. Launching our citrus energy drink, target Gen-Z fitness creators."
            required
            defaultValue={prefill?.brief}
            className="min-h-24 w-full rounded-md border border-[#262626] bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          />
          {fe?.brief ? <p className="text-xs text-red-400">{fe.brief}</p> : null}
        </PanelCard>

        <PanelCard
          label="03 · Reference images"
          hint={skipRender ? 'Final image set' : 'Max 3 · optional'}
        >
          <UploadSlot
            intent="final"
            workspaceId={workspaceId}
            value={uploadedImageUrl}
            onChange={setUploadedImageUrl}
          />
          <div className="grid grid-cols-3 gap-2">
            {productRefUrls.map((url, i) => (
              <UploadSlot
                key={i}
                intent="reference"
                workspaceId={workspaceId}
                value={url}
                onChange={(v) => setProductRefAt(i, v)}
                disabled={skipRender}
              />
            ))}
          </div>
        </PanelCard>

        <PanelCard label="04 · Distribution">
          <PlatformPicker
            platforms={platforms}
            connectedPlatforms={connectedPlatforms}
            onToggle={togglePlatform}
          />
          {fe?.platforms ? <p className="text-[12px] text-[#ff5577]">{fe.platforms}</p> : null}

          <ChipGrid label="Format" cols={3}>
            <FormatChip
              active={format === 'square'}
              onClick={() => setFormat('square')}
              icon={<Square size={14} />}
              title="Square"
              sub="1:1"
            />
            <FormatChip
              active={format === 'portrait'}
              onClick={() => setFormat('portrait')}
              icon={<RectangleVertical size={14} />}
              title="Portrait"
              sub="9:16"
            />
            <FormatChip
              active={format === 'landscape'}
              onClick={() => setFormat('landscape')}
              icon={<RectangleHorizontal size={14} />}
              title="Landscape"
              sub="16:9"
            />
          </ChipGrid>
          {fe?.format ? <p className="text-[12px] text-[#ff5577]">{fe.format}</p> : null}
        </PanelCard>

        <PanelCard label="05 · Scene direction" hint="Optional — sharpens the render">
          <ChipGrid label="Post goal" cols={3}>
            {POST_GOALS.map((g) => (
              <Chip
                key={g}
                active={postGoal === g}
                onClick={() => setPostGoal(g)}
                icon={POST_GOAL_EMOJI[g]}
              >
                <span className="capitalize">{g}</span>
              </Chip>
            ))}
          </ChipGrid>

          <ChipGrid label="Lighting" cols={3}>
            {LIGHTING_STYLES.map((l) => (
              <Chip
                key={l}
                active={lighting === l}
                onClick={() => setLighting(l)}
                icon={LIGHTING_EMOJI[l]}
              >
                <span className="capitalize">{l.replace(/_/g, ' ')}</span>
              </Chip>
            ))}
          </ChipGrid>

          <div className="grid grid-cols-1 gap-3">
            <Input
              name="scene"
              placeholder="Scene — e.g. rooftop at golden hour"
              error={fe?.scene}
              defaultValue={prefill?.scene}
            />
            <Input
              name="outfit"
              placeholder="Outfit — e.g. cropped denim jacket"
              error={fe?.outfit}
              defaultValue={prefill?.outfit}
            />
            <Input
              name="props"
              placeholder="Props — e.g. holding the energy drink can"
              error={fe?.props}
              defaultValue={prefill?.props}
            />
          </div>
        </PanelCard>

        <PanelCard
          label="06 · Voice"
          hint={brandDefaults ? 'Workspace defaults applied' : undefined}
        >
          <ChipGrid label="Brand tone" cols={3}>
            {BRAND_TONES.map((t) => (
              <Chip
                key={t}
                active={brandTone === t}
                onClick={() => setBrandTone(t)}
                icon={TONE_EMOJI[t]}
              >
                <span className="capitalize">{t}</span>
              </Chip>
            ))}
          </ChipGrid>
          {fe?.brandTone ? <p className="text-[12px] text-[#ff5577]">{fe.brandTone}</p> : null}

          <ChipGrid label="Call-to-action" cols={3}>
            {CTAS.map((c) => (
              <Chip key={c} active={cta === c} onClick={() => setCta(c)} icon={CTA_EMOJI[c]}>
                <span className="capitalize">{c.replace(/_/g, ' ')}</span>
              </Chip>
            ))}
          </ChipGrid>
          {fe?.cta ? <p className="text-[12px] text-[#ff5577]">{fe.cta}</p> : null}
        </PanelCard>

        <input type="hidden" name="modelId" value={modelId} />
        {Array.from(platforms).map((p) => (
          <input key={p} type="hidden" name="platforms" value={p} />
        ))}
        <input type="hidden" name="format" value={format} />
        <input type="hidden" name="brandTone" value={brandTone} />
        <input type="hidden" name="brandVibe" value={brandVibe} />
        <input type="hidden" name="brandPalette" value={brandPalette} />
        <input type="hidden" name="cta" value={cta} />
        <input type="hidden" name="postGoal" value={postGoal} />
        <input type="hidden" name="lighting" value={lighting} />
        <input type="hidden" name="uploadedImageUrl" value={uploadedImageUrl} />
        {productRefUrls.filter(Boolean).map((url, i) => (
          <input key={i} type="hidden" name="productRefUrls" value={url} />
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
          disabled={pending || models.length === 0}
          title={
            models.length === 0 ? 'Create a persona in Studio before generating posts.' : undefined
          }
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
              {skipRender ? 'Using your image…' : 'Generating variants…'}
            </>
          ) : (
            <>
              <Sparkles size={16} />
              {models.length === 0
                ? 'Create a persona first'
                : skipRender
                  ? state?.status === 'success'
                    ? 'Re-run with this image'
                    : 'Use this image (free)'
                  : state?.status === 'success'
                    ? 'Regenerate (50 credits)'
                    : hasAnyProductRef
                      ? 'Generate variants with references (50 credits)'
                      : 'Generate post variants (50 credits)'}
            </>
          )}
        </button>
      </form>

      {/* === RIGHT: live preview + captions + schedule === */}
      <section className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
        {/* Live phone-mockup preview — replaces the old variant tiles. */}
        <LivePreview
          imageUrl={state?.status === 'success' ? state.variants[selectedVariant]?.url : undefined}
          caption={
            caption ||
            (selectedHashtags.length > 0 ? selectedHashtags.map((h) => `#${h}`).join(' ') : '')
          }
          username={selectedModel?.name.toLowerCase().replace(/\s+/g, '_') ?? 'influencer_ai'}
          format={state?.status === 'success' ? state.brief.format : format}
          variantNumber={selectedVariant + 1}
          variantCount={state?.status === 'success' ? state.variants.length : 0}
          onPickVariant={setSelectedVariant}
        />

        {pending ? (
          <div className="rounded-[12px] border border-[#262626] bg-surface-1 px-3 py-2 text-center text-[11px] uppercase tracking-wider text-ink-muted">
            <Loader2 size={11} className="-mt-px mr-1.5 inline animate-spin text-[#0099ff]" />
            Rendering variants…
          </div>
        ) : null}

        {state?.status === 'success' ? (
          <>
            <CaptionsPanel
              brief={state.brief}
              captionsState={captionsState}
              captionsAction={captionsAction}
              generating={generatingCaptions}
              reformatState={reformatState}
              reformatAction={reformatAction}
              reformatting={reformatting}
              caption={caption}
              onCaptionChange={setCaption}
              chosenCandidateId={chosenCandidateId}
              onPickCandidate={(c) => {
                setChosenCandidateId(c.id);
                setCaption(c.caption);
                setSelectedHashtags(c.hashtags);
              }}
              selectedHashtags={selectedHashtags}
              onHashtagsChange={setSelectedHashtags}
            />
            <SchedulePanel
              brief={state.brief}
              variants={state.variants}
              caption={
                caption.trim()
                  ? `${caption}${
                      selectedHashtags.length > 0
                        ? `\n\n${selectedHashtags.map((h) => `#${h}`).join(' ')}`
                        : ''
                    }`
                  : ''
              }
              selectedPlatforms={state.brief.platforms as Platform[]}
              connectedPlatforms={connectedPlatforms}
              saveDisabledReason={saveDisabledReason}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}

// ---------- PlatformPicker (Connected vs Connect more) ----------

function PlatformPicker({
  platforms,
  connectedPlatforms,
  onToggle,
}: {
  platforms: Set<Platform>;
  connectedPlatforms: Platform[];
  onToggle: (p: Platform) => void;
}) {
  const connectedSet = new Set(connectedPlatforms);
  const connected = (PLATFORMS as readonly Platform[]).filter((p) => connectedSet.has(p));
  const notConnected = (PLATFORMS as readonly Platform[]).filter((p) => !connectedSet.has(p));

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">
            Connected accounts
          </span>
          <span className="text-[10px] text-[#666]">
            {connected.length === 0 ? 'none yet' : `${connected.length} ready`}
          </span>
        </div>
        {connected.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {connected.map((p) => (
              <PlatformTile
                key={p}
                platform={p}
                state={platforms.has(p) ? 'on' : 'off'}
                onClick={() => onToggle(p)}
              />
            ))}
          </div>
        ) : (
          <a
            href="/accounts"
            className="block rounded-[12px] border border-dashed border-[#262626] bg-surface-2/40 px-3 py-3 text-center text-[12px] text-ink-muted transition hover:border-[#0099ff]/50 hover:text-ink"
          >
            No connected platforms yet — open Accounts to connect one →
          </a>
        )}
      </div>

      {notConnected.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">
            Connect more platforms
          </span>
          <div className="grid grid-cols-3 gap-2">
            {notConnected.map((p) => (
              <PlatformTile
                key={p}
                platform={p}
                state="disabled"
                onClick={() => {
                  if (typeof window !== 'undefined') window.location.href = '/accounts';
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function PlatformTile({
  platform,
  state,
  onClick,
}: {
  platform: Platform;
  state: 'on' | 'off' | 'disabled';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state === 'on'}
      title={
        state === 'disabled' ? `Connect ${platform} on /accounts to enable` : `Toggle ${platform}`
      }
      className={cn(
        'relative flex h-11 items-center justify-center overflow-hidden rounded-[12px] border transition',
        state === 'on'
          ? 'border-[#0099ff] shadow-[0_0_0_1px_rgba(0,153,255,0.25),0_0_18px_-6px_rgba(0,153,255,0.45)]'
          : state === 'off'
            ? 'border-[#262626] hover:border-[#444]'
            : 'border-[#1a1a1a] grayscale opacity-50 hover:opacity-70',
      )}
    >
      <span
        className={cn('absolute inset-0', PLATFORM_GRADIENT[platform])}
        aria-hidden
        style={{ opacity: state === 'disabled' ? 0.5 : 0.9 }}
      />
      <span className="absolute inset-0 bg-black/35" />
      <span className="relative text-[12px] font-medium capitalize text-white">{platform}</span>
      {state === 'on' ? (
        <span className="absolute right-2 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-[#0099ff] text-white">
          <Check size={10} strokeWidth={3} />
        </span>
      ) : null}
    </button>
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
    <div className="workflow-panel p-4 backdrop-blur">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          {label}
        </span>
        {hint ? <span className="truncate text-[10px] text-[#666]">{hint}</span> : null}
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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative flex h-11 items-center gap-2 overflow-hidden rounded-[12px] border bg-black/30 px-3 text-left text-[13px] transition',
        active
          ? 'border-[#0099ff] text-ink shadow-[0_0_0_1px_rgba(0,153,255,0.25),0_0_18px_-6px_rgba(0,153,255,0.45)]'
          : 'border-white/10 text-ink-muted hover:border-white/25 hover:text-ink',
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
        'group relative flex h-12 items-center gap-2.5 rounded-[12px] border bg-black/30 px-3 text-left transition',
        active
          ? 'border-[#0099ff] text-ink shadow-[0_0_0_1px_rgba(0,153,255,0.25),0_0_18px_-6px_rgba(0,153,255,0.45)]'
          : 'border-white/10 text-ink-muted hover:border-white/25 hover:text-ink',
      )}
    >
      <span className={active ? 'text-[#0099ff]' : 'text-ink-muted'}>{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[13px] font-medium text-ink">{title}</span>
        <span className="text-[10px] text-ink-muted">{sub}</span>
      </span>
      {active ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0099ff] text-white">
          <Check size={10} strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

function Input({
  name,
  placeholder,
  required,
  error,
  defaultValue,
}: {
  name: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        name={name}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
      />
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
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
  if (models.length === 0) {
    return (
      <div className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-3 text-xs text-amber-300">
        No saved models yet — head to{' '}
        <a href="/studio/new" className="font-semibold underline-offset-2 hover:underline">
          Studio
        </a>{' '}
        to cast one first. Create Post unlocks as soon as that model is saved.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
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
                  'group relative block w-[112px] shrink-0 snap-start overflow-hidden rounded-lg ring-1 transition',
                  active
                    ? 'ring-[#0099ff] shadow-[0_0_24px_-8px_rgba(56,189,248,0.55)]'
                    : 'ring-[#262626] hover:ring-white/15',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.portrait_url}
                  alt={m.name}
                  className="aspect-[3/4] w-full object-cover"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 truncate px-2 py-1 text-left text-[11px] font-medium text-white">
                  {m.name}
                </span>
                {active ? (
                  <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-black shadow">
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CaptionsPanel — v1 wedge UI.
// Generate 3 caption candidates and per-platform reformats. Selecting a
// candidate writes into the parent's caption state, which the save panel
// submits. Hashtags ride along as a separate chip set; chips are
// click-to-toggle so the operator can curate before save.
// ---------------------------------------------------------------------------

function CaptionsPanel({
  brief,
  captionsState,
  captionsAction,
  generating,
  reformatState,
  reformatAction,
  reformatting,
  caption,
  onCaptionChange,
  chosenCandidateId,
  onPickCandidate,
  selectedHashtags,
  onHashtagsChange,
}: {
  brief: unknown;
  captionsState: CaptionsState | null;
  captionsAction: (formData: FormData) => void;
  generating: boolean;
  reformatState: ReformatState | null;
  reformatAction: (formData: FormData) => void;
  reformatting: boolean;
  caption: string;
  onCaptionChange: (value: string) => void;
  chosenCandidateId: string | null;
  onPickCandidate: (c: { id: string; caption: string; hashtags: string[] }) => void;
  selectedHashtags: string[];
  onHashtagsChange: (hashtags: string[]) => void;
}) {
  const candidates = captionsState?.status === 'success' ? captionsState.data.candidates : [];
  const initialPerPlatform =
    captionsState?.status === 'success' ? captionsState.data.perPlatform : [];
  const reformatted = reformatState?.status === 'success' ? reformatState.data : [];
  const perPlatform = reformatted.length > 0 ? reformatted : initialPerPlatform;

  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const activePlatformValue =
    activePlatform && perPlatform.some((p) => p.platform === activePlatform)
      ? activePlatform
      : (perPlatform[0]?.platform ?? null);

  function toggleHashtag(tag: string) {
    if (selectedHashtags.includes(tag)) {
      onHashtagsChange(selectedHashtags.filter((h) => h !== tag));
    } else {
      onHashtagsChange([...selectedHashtags, tag]);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore — clipboard may be unavailable in insecure contexts
    }
  }

  const hasResult = captionsState?.status === 'success';
  const activeVariant = perPlatform.find((p) => p.platform === activePlatformValue);

  return (
    <div className="workflow-panel p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[11px] font-medium text-ink ring-1 ring-[#262626]">
            <Wand2 size={11} className="text-[#0099ff]" />
            AI captions
          </span>
          <span className="text-[11px] text-ink-muted">3 angles · reformat per platform</span>
        </div>
        <form action={captionsAction}>
          <input type="hidden" name="brief" value={JSON.stringify(brief)} />
          <button
            type="submit"
            disabled={generating}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#0099ff] px-3 text-[12px] font-medium text-white transition hover:bg-[#1aa6ff] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666]"
          >
            {generating ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Writing…
              </>
            ) : hasResult ? (
              <>
                <RotateCw size={11} />
                Regenerate (5)
              </>
            ) : (
              <>
                <Wand2 size={11} />
                Generate captions (5)
              </>
            )}
          </button>
        </form>
      </header>

      {captionsState?.status === 'error' ? (
        <p
          className="rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-2 text-[12px] text-[#ff5577]"
          role="alert"
        >
          {captionsState.error}
        </p>
      ) : null}
      {captionsState?.status === 'insufficient_credits' ? (
        <InsufficientCreditsBanner
          balance={captionsState.balance}
          required={captionsState.required}
        />
      ) : null}

      {!hasResult && !generating ? (
        <p className="text-[13px] leading-[1.4] text-ink-muted">
          Generate three caption angles in the persona&apos;s voice + a hashtag bank, then one-click
          reformat for every connected platform.
        </p>
      ) : null}

      {generating && !hasResult ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-[12px] border border-[#262626] bg-surface-2/60"
            />
          ))}
        </div>
      ) : null}

      {hasResult ? (
        <>
          {/* Candidate list */}
          <ul className="mb-4 grid gap-2">
            {candidates.map((c) => {
              const active = chosenCandidateId === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onPickCandidate(c)}
                    aria-pressed={active}
                    className={cn(
                      'group block w-full rounded-[12px] border p-3 text-left transition',
                      active
                        ? 'border-[#0099ff] bg-[#0099ff]/[0.06] shadow-[0_0_0_1px_rgba(0,153,255,0.25)]'
                        : 'border-[#262626] bg-surface-2 hover:border-[#444]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                        Angle {c.id.toUpperCase()} · {c.angle || 'variation'}
                      </span>
                      {active ? (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[#0099ff] px-2 text-[10px] font-medium text-white">
                          <Check size={9} strokeWidth={3} />
                          Selected
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#666] group-hover:text-ink-muted">
                          Tap to select
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-[1.4] text-ink">
                      {c.caption}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Hashtag bank */}
          {candidates[0]?.hashtags.length ? (
            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">
                  Hashtag bank
                </span>
                <span className="text-[10px] text-[#666]">
                  {selectedHashtags.length} of {candidates[0].hashtags.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {candidates[0].hashtags.map((h) => {
                  const on = selectedHashtags.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => toggleHashtag(h)}
                      className={cn(
                        'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] transition',
                        on
                          ? 'border-[#0099ff] bg-[#0099ff]/[0.08] text-[#0099ff]'
                          : 'border-[#262626] bg-surface-2 text-ink-muted hover:border-[#444] hover:text-ink',
                      )}
                    >
                      <Hash size={9} />
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Per-platform tabs */}
          {perPlatform.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">
                  Per-platform variant
                </span>
                <form action={reformatAction}>
                  <input type="hidden" name="brief" value={JSON.stringify(brief)} />
                  <input type="hidden" name="caption" value={caption} />
                  <input type="hidden" name="hashtags" value={JSON.stringify(selectedHashtags)} />
                  <button
                    type="submit"
                    disabled={reformatting || !caption.trim()}
                    title={!caption.trim() ? 'Pick a caption first' : undefined}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-2 px-2.5 text-[11px] font-medium text-ink transition hover:border-[#0099ff]/50 hover:text-[#0099ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reformatting ? (
                      <>
                        <Loader2 size={10} className="animate-spin" />
                        Reformatting…
                      </>
                    ) : (
                      <>
                        <RotateCw size={10} />
                        Re-run for chosen caption
                      </>
                    )}
                  </button>
                </form>
              </div>
              {reformatState?.status === 'error' ? (
                <p className="mb-2 rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-2 text-[12px] text-[#ff5577]">
                  {reformatState.error}
                </p>
              ) : null}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {perPlatform.map((p) => (
                  <button
                    key={p.platform}
                    type="button"
                    onClick={() => setActivePlatform(p.platform)}
                    aria-pressed={activePlatformValue === p.platform}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium capitalize transition',
                      activePlatformValue === p.platform
                        ? 'bg-[#0099ff] text-white'
                        : 'bg-surface-2 text-ink-muted ring-1 ring-[#262626] hover:text-ink',
                    )}
                  >
                    {p.platform}
                  </button>
                ))}
              </div>
              {activeVariant ? (
                <div className="rounded-[12px] border border-[#262626] bg-surface-2 p-3">
                  {activeVariant.hook ? (
                    <p className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-[#0099ff]">
                      Hook · {activeVariant.hook}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-[13px] leading-[1.45] text-ink">
                    {activeVariant.caption}
                  </p>
                  {activeVariant.hashtags.length > 0 ? (
                    <p className="mt-2 text-[12px] text-ink-muted">
                      {activeVariant.hashtags.map((h) => `#${h}`).join(' ')}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const full = `${activeVariant.caption}${
                          activeVariant.hashtags.length
                            ? `\n\n${activeVariant.hashtags.map((h) => `#${h}`).join(' ')}`
                            : ''
                        }`;
                        copyToClipboard(full);
                      }}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-1 px-2.5 text-[11px] font-medium text-ink transition hover:border-[#0099ff]/50"
                    >
                      <Copy size={10} />
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onCaptionChange(activeVariant.caption);
                        onHashtagsChange(activeVariant.hashtags);
                      }}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#0099ff] px-2.5 text-[11px] font-medium text-white transition hover:bg-[#1aa6ff]"
                    >
                      <Check size={10} />
                      Use this variant
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
