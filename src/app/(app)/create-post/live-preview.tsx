'use client';

import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Selected variant URL (or undefined while pending / empty). */
  imageUrl?: string;
  /** Operator-selected caption to surface in the preview. */
  caption: string;
  /** Persona handle / display name. Falls back to `influencer_ai`. */
  username: string;
  /** Selected post format — drives the image aspect. */
  format: 'square' | 'portrait' | 'landscape';
  /** Active variant index (1-based) for the V1 / V2 chip. */
  variantNumber: number;
  /** Number of variants available — controls whether the toggle renders. */
  variantCount: number;
  /** Click handler for the V1 / V2 chip. */
  onPickVariant: (index: number) => void;
}

/**
 * Instagram-style phone mockup that frames the selected variant in a
 * realistic feed card. Mirrors the InfluencerAI reference's "Live Preview"
 * right column. Purely visual — no network calls. Updates as the operator
 * edits caption / picks variants.
 */
export function LivePreview({
  imageUrl,
  caption,
  username,
  format,
  variantNumber,
  variantCount,
  onPickVariant,
}: Props) {
  const aspect =
    format === 'square'
      ? 'aspect-square'
      : format === 'portrait'
        ? 'aspect-[9/16]'
        : 'aspect-[16/9]';

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-3 rounded-[12px] border border-[#262626] bg-surface-1 px-4 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Live Preview
        </span>
        {variantCount > 1 ? (
          <div className="flex items-center gap-1">
            {Array.from({ length: variantCount }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPickVariant(i)}
                aria-pressed={i + 1 === variantNumber}
                className={cn(
                  'h-7 min-w-9 rounded-full px-2.5 text-[11px] font-medium transition',
                  i + 1 === variantNumber
                    ? 'bg-[#0099ff] text-white'
                    : 'bg-surface-2 text-ink-muted ring-1 ring-[#262626] hover:text-ink',
                )}
              >
                v{i + 1}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {/* Phone bezel */}
      <div className="mx-auto w-full max-w-[340px]">
        <div className="rounded-[36px] border border-[#262626] bg-[#0a0a0a] p-2 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
          <div className="overflow-hidden rounded-[28px] bg-canvas">
            {/* notch */}
            <div className="flex items-center justify-center bg-canvas py-2">
              <span className="h-1 w-12 rounded-full bg-[#1c1c1c]" />
            </div>

            {/* Instagram-style card */}
            <div className="bg-canvas">
              {/* IG card header */}
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[1.5px]">
                    <span className="inline-flex h-full w-full items-center justify-center rounded-full bg-canvas text-[10px] font-medium text-ink">
                      {username.slice(0, 1).toUpperCase()}
                    </span>
                  </span>
                  <div className="flex flex-col leading-tight">
                    <span className="text-[12px] font-semibold text-ink">{username}</span>
                    <span className="text-[10px] text-ink-muted">Sponsored</span>
                  </div>
                </div>
                <MoreHorizontal size={14} className="text-ink-muted" />
              </div>

              {/* Image */}
              <div className={cn('relative w-full overflow-hidden bg-surface-1', aspect)}>
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-[10px] uppercase tracking-wider text-[#444]">
                    no variant yet
                  </div>
                )}
              </div>

              {/* IG action row */}
              <div className="flex items-center justify-between px-3 py-2.5 text-ink">
                <div className="flex items-center gap-3">
                  <Heart size={18} strokeWidth={1.8} />
                  <MessageCircle size={18} strokeWidth={1.8} />
                  <Send size={18} strokeWidth={1.8} />
                </div>
                <Bookmark size={18} strokeWidth={1.8} />
              </div>

              {/* Like count + caption */}
              <div className="px-3 pb-3">
                <p className="text-[12px] font-semibold text-ink">1,245 likes</p>
                {caption ? (
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-[1.35] text-ink">
                    <span className="font-semibold">{username}</span>{' '}
                    <span className="text-ink/90">{caption}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-[12px] text-ink-muted">
                    <span className="font-semibold text-ink">{username}</span>{' '}
                    <span className="italic">
                      Caption will appear here once you generate / pick one.
                    </span>
                  </p>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-wider text-ink-muted">
                  2 hours ago
                </p>
              </div>
            </div>

            {/* home indicator */}
            <div className="flex justify-center bg-canvas py-2">
              <span className="h-1 w-24 rounded-full bg-[#1c1c1c]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
