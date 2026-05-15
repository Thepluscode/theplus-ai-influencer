'use client';

import { useActionState, useMemo, useState, type PointerEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, Circle, MessageSquarePlus, MousePointer2, Send } from 'lucide-react';
import {
  addStoryboardReviewCommentAction,
  setStoryboardReviewCommentStatusAction,
  type ReviewCommentState,
} from '@/app/(app)/storyboard/actions';
import { clampReviewCoordinate, formatReviewTimecode } from '@/lib/review-comments-schema';
import type { ReviewCommentRow } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';

interface ReviewShot {
  index: number;
  imageUrl: string;
  prompt: string;
  hookCaption: string;
  durationMs?: number;
  videoDurationMs?: number;
}

interface Props {
  storyboardId: string;
  shots: ReviewShot[];
  comments: ReviewCommentRow[];
  defaultAuthorName: string;
}

export function StoryboardReviewPanel({ storyboardId, shots, comments, defaultAuthorName }: Props) {
  const [state, formAction] = useActionState<ReviewCommentState | null, FormData>(
    addStoryboardReviewCommentAction,
    null,
  );
  const [selectedShotIndex, setSelectedShotIndex] = useState(0);
  const [anchor, setAnchor] = useState({ x: 50, y: 50 });

  const selectedShot = shots[selectedShotIndex] ?? shots[0] ?? null;
  const selectedShotNumber = selectedShot?.index ?? selectedShotIndex;
  const selectedTimeMs = getShotStartMs(shots, selectedShotIndex);
  const selectedShotComments = comments.filter(
    (comment) => comment.shot_index === selectedShotNumber,
  );
  const orderedComments = useMemo(() => [...comments].reverse(), [comments]);
  const openCount = comments.filter((comment) => comment.status === 'open').length;

  function placeAnchor(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setAnchor({
      x: clampReviewCoordinate(((event.clientX - rect.left) / rect.width) * 100),
      y: clampReviewCoordinate(((event.clientY - rect.top) / rect.height) * 100),
    });
  }

  return (
    <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquarePlus size={14} className="text-[#22c55e]" />
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Review comments
          </h2>
        </div>
        <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] uppercase tracking-wider text-[#666] ring-1 ring-[#262626]">
          {openCount} open
        </span>
      </div>

      <div className="grid gap-3">
        <div
          role="button"
          tabIndex={0}
          onPointerDown={placeAnchor}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setAnchor({ x: 50, y: 50 });
            }
          }}
          className="relative aspect-video overflow-hidden rounded-[12px] border border-[#262626] bg-canvas"
          aria-label="Place review marker"
        >
          {selectedShot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedShot.imageUrl}
              alt={`Shot ${selectedShot.index + 1}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[10px] uppercase tracking-wider text-[#444]">
              no frame
            </div>
          )}

          {selectedShotComments.map((comment, index) => (
            <span
              key={comment.id}
              className={cn(
                'absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[10px] font-semibold shadow-[0_8px_20px_rgba(0,0,0,0.35)]',
                comment.status === 'resolved'
                  ? 'border-[#22c55e]/70 bg-[#22c55e] text-black'
                  : 'border-white/70 bg-[#0099ff] text-white',
              )}
              style={{ left: `${comment.anchor_x}%`, top: `${comment.anchor_y}%` }}
              title={comment.body}
            >
              {index + 1}
            </span>
          ))}

          <span
            className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white text-black shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
            style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
          >
            <MousePointer2 size={13} />
          </span>
        </div>

        {shots.length > 0 ? (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {shots.map((shot, index) => (
              <button
                key={shot.index}
                type="button"
                onClick={() => setSelectedShotIndex(index)}
                aria-pressed={index === selectedShotIndex}
                className={cn(
                  'w-[72px] shrink-0 overflow-hidden rounded-[10px] border bg-surface-2 text-left transition',
                  index === selectedShotIndex
                    ? 'border-[#0099ff] ring-1 ring-[#0099ff]/40'
                    : 'border-[#262626] hover:border-[#444]',
                )}
              >
                <span className="relative block aspect-video">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shot.imageUrl}
                    alt={`Shot ${shot.index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="block px-2 py-1 text-[10px] font-medium text-ink">
                  S{shot.index + 1}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <form action={formAction} className="grid gap-2">
          <input type="hidden" name="storyboardId" value={storyboardId} />
          <input type="hidden" name="shotIndex" value={selectedShotNumber} />
          <input type="hidden" name="variantIndex" value="" />
          <input type="hidden" name="timeMs" value={selectedTimeMs} />
          <input type="hidden" name="anchorX" value={anchor.x} />
          <input type="hidden" name="anchorY" value={anchor.y} />

          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
            <label className="sr-only" htmlFor="storyboard-author-name">
              Name
            </label>
            <input
              id="storyboard-author-name"
              name="authorName"
              defaultValue={defaultAuthorName}
              className="h-9 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[12px] text-ink outline-none transition placeholder:text-[#555] focus:border-[#0099ff]"
              placeholder="Name"
            />
            <span className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[#262626] bg-surface-2 text-[10px] font-medium text-[#0099ff]">
              {formatReviewTimecode(selectedTimeMs)}
            </span>
          </div>

          <label className="sr-only" htmlFor="storyboard-review-body">
            Comment
          </label>
          <textarea
            id="storyboard-review-body"
            name="body"
            rows={3}
            className="min-h-[76px] resize-none rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[12px] leading-[1.45] text-ink outline-none transition placeholder:text-[#555] focus:border-[#0099ff]"
            placeholder="Add frame-specific feedback..."
          />

          {state?.status === 'error' ? (
            <p className="rounded-[10px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-[12px] text-[#fca5a5]">
              {state.error}
            </p>
          ) : null}
          {state?.status === 'success' ? (
            <p className="rounded-[10px] border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-2 text-[12px] text-[#86efac]">
              {state.message}
            </p>
          ) : null}

          <SubmitReviewButton disabled={!selectedShot} />
        </form>

        <ul className="grid gap-2">
          {orderedComments.length > 0 ? (
            orderedComments.map((comment) => (
              <ReviewCommentItem key={comment.id} comment={comment} storyboardId={storyboardId} />
            ))
          ) : (
            <li className="rounded-[12px] border border-[#262626] bg-surface-2 p-3 text-[12px] text-ink-muted">
              No comments yet.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

function ReviewCommentItem({
  comment,
  storyboardId,
}: {
  comment: ReviewCommentRow;
  storyboardId: string;
}) {
  const nextStatus = comment.status === 'open' ? 'resolved' : 'open';
  return (
    <li className="rounded-[12px] border border-[#262626] bg-surface-2 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-5 items-center rounded-full bg-[#0099ff]/12 px-2 text-[10px] font-medium text-[#0099ff] ring-1 ring-[#0099ff]/30">
              {formatReviewTimecode(comment.time_ms)}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[#666]">
              {comment.shot_index === null ? 'General' : `Shot ${comment.shot_index + 1}`}
            </span>
          </div>
          <p className="mt-2 text-[12px] font-medium text-ink">{comment.author_name}</p>
        </div>
        <form action={setStoryboardReviewCommentStatusAction}>
          <input type="hidden" name="commentId" value={comment.id} />
          <input type="hidden" name="storyboardId" value={storyboardId} />
          <input type="hidden" name="status" value={nextStatus} />
          <button
            type="submit"
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium uppercase tracking-wider transition',
              comment.status === 'resolved'
                ? 'bg-[#22c55e]/12 text-[#86efac] ring-1 ring-[#22c55e]/30 hover:bg-[#22c55e]/18'
                : 'bg-surface-1 text-ink-muted ring-1 ring-[#262626] hover:text-ink',
            )}
          >
            {comment.status === 'resolved' ? <CheckCircle2 size={11} /> : <Circle size={11} />}
            {comment.status}
          </button>
        </form>
      </div>
      <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-ink-muted">
        {comment.body}
      </p>
    </li>
  );
}

function SubmitReviewButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] bg-white px-3 text-[12px] font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Send size={13} />
      {pending ? 'Sending...' : 'Send note'}
    </button>
  );
}

function getShotStartMs(shots: ReviewShot[], selectedIndex: number): number {
  return shots
    .slice(0, Math.max(0, selectedIndex))
    .reduce((sum, shot) => sum + (shot.videoDurationMs ?? shot.durationMs ?? 2500), 0);
}
