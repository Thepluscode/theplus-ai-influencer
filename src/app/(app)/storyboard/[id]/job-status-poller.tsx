'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, CheckCircle2, Film } from 'lucide-react';

/**
 * Polls /api/jobs/storyboard-animate/status while a render is in flight.
 *
 * Refresh strategy:
 *   - Poll every 4s while status is pending/processing
 *   - On a status change (e.g., first shot completes → shots_completed
 *     advances), call router.refresh() so the page server-renders the
 *     latest shots JSON and the reel preview swaps in the new <video>
 *   - On completed/failed, stop polling and refresh once more so the
 *     AnimateButton re-renders in its terminal state
 *
 * Heads-up: this component must be mounted by the server page only when
 * an active job exists, so we don't fire endless polls on storyboards
 * that haven't been animated. Once mounted, it'll keep polling until
 * the job reaches a terminal state — even if the user clicks Animate
 * again afterwards, the page will re-render and the poller will see
 * the new job.
 */

interface JobStatus {
  status:
    | 'none'
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed';
  shotsCompleted?: number;
  shotsTotal?: number;
  lastError?: string | null;
}

const POLL_INTERVAL_MS = 4_000;
const TERMINAL: ReadonlyArray<JobStatus['status']> = ['completed', 'failed', 'none'];

export function JobStatusPoller({
  storyboardId,
  initialStatus,
  initialShotsCompleted,
  initialShotsTotal,
}: {
  storyboardId: string;
  initialStatus: JobStatus['status'];
  initialShotsCompleted: number;
  initialShotsTotal: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<JobStatus>({
    status: initialStatus,
    shotsCompleted: initialShotsCompleted,
    shotsTotal: initialShotsTotal,
  });
  const lastCompletedRef = useRef<number>(initialShotsCompleted);

  useEffect(() => {
    if (TERMINAL.includes(state.status)) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(
          `/api/jobs/storyboard-animate/status?storyboardId=${encodeURIComponent(storyboardId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const next = (await res.json()) as JobStatus;
        if (cancelled) return;

        // If shots_completed has advanced since last tick, refresh the
        // server tree so the reel preview gets the new video URLs.
        const lastCompleted = lastCompletedRef.current;
        const nextCompleted = next.shotsCompleted ?? 0;
        if (nextCompleted > lastCompleted) {
          lastCompletedRef.current = nextCompleted;
          router.refresh();
        }
        // Terminal transition → refresh once more so the page re-renders
        // with the AnimateButton in its final state and the badge in the
        // header recomputes.
        if (
          !TERMINAL.includes(state.status) &&
          TERMINAL.includes(next.status)
        ) {
          router.refresh();
        }
        setState(next);
      } catch {
        // Network blip — try again on the next interval
      }
    }

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    // Tick immediately so the user doesn't wait POLL_INTERVAL_MS for the first update.
    void tick();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [storyboardId, state.status, router]);

  if (state.status === 'none' || state.status === 'completed') {
    return null;
  }

  const total = state.shotsTotal ?? initialShotsTotal;
  const completed = state.shotsCompleted ?? 0;
  const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;

  if (state.status === 'failed') {
    return (
      <div className="flex items-start gap-3 rounded-[12px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-[13px] text-[#fca5a5]">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Animation failed</p>
          {state.lastError ? (
            <p className="mt-1 text-[12px] leading-[1.45] text-[#fca5a5]/80">
              {state.lastError}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-[#fca5a5]/70">
            Credits for unrendered shots have been refunded. Try again when ready.
          </p>
        </div>
      </div>
    );
  }

  // pending or processing
  const isPending = state.status === 'pending';
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-[#a855f7]/30 bg-[#a855f7]/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <Loader2 size={16} className="animate-spin text-[#a855f7]" />
        <p className="flex-1 text-[13px] font-medium text-[#e9d5ff]">
          {isPending ? 'Queued — waiting for worker tick…' : `Animating shot ${completed + 1} of ${total}`}
        </p>
        <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-[#e9d5ff]/80">
          <Film size={11} />
          {completed} / {total}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[#a855f7]/20">
        <span
          className="block h-full bg-[#a855f7] transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] leading-[1.4] text-[#e9d5ff]/70">
        Each shot ≈ 60–90s via Luma Dream Machine. Completed shots appear in the reel above as they render.
      </p>
    </div>
  );
}

export function JobCompletedBadge({ shotsTotal }: { shotsTotal: number }) {
  return (
    <div className="flex items-center gap-2 rounded-[12px] border border-[#22c55e]/30 bg-[#22c55e]/10 px-4 py-3 text-[13px] text-[#86efac]">
      <CheckCircle2 size={15} />
      All {shotsTotal} shots animated. Reel preview now uses real Luma footage.
    </div>
  );
}
