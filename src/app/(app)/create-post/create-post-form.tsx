'use client';

import { useActionState, useState } from 'react';
import { Check, Loader2, Save, Sparkles } from 'lucide-react';
import {
  generatePostVariantsAction,
  saveDraftPostAction,
  type GeneratePostState,
  type SavePostState,
} from './actions';
import type { AiModelRow } from '@/lib/supabase/types';
import { BRAND_TONES, CTAS, FORMATS, PLATFORMS } from '@/types/post';
import { cn } from '@/lib/utils';

interface Props {
  models: AiModelRow[];
  saveDisabledReason: string | null;
}

export function CreatePostForm({ models, saveDisabledReason }: Props) {
  const [state, formAction, pending] = useActionState<GeneratePostState | null, FormData>(
    generatePostVariantsAction,
    null,
  );
  const [saveState, saveAction, saving] = useActionState<SavePostState | null, FormData>(
    saveDraftPostAction,
    null,
  );
  const [selectedVariant, setSelectedVariant] = useState(0);

  const fe = state?.status === 'error' ? state.fieldErrors : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_460px]">
      <form action={formAction} className="flex flex-col gap-5">
        <ModelSelector models={models} error={fe?.modelId} />

        <Field label="Campaign name" name="name" placeholder="e.g. Energy drink launch" required error={fe?.name} />

        <PlatformPicker error={fe?.platforms} />

        <FormatPicker error={fe?.format} />

        <Field
          label="Brief"
          name="brief"
          placeholder="What's the post about? e.g. Launching our new citrus energy drink, target Gen-Z fitness creators."
          textarea
          required
          error={fe?.brief}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Scene" name="scene" placeholder="e.g. rooftop at golden hour" error={fe?.scene} />
          <Field label="Outfit" name="outfit" placeholder="e.g. cropped denim jacket" error={fe?.outfit} />
          <Field label="Props" name="props" placeholder="e.g. holding the energy drink can" error={fe?.props} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Brand tone" name="brandTone" options={BRAND_TONES} error={fe?.brandTone} />
          <Select label="Call-to-action" name="cta" options={CTAS} error={fe?.cta} />
        </div>

        {state?.status === 'error' ? (
          <p className="text-sm text-red-400" role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || models.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating variants…
            </>
          ) : (
            <>
              <Sparkles size={16} />
              {state?.status === 'success' ? 'Regenerate' : 'Generate post variants'}
            </>
          )}
        </button>
      </form>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
        {/* Save panel comes first so it's always reachable without
            scrolling past the (tall) preview tiles. */}
        {state?.status === 'success' ? (
          <SaveDraftPanel
            brief={state.brief}
            variants={state.variants}
            saveAction={saveAction}
            saveState={saveState}
            saving={saving}
            saveDisabledReason={saveDisabledReason}
          />
        ) : null}

        <VariantPanel
          variants={state?.status === 'success' ? state.variants : []}
          selectedIndex={selectedVariant}
          onSelect={setSelectedVariant}
          loading={pending}
          format={state?.status === 'success' ? state.brief.format : 'square'}
        />
      </aside>
    </div>
  );
}

function ModelSelector({ models, error }: { models: AiModelRow[]; error?: string }) {
  if (models.length === 0) {
    return (
      <div className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-3 text-sm text-amber-300">
        You don&apos;t have any saved AI models yet. Build one in{' '}
        <a href="/studio" className="font-medium underline-offset-2 hover:underline">
          Studio
        </a>{' '}
        first, then come back here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">AI model</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {models.map((m, idx) => (
          <label
            key={m.id}
            className="group cursor-pointer overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 transition has-[input:checked]:border-zinc-100 has-[input:checked]:ring-1 has-[input:checked]:ring-zinc-100"
          >
            <input
              type="radio"
              name="modelId"
              value={m.id}
              defaultChecked={idx === 0}
              className="sr-only"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.portrait_url} alt={m.name} className="aspect-[3/4] w-full object-cover" />
            <span className="block truncate px-2 py-1 text-xs text-zinc-300">{m.name}</span>
          </label>
        ))}
      </div>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

function PlatformPicker({ error }: { error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">Platforms</span>
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => (
          <label
            key={p}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-300 transition has-[input:checked]:border-zinc-100 has-[input:checked]:bg-zinc-900 has-[input:checked]:text-zinc-100"
          >
            <input type="checkbox" name="platforms" value={p} className="sr-only" />
            <span className="capitalize">{p}</span>
          </label>
        ))}
      </div>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

function FormatPicker({ error }: { error?: string }) {
  const labels: Record<(typeof FORMATS)[number], string> = {
    square: 'Square (1:1)',
    portrait: 'Portrait (9:16)',
    landscape: 'Landscape (16:9)',
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">Format</span>
      <div className="flex flex-wrap gap-2">
        {FORMATS.map((f, i) => (
          <label
            key={f}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-300 transition has-[input:checked]:border-zinc-100 has-[input:checked]:bg-zinc-900 has-[input:checked]:text-zinc-100"
          >
            <input
              type="radio"
              name="format"
              value={f}
              defaultChecked={i === 0}
              className="sr-only"
            />
            {labels[f]}
          </label>
        ))}
      </div>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
  required,
  textarea,
  error,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
  error?: string;
}) {
  const baseClass =
    'w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600';
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      {textarea ? (
        <textarea name={name} placeholder={placeholder} required={required} className={cn(baseClass, 'min-h-24')} />
      ) : (
        <input
          name={name}
          type="text"
          placeholder={placeholder}
          required={required}
          className={baseClass}
        />
      )}
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </label>
  );
}

function Select<T extends string>({
  label,
  name,
  options,
  error,
}: {
  label: string;
  name: string;
  options: readonly T[];
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <select
        name={name}
        defaultValue=""
        required
        className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
      >
        <option value="" disabled>
          Choose…
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </label>
  );
}

function VariantPanel({
  variants,
  selectedIndex,
  onSelect,
  loading,
  format,
}: {
  variants: { url: string }[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  loading: boolean;
  format: 'square' | 'portrait' | 'landscape';
}) {
  const aspectClass =
    format === 'square' ? 'aspect-square' : format === 'portrait' ? 'aspect-[9/16]' : 'aspect-[16/9]';

  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-600',
          aspectClass,
        )}
      >
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (variants.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-950/50 text-xs text-zinc-700',
          aspectClass,
        )}
      >
        Variants will appear here
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn('overflow-hidden rounded-md border border-zinc-800 bg-zinc-950', aspectClass)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={variants[selectedIndex]?.url}
          alt={`Variant ${selectedIndex + 1}`}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="flex gap-2">
        {variants.map((v, i) => (
          <button
            type="button"
            key={i}
            onClick={() => onSelect(i)}
            className={cn(
              'flex-1 overflow-hidden rounded-md border bg-zinc-950 transition',
              i === selectedIndex
                ? 'border-zinc-100 ring-1 ring-zinc-100'
                : 'border-zinc-800 hover:border-zinc-700',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.url} alt={`Variant ${i + 1} thumb`} className={cn(aspectClass, 'w-full object-cover')} />
            <span className="block py-1 text-center text-[11px] text-zinc-500">v{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SaveDraftPanel({
  brief,
  variants,
  saveAction,
  saveState,
  saving,
  saveDisabledReason,
}: {
  brief: unknown;
  variants: { url: string }[];
  saveAction: (formData: FormData) => void;
  saveState: SavePostState | null;
  saving: boolean;
  saveDisabledReason: string | null;
}) {
  const disabled = saving || saveState?.status === 'saved' || Boolean(saveDisabledReason);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <form action={saveAction} className="flex flex-col gap-2">
        <input type="hidden" name="brief" value={JSON.stringify(brief)} />
        <input type="hidden" name="variants" value={JSON.stringify(variants)} />
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Caption (optional)</span>
          <textarea
            name="caption"
            placeholder="Write a caption — or leave blank and add it later."
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
            rows={3}
          />
        </label>
        <button
          type="submit"
          disabled={disabled}
          title={saveDisabledReason ?? undefined}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-500"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Saving draft…
            </>
          ) : saveState?.status === 'saved' ? (
            <>
              <Check size={14} />
              Saved as draft
            </>
          ) : (
            <>
              <Save size={14} />
              Save as draft
            </>
          )}
        </button>
      </form>
      {saveState?.status === 'error' ? (
        <p className="text-xs text-red-400" role="alert">
          {saveState.error}
        </p>
      ) : null}
      {saveDisabledReason ? <p className="text-xs text-zinc-500">{saveDisabledReason}</p> : null}
    </div>
  );
}
