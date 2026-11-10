'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { placeCard, TOUR_STEPS, type Rect } from './tour';

const PAD = 6;

function findTarget(target?: string): Rect | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Starts when the URL carries ?tour=1 (onboarding's last step links there) and
 * strips the flag so a reload does not restart it. No persistence needed: the
 * tour never starts on its own.
 */
export function ProductTour() {
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tour') !== '1') return;
    url.searchParams.delete('tour');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    setStep(0); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const close = useCallback(() => setStep(null), []);
  const go = useCallback(
    (delta: number) =>
      setStep((s) => {
        if (s === null) return s;
        const next = s + delta;
        return next < 0 ? 0 : next >= TOUR_STEPS.length ? null : next;
      }),
    [],
  );

  // Measure the target and place the card; follow resizes and scrolls.
  useLayoutEffect(() => {
    if (step === null) return;
    const measure = () => {
      const r = findTarget(TOUR_STEPS[step].target);
      const card = cardRef.current?.getBoundingClientRect();
      setRect(r);
      setPos(
        placeCard(
          r,
          { width: window.innerWidth, height: window.innerHeight },
          { width: card?.width ?? 340, height: card?.height ?? 220 },
        ),
      );
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    nextRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, close, go]);

  if (step === null) return null;
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-[12px] ring-2 ring-[#0099ff] motion-safe:transition-all"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-black/60" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="fixed w-[min(340px,calc(100vw-32px))] rounded-[16px] border border-[#262626] bg-surface-2 p-5 shadow-2xl"
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#79cfff]">
            {s.section}
          </p>
          <p className="text-[11px] tabular-nums text-ink-muted">
            {step + 1} of {TOUR_STEPS.length}
          </p>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#262626]" aria-hidden="true">
          <div
            className="h-full bg-[#0099ff]"
            style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>
        <h2 id="tour-title" className="mt-3 text-[17px] font-medium text-ink">
          {s.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-[13px] leading-[1.5] text-ink-muted">
          {s.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={close}
            className="inline-flex h-9 items-center rounded-full px-3 text-[12px] text-ink-muted hover:text-ink"
          >
            {last ? 'Close' : 'Skip tour'}
          </button>
          <span className="flex-1" />
          {step > 0 ? (
            <button
              type="button"
              onClick={() => go(-1)}
              className="inline-flex h-9 items-center rounded-full bg-surface-1 px-3.5 text-[12px] text-ink ring-1 ring-[#262626]"
            >
              Back
            </button>
          ) : null}
          <button
            ref={nextRef}
            type="button"
            onClick={() => go(1)}
            className="inline-flex h-9 items-center rounded-full bg-white px-4 text-[12px] font-medium text-black"
          >
            {last ? 'Finish' : step === 0 ? 'Start' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
