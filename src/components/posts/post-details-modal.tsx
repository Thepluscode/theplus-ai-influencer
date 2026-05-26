'use client';

import { useActionState, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  deletePostAction,
  reschedulePostAction,
  toggleShareLinkAction,
  type ReschedState,
  type ShareLinkState,
} from '@/app/(app)/calendar/actions';
import { ConnectionsRequired } from '@/components/posts/connections-required';
import type { PostRow } from '@/lib/supabase/types';
import type { Platform } from '@/types/post';
import { cn } from '@/lib/utils';

interface Props {
  post: PostRow | null;
  /** Platforms the workspace has connected via Zernio. Drives the
   *  Connections-required warning inside the modal. */
  connectedPlatforms: Platform[];
  /** Optional persona name pulled from joined ai_models row; falls back
   *  to "(unknown model)". */
  modelName?: string | null;
  /** Reason saving is disabled (e.g. Supabase unconfigured). */
  saveDisabledReason?: string | null;
  onClose: () => void;
}

/**
 * Unified post details modal — opened from any surface that has a post
 * chip (Studio Recent Activity, Dashboard Next-up, Calendar grid). The
 * layout mirrors the InfluencerAI reference: hero image left, details +
 * actions right.
 *
 * Renders nothing when post is null so the caller can keep one instance
 * mounted and toggle via `setActive(post)`.
 */
export function PostDetailsModal({
  post,
  connectedPlatforms,
  modelName,
  saveDisabledReason,
  onClose,
}: Props) {
  if (!post) return null;

  return (
    <PostDetailsModalBody
      key={post.id}
      post={post}
      connectedPlatforms={connectedPlatforms}
      modelName={modelName}
      saveDisabledReason={saveDisabledReason}
      onClose={onClose}
    />
  );
}

function PostDetailsModalBody({
  post,
  connectedPlatforms,
  modelName,
  saveDisabledReason,
  onClose,
}: Omit<Props, 'post'> & { post: PostRow }) {
  // Local "live" copy of the schedule so the modal reflects edits without
  // waiting for a refresh.
  const [scheduledFor, setScheduledFor] = useState<string>(
    post.scheduled_for ? format(new Date(post.scheduled_for), "yyyy-MM-dd'T'HH:mm") : '',
  );
  const [caption, setCaption] = useState<string>(post.caption ?? '');

  const [reschedState, reschedAction, rescheduling] = useActionState<ReschedState | null, FormData>(
    reschedulePostAction,
    null,
  );
  const [shareState, shareAction, sharing] = useActionState<ShareLinkState | null, FormData>(
    toggleShareLinkAction,
    null,
  );

  const currentToken = useMemo(() => {
    if (shareState?.status === 'enabled') return shareState.token;
    if (shareState?.status === 'disabled') return null;
    return post.share_token ?? null;
  }, [post, shareState]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.theplus.ai';
  const shareUrl = currentToken ? `${origin}/p/${currentToken}` : null;

  const [copied, setCopied] = useState(false);
  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  const aspect =
    post.format === 'square'
      ? 'aspect-square'
      : post.format === 'portrait'
        ? 'aspect-[9/16]'
        : 'aspect-[16/9]';

  const settled = reschedState?.status === 'saved' || reschedState?.status === 'partial';
  const saveDisabled = rescheduling || Boolean(saveDisabledReason);
  const hero = post.variants[0]?.url;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-[#262626] bg-surface-1 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] md:grid-cols-[1fr_400px]">
        {/* ---- HERO IMAGE ---- */}
        <div className="relative bg-canvas">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero} alt="" className={cn('w-full object-cover md:h-full', aspect)} />
          ) : (
            <div className={cn('grid w-full place-items-center text-[#444]', aspect)}>
              no preview
            </div>
          )}
          <span
            className={cn(
              'absolute left-3 top-3 inline-flex h-7 items-center rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur',
              post.status === 'scheduled'
                ? 'bg-[#0099ff]/20 text-[#0099ff] ring-1 ring-[#0099ff]/40'
                : post.status === 'published'
                  ? 'bg-[#22c55e]/20 text-[#22c55e] ring-1 ring-[#22c55e]/40'
                  : 'bg-surface-2 text-ink-muted ring-1 ring-[#262626]',
            )}
          >
            {post.status}
          </span>
        </div>

        {/* ---- RIGHT PANEL ---- */}
        <div className="flex max-h-[min(85dvh,860px)] flex-col overflow-y-auto">
          <header className="flex items-start justify-between gap-3 border-b border-[#1a1a1a] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                Post details
              </p>
              <h3 className="mt-1 truncate text-[16px] font-semibold text-ink" title={post.name}>
                {post.name}
              </h3>
              {currentToken ? (
                <span className="mt-2 inline-flex h-6 items-center gap-1.5 rounded-full bg-[#22c55e]/12 px-2.5 text-[10px] font-medium uppercase tracking-wider text-[#86efac] ring-1 ring-[#22c55e]/30">
                  <Check size={10} />
                  Review link ready
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#262626] bg-surface-2 text-ink-muted transition hover:border-[#444] hover:text-ink"
              aria-label="Close"
            >
              <X size={12} />
            </button>
          </header>

          <div className="flex flex-col gap-4 p-4">
            {/* Platform + model pills */}
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                Platform & Model
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {post.platforms.length > 0 ? (
                  post.platforms.map((p) => (
                    <span
                      key={p}
                      className="inline-flex h-7 items-center rounded-full bg-surface-2 px-3 text-[12px] font-medium capitalize text-ink ring-1 ring-[#262626]"
                    >
                      {p}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] italic text-[#666]">no platforms</span>
                )}
                {modelName ? (
                  <span className="inline-flex h-7 items-center rounded-full bg-[#0099ff]/10 px-3 text-[12px] font-medium text-[#0099ff] ring-1 ring-[#0099ff]/30">
                    {modelName}
                  </span>
                ) : null}
              </div>
            </section>

            {/* Caption + schedule live form */}
            <form action={reschedAction} className="flex flex-col gap-3">
              <input type="hidden" name="postId" value={post.id} />

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  Caption
                </span>
                <textarea
                  name="caption"
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] leading-[1.5] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  Scheduled for
                </span>
                <input
                  type="datetime-local"
                  name="scheduledFor"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
                />
                <span className="text-[10px] text-[#666]">Leave blank to move back to drafts.</span>
              </label>

              <ConnectionsRequired
                selected={post.platforms as Platform[]}
                connected={connectedPlatforms}
              />

              {reschedState?.status === 'error' ? (
                <p className="rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-2.5 py-1.5 text-[11px] text-[#ff5577]">
                  {reschedState.error}
                </p>
              ) : null}
              {reschedState?.status === 'partial' ? (
                <p className="rounded-[10px] border border-[#ff7a3d]/40 bg-[#ff7a3d]/[0.07] px-2.5 py-1.5 text-[11px] text-[#ff7a3d]">
                  Saved with caveat: {reschedState.warning}
                </p>
              ) : null}
              {reschedState?.status === 'saved' && reschedState.pushedToZernio ? (
                <p className="rounded-[10px] border border-[#0099ff]/30 bg-[#0099ff]/[0.07] px-2.5 py-1.5 text-[11px] text-[#0099ff]">
                  Pushed to Zernio.
                </p>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saveDisabled}
                  title={saveDisabledReason ?? undefined}
                  className={cn(
                    'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] text-[13px] font-medium transition',
                    'bg-[#0099ff] text-white hover:bg-[#1aa6ff] active:scale-[0.99]',
                    'shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)]',
                    'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666] disabled:shadow-none',
                  )}
                >
                  {rescheduling ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : settled ? (
                    <Check size={13} />
                  ) : (
                    <Save size={13} />
                  )}
                  {settled ? 'Saved' : 'Save changes'}
                </button>
                <DeleteButton postId={post.id} onDeleted={onClose} />
              </div>
            </form>

            {/* Share link */}
            <SharePanel
              postId={post.id}
              currentToken={currentToken}
              shareUrl={shareUrl}
              shareState={shareState}
              shareAction={shareAction}
              sharing={sharing}
              copied={copied}
              onCopy={copyShareLink}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteButton({ postId, onDeleted }: { postId: string; onDeleted: () => void }) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!window.confirm('Delete this post? This cannot be undone.')) {
      return;
    }

    setPending(true);
    try {
      const fd = new FormData();
      fd.set('postId', postId);
      await deletePostAction(fd);
      setPending(false);
      onDeleted();
    } catch (err) {
      setPending(false);
      throw err;
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#262626] bg-surface-2 text-ink-muted transition hover:border-[#ff5577]/50 hover:bg-[#ff5577]/10 hover:text-[#ff5577] disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="Delete post"
      title="Delete post"
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );
}

function SharePanel({
  postId,
  currentToken,
  shareUrl,
  shareState,
  shareAction,
  sharing,
  copied,
  onCopy,
}: {
  postId: string;
  currentToken: string | null;
  shareUrl: string | null;
  shareState: ShareLinkState | null;
  shareAction: (formData: FormData) => void;
  sharing: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-[#262626] bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Review link
        </span>
        {currentToken ? (
          <form action={shareAction}>
            <input type="hidden" name="postId" value={postId} />
            <input type="hidden" name="intent" value="disable" />
            <button
              type="submit"
              disabled={sharing}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-muted transition hover:text-[#ff5577] disabled:opacity-60"
            >
              {sharing ? <Loader2 size={10} className="animate-spin" /> : <Link2Off size={10} />}
              Revoke
            </button>
          </form>
        ) : null}
      </div>

      {currentToken && shareUrl ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={shareUrl}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-[8px] border border-[#262626] bg-canvas px-2.5 py-1.5 font-mono text-[11px] text-[#0099ff] outline-none"
          />
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#262626] bg-surface-1 text-ink-muted transition hover:border-[#0099ff]/50 hover:text-[#0099ff]"
            aria-label="Open share link"
            title="Open in new tab"
          >
            <ExternalLink size={11} />
          </a>
          <button
            type="button"
            onClick={onCopy}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[11px] font-medium transition',
              copied
                ? 'bg-[#0099ff]/15 text-[#0099ff] ring-1 ring-[#0099ff]/30'
                : 'bg-[#0099ff] text-white hover:bg-[#1aa6ff]',
            )}
          >
            {copied ? (
              <>
                <Check size={11} />
                Copied
              </>
            ) : (
              <>
                <Copy size={11} />
                Copy
              </>
            )}
          </button>
        </div>
      ) : (
        <form action={shareAction} className="mt-2">
          <input type="hidden" name="postId" value={postId} />
          <button
            type="submit"
            disabled={sharing}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-[#262626] bg-surface-1 py-2 text-[12px] font-medium text-ink transition hover:border-[#0099ff]/50 hover:text-[#0099ff] disabled:opacity-60"
          >
            {sharing ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
            Generate review link
          </button>
        </form>
      )}

      {shareState?.status === 'error' ? (
        <p className="mt-2 text-[10px] text-[#ff5577]">{shareState.error}</p>
      ) : !currentToken ? (
        <p className="mt-1.5 text-[10px] text-[#666]">
          Anyone with the link can view and approve this post.
        </p>
      ) : null}
    </div>
  );
}

/** Bare "look like a chip" trigger that pairs with PostDetailsModal. */
export function PostChipButton({
  post,
  onClick,
  className,
}: {
  post: PostRow;
  onClick: () => void;
  className?: string;
}) {
  const thumb = post.variants[0]?.url;
  const time = post.scheduled_for ? format(new Date(post.scheduled_for), 'MMM d · h:mm a') : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[12px] border border-[#262626] bg-surface-2 px-2.5 py-2 text-left transition hover:border-[#0099ff]/50 hover:bg-[#1a1a1a]',
        className,
      )}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          className="h-10 w-10 shrink-0 rounded-[8px] object-cover ring-1 ring-[#262626]"
        />
      ) : (
        <span className="h-10 w-10 shrink-0 rounded-[8px] bg-[#262626]" />
      )}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px] font-medium text-ink">{post.name}</span>
        <span className="truncate text-[11px] text-ink-muted">
          {post.platforms.length > 0
            ? post.platforms.map((p) => p[0].toUpperCase() + p.slice(1)).join(' · ')
            : 'no platforms'}
          {time ? ` · ${time}` : ''}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
          post.status === 'scheduled'
            ? 'bg-[#0099ff]/15 text-[#0099ff] ring-1 ring-[#0099ff]/30'
            : post.status === 'published'
              ? 'bg-[#22c55e]/15 text-[#22c55e] ring-1 ring-[#22c55e]/30'
              : 'bg-surface-1 text-ink-muted ring-1 ring-[#262626]',
        )}
      >
        {post.status}
      </span>
      <ArrowUpRight size={12} className="shrink-0 text-ink-muted" />
    </button>
  );
}
