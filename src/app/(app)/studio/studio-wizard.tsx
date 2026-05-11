'use client';

import { useActionState } from 'react';
import { Check, Loader2, RefreshCw, Save, Sparkles } from 'lucide-react';
import {
  generateInfluencer,
  saveGeneratedInfluencer,
  type GenerateState,
  type SaveState,
} from './actions';
import { cn } from '@/lib/utils';

const FIELDS = {
  gender: ['woman', 'man', 'non-binary'] as const,
  bodyType: ['slim', 'athletic', 'curvy', 'plus-size'] as const,
  skinTone: ['light', 'medium-light', 'medium', 'medium-dark', 'dark'] as const,
  ageRange: ['18-25', '25-35', '35-45', '45-55', '55+'] as const,
  vibe: ['street', 'minimal', 'luxury', 'cinematic', 'editorial'] as const,
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

  const fe = state?.status === 'error' ? state.fieldErrors : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <form action={formAction} className="flex flex-col gap-5">
        <Field
          label="Model name"
          name="name"
          placeholder="e.g. Aria Vance"
          required
          error={fe?.name}
        />
        <Select label="Gender" name="gender" options={FIELDS.gender} error={fe?.gender} />
        <Select label="Body type" name="bodyType" options={FIELDS.bodyType} error={fe?.bodyType} />
        <Select
          label="Skin tone"
          name="skinTone"
          options={FIELDS.skinTone}
          error={fe?.skinTone}
        />
        <Select label="Age range" name="ageRange" options={FIELDS.ageRange} error={fe?.ageRange} />
        <Field
          label="Hair"
          name="hair"
          placeholder="e.g. long brown wavy with curtain bangs"
          required
          error={fe?.hair}
        />
        <Select label="Vibe" name="vibe" options={FIELDS.vibe} error={fe?.vibe} />
        <Field
          label="Custom prompt (optional)"
          name="customPrompt"
          placeholder="e.g. brown eyes, freckles, holding a takeaway coffee"
          textarea
          error={fe?.customPrompt}
        />

        {state?.status === 'error' ? (
          <p className="text-sm text-red-400" role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating with Luma…
            </>
          ) : (
            <>
              <Sparkles size={16} />
              {state?.status === 'success' ? 'Regenerate' : 'Generate'}
            </>
          )}
        </button>
      </form>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
        {/* Save panel is rendered first so it's always visible without
            scrolling past the (tall) preview tiles. */}
        {state?.status === 'success' ? (
          <div className="flex flex-col gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex items-center gap-2">
              <form action={saveAction} className="flex flex-1">
                <input type="hidden" name="input" value={JSON.stringify(state.input)} />
                <input type="hidden" name="visuals" value={JSON.stringify(state.visuals)} />
                <button
                  type="submit"
                  disabled={
                    saving || saveState?.status === 'saved' || Boolean(saveDisabledReason)
                  }
                  title={saveDisabledReason ?? undefined}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-500"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Saving…
                    </>
                  ) : saveState?.status === 'saved' ? (
                    <>
                      <Check size={14} />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      Save model
                    </>
                  )}
                </button>
              </form>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-800"
                aria-label="Reset wizard"
                title="Reset wizard"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            {saveState?.status === 'error' ? (
              <p className="text-xs text-red-400" role="alert">
                {saveState.error}
              </p>
            ) : null}
            {saveDisabledReason ? (
              <p className="text-xs text-zinc-500">{saveDisabledReason}</p>
            ) : null}
          </div>
        ) : null}

        <Preview
          label="Portrait"
          imageUrl={state?.status === 'success' ? state.visuals.portraitUrl : undefined}
          loading={pending}
          aspectClass="aspect-[3/4]"
        />
        <Preview
          label="Full body"
          imageUrl={state?.status === 'success' ? state.visuals.fullBodyUrl : undefined}
          loading={pending}
          aspectClass="aspect-[9/16]"
        />
      </aside>
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
        <textarea name={name} placeholder={placeholder} className={cn(baseClass, 'min-h-20')} />
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
            {opt}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </label>
  );
}

function Preview({
  label,
  imageUrl,
  loading,
  aspectClass,
}: {
  label: string;
  imageUrl?: string;
  loading: boolean;
  aspectClass: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950',
          aspectClass,
        )}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`${label} preview`} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-700">
            no image yet
          </div>
        )}
      </div>
    </div>
  );
}
