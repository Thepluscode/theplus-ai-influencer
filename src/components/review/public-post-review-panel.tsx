'use client';

import { useActionState, useMemo, useState, type PointerEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { MessageSquarePlus, MousePointer2, Send } from 'lucide-react';
import {
  addPublicReviewCommentAction,
  type PublicReviewCommentState,
} from '@/app/p/[token]/actions';
import { clampReviewCoordinate, formatReviewTimecode } from '@/lib/review-comments-schema';
import type { ReviewCommentRow } from '@/lib/supabase/types';
import type { PostFormat, PostVariant } from '@/types/post';
import { cn } from '@/lib/utils';

interface Props {
  token: string;
  postName: string;
  format: PostFormat;
  variants: PostVariant[];
  comments: ReviewCommentRow[];
}

export function PublicPostReviewPanel({ token, postName, format, variants, comments }: Props) {
  const [state, formAction] = useActionState<PublicReviewCommentState | null, FormData>(
    addPublicReviewCommentAction,
    null,
  );
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [anchor, setAnchor] = useState({ x: 50, y: 50 });
  const selectedVariant = variants[selectedVariantIndex] ?? variants[0] ?? null;
  const selectedTimeMs = selectedVariantIndex * 1000;
  const selectedVariantComments = comments.filter(
    (comment) => comment.variant_index === selectedVariantIndex,
  );
  const orderedComments = useMemo(() => [...comments].reverse(), [comments]);
  const aspect = getAspectClass(format);

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
          {comments.length}
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
          className={cn(
            'relative overflow-hidden rounded-[12px] border border-[#262626] bg-canvas',
            aspect,
          )}
          aria-label="Place review marker"
        >
          {selectedVariant ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedVariant.url} alt={postName} className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[10px] uppercase tracking-wider text-[#444]">
              no asset
            </div>
          )}

          {selectedVariantComments.map((comment, index) => (
            <span
              key={comment.id}
              className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-[#0099ff] text-[10px] font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
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

        {variants.length > 1 ? (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {variants.map((variant, index) => (
              <button
                key={variant.generationId || variant.url || index}
                type="button"
                onClick={() => setSelectedVariantIndex(index)}
                aria-pressed={index === selectedVariantIndex}
                className={cn(
                  'h-8 min-w-11 rounded-full px-3 text-[11px] font-medium transition',
                  index === selectedVariantIndex
                    ? 'bg-[#0099ff] text-white'
                    : 'bg-surface-2 text-ink-muted ring-1 ring-[#262626] hover:text-ink',
                )}
              >
                V{index + 1}
              </button>
            ))}
          </div>
        ) : null}

        <form action={formAction} className="grid gap-2">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="shotIndex" value="" />
          <input type="hidden" name="variantIndex" value={selectedVariantIndex} />
          <input type="hidden" name="timeMs" value={selectedTimeMs} />
          <input type="hidden" name="anchorX" value={anchor.x} />
          <input type="hidden" name="anchorY" value={anchor.y} />

          <div className="grid grid-cols-2 gap-2">
            <label className="sr-only" htmlFor="public-review-author">
              Name
            </label>
            <input
              id="public-review-author"
              name="authorName"
              className="h-9 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[12px] text-ink outline-none transition placeholder:text-[#555] focus:border-[#0099ff]"
              placeholder="Name"
            />
            <label className="sr-only" htmlFor="public-review-email">
              Email
            </label>
            <input
              id="public-review-email"
              name="authorEmail"
              type="email"
              className="h-9 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[12px] text-ink outline-none transition placeholder:text-[#555] focus:border-[#0099ff]"
              placeholder="Email"
            />
          </div>

          <label className="sr-only" htmlFor="public-review-body">
            Comment
          </label>
          <textarea
            id="public-review-body"
            name="body"
            rows={3}
            className="min-h-[76px] resize-none rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[12px] leading-[1.45] text-ink outline-none transition placeholder:text-[#555] focus:border-[#0099ff]"
            placeholder="Add approval feedback..."
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

          <SubmitPublicReviewButton disabled={!selectedVariant} />
        </form>

        <ul className="grid gap-2">
          {orderedComments.length > 0 ? (
            orderedComments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-[12px] border border-[#262626] bg-surface-2 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex h-5 items-center rounded-full bg-[#0099ff]/12 px-2 text-[10px] font-medium text-[#0099ff] ring-1 ring-[#0099ff]/30">
                    {formatReviewTimecode(comment.time_ms)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[#666]">
                    {comment.variant_index === null
                      ? 'Asset'
                      : `Variant ${comment.variant_index + 1}`}
                  </span>
                </div>
                <p className="text-[12px] font-medium text-ink">{comment.author_name}</p>
                <p className="mt-1 whitespace-pre-wrap text-[12px] leading-[1.45] text-ink-muted">
                  {comment.body}
                </p>
              </li>
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

function SubmitPublicReviewButton({ disabled }: { disabled: boolean }) {
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

function getAspectClass(format: PostFormat): string {
  if (format === 'square') return 'aspect-square';
  if (format === 'landscape') return 'aspect-[16/9]';
  return 'aspect-[9/16]';
}
