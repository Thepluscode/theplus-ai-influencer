'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock3,
  Maximize2,
  MessageSquare,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { RenderedShot } from '@/lib/storyboard';
import type { PostFormat } from '@/types/post';
import { cn } from '@/lib/utils';

/**
 * Auto-cycling carousel that fakes a reel. Each shot displays for its
 * own `durationMs` when it's a still image, or its full video duration
 * when it's animated. Pause / Skip mirror TikTok / Reels gestures.
 *
 * When `videoUrl` is present we render a real <video> for that shot and
 * advance on the natural `ended` event so the cadence matches the actual
 * Luma Dream Machine clip length.
 */
export function ReelPreview({ shots, format }: { shots: RenderedShot[]; format: PostFormat }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const startTsRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const total = shots.length;
  const current = shots[index];
  const isVideoShot = Boolean(current?.videoUrl);
  // When we have real video, the video element drives timing. When it's
  // an image, RAF drives a synthetic timer for the same UX.
  const shotDurationMs = current?.videoDurationMs ?? current?.durationMs ?? 2500;
  const totalDurationMs = useMemo(
    () => shots.reduce((sum, shot) => sum + (shot.videoDurationMs ?? shot.durationMs ?? 2500), 0),
    [shots],
  );
  const currentOffsetMs = useMemo(
    () =>
      shots
        .slice(0, index)
        .reduce((sum, shot) => sum + (shot.videoDurationMs ?? shot.durationMs ?? 2500), 0),
    [shots, index],
  );
  const currentTimecode = formatTimecode(currentOffsetMs + progress * shotDurationMs);
  const totalTimecode = formatTimecode(totalDurationMs);
  const fps = 30;
  const currentFrame = Math.round(((currentOffsetMs + progress * shotDurationMs) / 1000) * fps);

  // Reset progress + restart timing on shot change.
  useEffect(() => {
    if (!current) return;
    startTsRef.current = Date.now();

    if (isVideoShot && videoRef.current) {
      const v = videoRef.current;
      try {
        v.currentTime = 0;
        if (playing) {
          // play() returns a promise that rejects if browser blocks
          // autoplay — swallowing keeps the UI from crashing in that case.
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      } catch {
        // ignore
      }
    }
  }, [index, current, isVideoShot, playing]);

  // RAF progress driver for image shots.
  useEffect(() => {
    if (!playing || !current || isVideoShot) return;

    function tick() {
      const elapsed = Date.now() - startTsRef.current;
      const pct = Math.min(1, elapsed / shotDurationMs);
      setProgress(pct);
      if (pct >= 1) {
        setProgress(0);
        setIndex((i) => (i + 1) % total);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [index, playing, current, total, isVideoShot, shotDurationMs]);

  // Video timeupdate progress driver.
  function handleVideoTimeUpdate() {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress(Math.min(1, v.currentTime / v.duration));
  }

  function handleVideoEnded() {
    setProgress(0);
    setIndex((i) => (i + 1) % total);
  }

  // Sync play/pause state to video element.
  useEffect(() => {
    if (!isVideoShot || !videoRef.current) return;
    const v = videoRef.current;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, isVideoShot, index]);

  const aspect =
    format === 'square'
      ? 'aspect-square'
      : format === 'portrait'
        ? 'aspect-[9/16]'
        : 'aspect-[16/9]';

  const heroMax = format === 'landscape' ? 'max-w-2xl' : 'max-w-sm';
  const bars = useMemo(() => Array.from({ length: total }, (_, i) => i), [total]);
  const markerStops = useMemo(() => {
    const durations = shots.map((shot) => shot.videoDurationMs ?? shot.durationMs ?? 2500);
    return durations.map((duration, i) => {
      const startMs = durations.slice(0, i).reduce((sum, d) => sum + d, 0);
      const start = totalDurationMs > 0 ? (startMs / totalDurationMs) * 100 : 0;
      const width = totalDurationMs > 0 ? (duration / totalDurationMs) * 100 : 0;
      return { start, width, duration };
    });
  }, [shots, totalDurationMs]);

  if (total === 0 || !current) {
    return (
      <div className="rounded-[16px] border border-dashed border-[#262626] bg-surface-1/50 p-8 text-center text-[13px] text-ink-muted">
        No shots in this storyboard.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[18px] border border-[#262626] bg-[#080808] shadow-[0_24px_80px_-44px_rgba(0,0,0,0.95)]">
      <header className="flex items-center justify-between gap-3 border-b border-[#1a1a1a] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[#0099ff] ring-1 ring-[#262626]">
            <Scissors size={13} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-ink">
              Review player
            </h2>
            <p className="truncate text-[11px] text-[#666]">
              Remotion-style sequence · {fps}fps · {totalTimecode}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isVideoShot ? (
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-[#a855f7]/10 px-2.5 text-[10px] font-medium uppercase tracking-wider text-[#a855f7] ring-1 ring-[#a855f7]/30">
              <span className="h-1 w-1 rounded-full bg-[#a855f7]" />
              animated
            </span>
          ) : null}
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#262626] bg-surface-1 text-ink-muted transition hover:border-[#444] hover:text-ink"
            aria-label="Open full screen preview"
            title="Full screen"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </header>

      <div className="px-4 py-4">
        <div className={cn('mx-auto w-full', heroMax)}>
          <figure
            className={cn(
              'relative w-full overflow-hidden rounded-[14px] border border-[#262626] bg-canvas',
              aspect,
            )}
          >
            {/* Video or image for the active shot */}
            {isVideoShot ? (
              <video
                ref={videoRef}
                key={current.videoUrl}
                src={current.videoUrl}
                autoPlay={playing}
                muted
                playsInline
                onTimeUpdate={handleVideoTimeUpdate}
                onEnded={handleVideoEnded}
                className="h-full w-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={current.imageUrl}
                src={current.imageUrl}
                alt={`Shot ${current.index + 1}`}
                className="h-full w-full object-cover transition-opacity duration-300"
              />
            )}

            {/* Per-shot progress bars across the top */}
            <div className="absolute inset-x-3 top-3 flex gap-1">
              {bars.map((i) => {
                const widthPct = i < index ? 100 : i === index ? progress * 100 : 0;
                return (
                  <div
                    key={i}
                    className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/25"
                  >
                    <span
                      className="absolute inset-y-0 left-0 bg-white"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Hook caption */}
            {current.hookCaption ? (
              <p className="absolute inset-x-4 bottom-12 text-center text-[18px] font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                {current.hookCaption}
              </p>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

            <span className="absolute bottom-3 left-3 inline-flex h-6 items-center rounded-full bg-black/55 px-2.5 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur">
              Shot {current.index + 1} / {total}
            </span>
            <span className="absolute bottom-3 right-3 inline-flex h-6 items-center gap-1 rounded-full bg-black/55 px-2.5 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur">
              <Clock3 size={10} />
              {currentTimecode}
            </span>
          </figure>

          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIndex((i) => (i - 1 + total) % total);
                setProgress(0);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#262626] bg-surface-1 text-ink-muted transition hover:border-[#0099ff]/50 hover:text-[#0099ff]"
              aria-label="Previous shot"
            >
              <SkipBack size={14} />
            </button>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#0099ff] text-white shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)] transition hover:bg-[#1aa6ff]"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button
              type="button"
              onClick={() => {
                setIndex((i) => (i + 1) % total);
                setProgress(0);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#262626] bg-surface-1 text-ink-muted transition hover:border-[#0099ff]/50 hover:text-[#0099ff]"
              aria-label="Next shot"
            >
              <SkipForward size={14} />
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-[12px] border border-[#1f1f1f] bg-[#0d0d0d] p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-wider text-[#666]">
            <span>Sequence timeline</span>
            <span>
              f{currentFrame.toString().padStart(4, '0')} · {currentTimecode} / {totalTimecode}
            </span>
          </div>
          <div className="relative h-12 overflow-hidden rounded-[9px] border border-[#262626] bg-surface-1">
            {markerStops.map((marker, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setIndex(i);
                  setProgress(0);
                }}
                className={cn(
                  'absolute inset-y-0 border-r border-black/70 transition',
                  i === index
                    ? 'bg-[#0099ff]/25'
                    : shots[i]?.videoUrl
                      ? 'bg-[#a855f7]/16 hover:bg-[#a855f7]/24'
                      : 'bg-white/[0.045] hover:bg-white/[0.075]',
                )}
                style={{ left: `${marker.start}%`, width: `${marker.width}%` }}
                aria-label={`Jump to shot ${i + 1}`}
                title={`Shot ${i + 1} · ${formatTimecode(marker.duration)}`}
              >
                <span className="absolute left-2 top-1.5 text-[10px] font-medium text-ink-muted">
                  {i + 1}
                </span>
                {shots[i]?.hookCaption ? (
                  <span className="absolute bottom-1.5 left-2 right-2 truncate text-left text-[10px] text-ink">
                    {shots[i].hookCaption}
                  </span>
                ) : null}
              </button>
            ))}
            <span
              className="absolute inset-y-0 w-px bg-[#0099ff] shadow-[0_0_16px_rgba(0,153,255,0.75)]"
              style={{
                left:
                  totalDurationMs > 0
                    ? `${((currentOffsetMs + progress * shotDurationMs) / totalDurationMs) * 100}%`
                    : '0%',
              }}
            />
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-muted">
            <MessageSquare size={11} className="text-[#0099ff]" />
            <span>Comment markers map to shots. Next pass can persist anchored review notes.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatTimecode(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frames = Math.floor(((ms % 1000) / 1000) * 30);
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}
