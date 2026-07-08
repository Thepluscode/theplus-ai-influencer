'use client';

import { useActionState, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, Copy, EyeOff, Loader2, MessageSquarePlus, Trash2, X } from 'lucide-react';
import {
  addPastedCommentAction,
  approveCommentAction,
  deleteCommentAction,
  dismissCommentAction,
  hideCommentAction,
  type AddCommentState,
} from './actions';
import { InsufficientCreditsBanner } from '@/components/credits/insufficient-credits-banner';
import type { AiModelRow, CommentRow } from '@/lib/supabase/types';
import { PLATFORMS, type Platform } from '@/types/post';
import { cn } from '@/lib/utils';

const CLASS_TONE: Record<NonNullable<CommentRow['classification']>, string> = {
  fan: 'bg-[#22c55e]/10 text-[#22c55e] ring-[#22c55e]/30',
  question: 'bg-[#0099ff]/10 text-[#0099ff] ring-[#0099ff]/30',
  collab: 'bg-[#a855f7]/10 text-[#a855f7] ring-[#a855f7]/30',
  troll: 'bg-[#ff7a3d]/10 text-[#ff7a3d] ring-[#ff7a3d]/30',
  spam: 'bg-[#ff5577]/10 text-[#ff5577] ring-[#ff5577]/30',
  unknown: 'bg-surface-2 text-ink-muted ring-[#262626]',
};

export function CommentsBoard({
  comments,
  models,
}: {
  comments: CommentRow[];
  models: AiModelRow[];
}) {
  const pending = comments.filter((c) => c.status === 'pending');
  const handled = comments.filter((c) => c.status !== 'pending');

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Pending · {pending.length}
          </h2>
          {pending.length === 0 ? (
            <p className="workflow-empty-state px-4 py-8 text-[13px] text-ink-muted">
              Nothing to triage. Paste a comment in the composer.
            </p>
          ) : (
            <ul className="grid gap-3">
              {pending.map((c) => (
                <CommentCard key={c.id} comment={c} />
              ))}
            </ul>
          )}
        </section>

        {handled.length > 0 ? (
          <section>
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Handled · {handled.length}
            </h2>
            <ul className="grid gap-2">
              {handled.map((c) => (
                <li key={c.id} className="workflow-row flex items-start gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      'inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium uppercase tracking-wider ring-1',
                      CLASS_TONE[c.classification ?? 'unknown'],
                    )}
                  >
                    {c.classification ?? 'unknown'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-ink">
                      <span className="text-ink-muted">
                        @{c.author_handle} · {c.platform}:
                      </span>{' '}
                      {c.comment_text}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-[#666]">
                      {c.status} ·{' '}
                      {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                  <form action={deleteCommentAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-muted transition hover:text-[#ff5577]"
                      aria-label="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="xl:sticky xl:top-0 xl:self-start">
        <AddCommentForm models={models} />
      </aside>
    </div>
  );
}

function CommentCard({ comment }: { comment: CommentRow }) {
  const [draft, setDraft] = useState(comment.draft_reply ?? '');
  const [copied, setCopied] = useState(false);
  const cls = comment.classification ?? 'unknown';
  const ignored = cls === 'spam' || cls === 'troll';

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <li className="workflow-panel p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={cn(
            'inline-flex h-6 items-center rounded-full px-2 font-medium uppercase tracking-wider ring-1',
            CLASS_TONE[cls],
          )}
        >
          {cls}
        </span>
        <span className="text-ink-muted">
          @{comment.author_handle} · {comment.platform} ·{' '}
          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
        </span>
      </header>

      <p className="rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] leading-[1.5] text-ink">
        {comment.comment_text}
      </p>

      {!ignored ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Drafted reply
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          />
        </div>
      ) : (
        <p className="mt-3 rounded-[10px] border border-[#ff7a3d]/30 bg-[#ff7a3d]/[0.07] px-3 py-2 text-[12px] text-[#ff7a3d]">
          Marked as <span className="font-medium">{cls}</span> — no reply drafted. Hide or delete.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!ignored ? (
          <>
            <button
              type="button"
              onClick={copy}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition',
                copied
                  ? 'bg-[#0099ff]/15 text-[#0099ff] ring-1 ring-[#0099ff]/30'
                  : 'bg-[#0099ff] text-white hover:bg-[#1aa6ff]',
              )}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copied — paste on platform' : 'Copy reply'}
            </button>
            <form action={approveCommentAction}>
              <input type="hidden" name="id" value={comment.id} />
              <input type="hidden" name="draft" value={draft} />
              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-2 px-3 text-[11px] font-medium text-ink transition hover:border-[#22c55e]/50 hover:text-[#22c55e]"
              >
                <Check size={11} />
                Mark replied
              </button>
            </form>
          </>
        ) : null}
        <form action={hideCommentAction}>
          <input type="hidden" name="id" value={comment.id} />
          <button
            type="submit"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-2 px-3 text-[11px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink"
          >
            <EyeOff size={11} />
            Hide on platform
          </button>
        </form>
        <form action={dismissCommentAction}>
          <input type="hidden" name="id" value={comment.id} />
          <button
            type="submit"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-2 px-3 text-[11px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink"
          >
            <X size={11} />
            Dismiss
          </button>
        </form>
      </div>
    </li>
  );
}

function AddCommentForm({ models }: { models: AiModelRow[] }) {
  const [state, formAction, pending] = useActionState<AddCommentState | null, FormData>(
    addPastedCommentAction,
    null,
  );
  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [authorHandle, setAuthorHandle] = useState('');
  const [commentText, setCommentText] = useState('');

  // Reset on save
  if (state?.status === 'saved' && commentText !== '') {
    setCommentText('');
    setAuthorHandle('');
  }

  return (
    <div className="workflow-input-panel p-4">
      <header className="mb-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Triage a comment
        </h2>
        <p className="mt-1 text-[12px] text-ink-muted">Paste a comment · 1 credit per draft</p>
      </header>
      <form action={formAction} className="flex flex-col gap-3">
        {models.length > 0 ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Voice (optional)
            </span>
            <select
              name="modelId"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
            >
              <option value="">Default brand voice</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Platform
          </span>
          <select
            name="platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] capitalize text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Author handle
          </span>
          <input
            type="text"
            name="authorHandle"
            value={authorHandle}
            onChange={(e) => setAuthorHandle(e.target.value)}
            placeholder="e.g. fitnessbro_42"
            required
            className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Comment text
          </span>
          <textarea
            name="commentText"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={4}
            required
            placeholder="Paste the comment exactly as it appears on the platform."
            className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          />
        </label>

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
            'inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-medium text-white transition',
            'bg-[#0099ff] hover:bg-[#1aa6ff] active:scale-[0.99]',
            'shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)]',
            'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666] disabled:shadow-none',
          )}
        >
          {pending ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Drafting…
            </>
          ) : (
            <>
              <MessageSquarePlus size={13} />
              Draft reply (1 credit)
            </>
          )}
        </button>
      </form>
    </div>
  );
}
