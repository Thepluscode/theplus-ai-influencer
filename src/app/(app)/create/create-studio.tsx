'use client';

import Link from 'next/link';
import { useActionState, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ImageIcon, Loader2, PencilLine, Sparkles, X } from 'lucide-react';
import { InsufficientCreditsBanner } from '@/components/credits/insufficient-credits-banner';
import { mentionErrorMessage, resolveMention } from '@/lib/handles';
import { cn } from '@/lib/utils';
import {
  CREATE_ASPECTS,
  type CreateAspect,
  type CreateMode,
  type CreationView,
} from '@/types/creation';
import { createAction, type CreateState } from './actions';

export interface PersonaOption {
  id: string;
  name: string;
  handle: string;
  portraitUrl: string;
}

interface Props {
  personas: PersonaOption[];
  initialCreations: CreationView[];
  costs: { picture: number; edit: number };
  demoMode: boolean;
  disabledReason: string | null;
}

// The partial mention being typed right before the caret: "…with @ar|".
const TYPING_MENTION = /(^|[^A-Za-z0-9_@.])@([A-Za-z0-9-]*)$/;

// Literal class names so Tailwind generates them.
const CARD_ASPECT: Record<CreateAspect, string> = {
  '3:4': 'aspect-[3/4]',
  '1:1': 'aspect-square',
  '4:3': 'aspect-[4/3]',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
};

const ASPECT_LABEL: Record<CreateAspect, string> = {
  '3:4': 'Portrait',
  '1:1': 'Square',
  '4:3': 'Landscape',
  '9:16': 'Story',
  '16:9': 'Wide',
};

export function CreateStudio({
  personas,
  initialCreations,
  costs,
  demoMode,
  disabledReason,
}: Props) {
  const [results, setResults] = useState<CreationView[]>(initialCreations);
  const [state, formAction, pending] = useActionState<CreateState, FormData>(
    async (prev, formData) => {
      const next = await createAction(prev, formData);
      if (next.status === 'success') {
        setResults((list) => [next.creation, ...list.filter((c) => c.id !== next.creation.id)]);
      }
      return next;
    },
    { status: 'idle' },
  );
  const [mode, setMode] = useState<CreateMode>('picture');
  const [source, setSource] = useState<CreationView | null>(null);
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<CreateAspect>('3:4');
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const typing = useMemo(() => {
    const m = TYPING_MENTION.exec(prompt.slice(0, caret));
    if (!m) return null;
    const query = m[2].toLowerCase();
    return {
      start: caret - m[2].length - 1,
      matches: personas.filter((p) => p.handle && p.handle.startsWith(query)).slice(0, 6),
    };
  }, [prompt, caret, personas]);
  const menuOpen = Boolean(typing && typing.matches.length > 0 && !dismissed);

  // A typing aid only: the server resolves again and its answer is the one that counts.
  const resolution = useMemo(() => resolveMention(prompt, personas), [prompt, personas]);
  const cost = mode === 'edit' ? costs.edit : costs.picture;
  const blocked =
    Boolean(disabledReason) ||
    pending ||
    !prompt.trim() ||
    !resolution.ok ||
    (mode === 'edit' && !source);

  function insertPersona(p: PersonaOption) {
    if (!typing) return;
    const before = prompt.slice(0, typing.start);
    const after = prompt.slice(caret);
    const next = `${before}@${p.handle} ${after.replace(/^\S*/, '').trimStart()}`;
    const pos = before.length + p.handle.length + 2;
    setPrompt(next);
    setDismissed(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  function addMention(p: PersonaOption) {
    const sep = prompt && !/\s$/.test(prompt) ? ' ' : '';
    const next = `${prompt}${sep}@${p.handle} `;
    setPrompt(next);
    setCaret(next.length);
    textareaRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!menuOpen || !typing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = typing.matches.length;
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertPersona(typing.matches[Math.min(active, typing.matches.length - 1)]);
    } else if (e.key === 'Escape') {
      setDismissed(true);
    }
  }

  function startEdit(c: CreationView) {
    setMode('edit');
    setSource(c);
    setAspect(c.aspect);
    textareaRef.current?.focus();
  }

  const fieldError = state.status === 'error' ? state.fieldErrors : undefined;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form
        action={formAction}
        className="flex min-w-0 flex-col gap-5 self-start rounded-[16px] border border-[#262626] bg-surface-1 p-5"
      >
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="aspect" value={aspect} />
        {mode === 'edit' && source ? (
          <input type="hidden" name="sourceCreationId" value={source.id} />
        ) : null}

        <div
          role="tablist"
          aria-label="What to make"
          className="flex gap-1 rounded-full bg-[#0f0f0f] p-1"
        >
          {(['picture', 'edit'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition',
                mode === m ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {m === 'picture' ? <ImageIcon size={14} /> : <PencilLine size={14} />}
              {m === 'picture' ? 'Picture' : 'Edit'}
            </button>
          ))}
        </div>

        {mode === 'edit' ? (
          source ? (
            <div className="flex items-center gap-3 rounded-[12px] border border-[#262626] bg-[#0f0f0f] p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.assetUrl} alt="" className="h-14 w-11 rounded-[8px] object-cover" />
              <p className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">
                Editing: {source.prompt}
              </p>
              <button
                type="button"
                onClick={() => setSource(null)}
                aria-label="Stop editing this result"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-ink-muted hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <p className="rounded-[12px] border border-dashed border-[#262626] px-3 py-3 text-[12px] text-ink-muted">
              Pick a result on the right and choose <span className="text-ink">Edit</span>.
            </p>
          )
        ) : null}

        <div className="relative flex flex-col gap-1.5">
          <label
            htmlFor="create-prompt"
            className="text-[11px] uppercase tracking-[0.1em] text-ink-muted"
          >
            {mode === 'edit' ? 'What should change?' : 'Describe the picture'}
          </label>
          <textarea
            id="create-prompt"
            ref={textareaRef}
            name="prompt"
            value={prompt}
            maxLength={2000}
            rows={5}
            placeholder={
              mode === 'edit'
                ? 'Swap the jacket for a red trench coat'
                : '@persona on a rooftop at golden hour'
            }
            onChange={(e) => {
              setPrompt(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              setDismissed(false);
              setActive(0);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={menuOpen}
            aria-controls="persona-mentions"
            aria-autocomplete="list"
            aria-activedescendant={menuOpen ? `mention-${active}` : undefined}
            aria-invalid={Boolean(fieldError?.prompt) || !resolution.ok}
            className="min-h-28 w-full resize-y rounded-[12px] border border-[#262626] bg-[#0f0f0f] px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.15)]"
          />
          {menuOpen && typing ? (
            <ul
              id="persona-mentions"
              role="listbox"
              aria-label="Personas"
              className="absolute left-2 right-2 top-full z-10 mt-1 overflow-hidden rounded-[12px] border border-[#262626] bg-surface-2 py-1 shadow-xl"
            >
              {typing.matches.map((p, i) => (
                <li
                  key={p.id}
                  id={`mention-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertPersona(p);
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px]',
                    i === active ? 'bg-[#0099ff]/15 text-ink' : 'text-ink-muted',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.portraitUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  <span className="text-ink">{p.name}</span>
                  <span className="text-[#666]">@{p.handle}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="min-h-4 text-[12px]" aria-live="polite">
            {!resolution.ok ? (
              <span className="text-[#ff5577]">{mentionErrorMessage(resolution)}</span>
            ) : fieldError?.prompt ? (
              <span className="text-[#ff5577]">{fieldError.prompt}</span>
            ) : !resolution.persona && mode === 'edit' && source?.personaName ? (
              <span className="text-ink-muted">
                Face lock kept from the source:{' '}
                <span className="text-ink">{source.personaName}</span>
              </span>
            ) : resolution.persona ? (
              <span className="text-ink-muted">
                Face locked to <span className="text-ink">{resolution.persona.name}</span>
              </span>
            ) : (
              <span className="text-[#666]">
                No persona mentioned: the face will not be locked.
              </span>
            )}
          </p>
        </div>

        {personas.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">
              Your personas
            </span>
            <div className="flex flex-wrap gap-1.5">
              {personas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.handle}
                  onClick={() => addMention(p)}
                  title={
                    p.handle
                      ? `Add @${p.handle}`
                      : 'This name has no usable handle; rename the persona'
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 pl-1 pr-3 text-[12px] text-ink ring-1 ring-[#262626] transition hover:bg-[#222] disabled:opacity-40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.portraitUrl} alt="" className="h-6 w-6 rounded-full object-cover" />@
                  {p.handle || '—'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-ink-muted">
            No personas yet.{' '}
            <Link href="/studio/new" className="text-[#0099ff] hover:underline">
              Build one in Studio
            </Link>{' '}
            to lock a face.
          </p>
        )}

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-ink-muted">
            Shape
          </legend>
          <div className="grid grid-cols-5 gap-1.5">
            {CREATE_ASPECTS.map((a) => (
              <label
                key={a}
                className={cn(
                  'flex min-w-0 cursor-pointer flex-col items-center gap-0.5 rounded-[10px] border px-1 py-2 text-[11px] transition',
                  aspect === a
                    ? 'border-[#0099ff] bg-[#0099ff]/10 text-ink'
                    : 'border-[#262626] text-ink-muted hover:text-ink',
                )}
              >
                <input
                  type="radio"
                  name="aspect-choice"
                  value={a}
                  checked={aspect === a}
                  onChange={() => setAspect(a)}
                  className="sr-only"
                />
                <span className="font-medium">{a}</span>
                <span className="max-w-full truncate text-[10px] text-[#666]">
                  {ASPECT_LABEL[a]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {state.status === 'insufficient_credits' ? (
          <InsufficientCreditsBanner balance={state.balance} required={state.required} />
        ) : null}
        {state.status === 'error' && !fieldError?.prompt ? (
          <p
            role="alert"
            className="rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-2 text-[12px] text-[#ff5577]"
          >
            {state.error}
          </p>
        ) : null}
        {disabledReason ? <p className="text-[12px] text-[#ff7a3d]">{disabledReason}</p> : null}

        <button
          type="submit"
          disabled={blocked}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-[14px] font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {pending ? 'Rendering…' : mode === 'edit' ? 'Apply edit' : 'Generate'}
          <span className="rounded-full bg-black/10 px-2 py-0.5 text-[12px] tabular-nums">
            {cost} credits
          </span>
        </button>
        {demoMode ? (
          <p className="text-[11px] text-[#666]">
            Demo mode: renders are placeholders and are not saved or charged.
          </p>
        ) : null}
      </form>

      <section aria-labelledby="results-heading" className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between">
          <h2
            id="results-heading"
            className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted"
          >
            Your results
          </h2>
          <span className="text-[11px] text-[#666]">Newest first</span>
        </div>
        {results.length === 0 ? (
          <p className="rounded-[16px] border border-dashed border-[#262626] px-6 py-16 text-center text-[13px] text-ink-muted">
            Nothing yet. Your pictures and edits appear here.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
            {results.map((c) => (
              <li
                key={c.id}
                className="group overflow-hidden rounded-[14px] border border-[#262626] bg-surface-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.assetUrl}
                  alt={c.prompt}
                  className={cn('w-full object-cover', CARD_ASPECT[c.aspect])}
                />
                <div className="flex flex-col gap-2 p-3">
                  <p className="line-clamp-2 text-[12px] text-ink">{c.prompt}</p>
                  <p className="text-[11px] text-ink-muted">
                    {c.mode === 'edit' ? 'Edit' : 'Picture'} · {c.personaName ?? 'no persona'} ·{' '}
                    {c.aspect}
                  </p>
                  {!c.saved && !demoMode ? (
                    <p className="text-[11px] text-[#ff7a3d]">
                      Rendered but not saved. Download it now.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      disabled={!c.saved && !demoMode}
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-2 px-2.5 text-[11px] text-ink ring-1 ring-[#262626] hover:bg-[#222] disabled:opacity-40"
                    >
                      <PencilLine size={12} /> Edit
                    </button>
                    {c.saved && !demoMode ? (
                      <Link
                        href={`/create-post?creationId=${c.id}`}
                        className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-2 px-2.5 text-[11px] text-ink ring-1 ring-[#262626] hover:bg-[#222]"
                      >
                        Use in a post
                      </Link>
                    ) : null}
                    <a
                      href={c.assetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-2 px-2.5 text-[11px] text-ink-muted ring-1 ring-[#262626] hover:text-ink"
                    >
                      Open <ArrowUpRight size={12} />
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
