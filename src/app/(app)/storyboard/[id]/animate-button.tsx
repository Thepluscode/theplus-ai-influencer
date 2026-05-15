'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Film, RotateCw, Lock } from 'lucide-react';
import { animateStoryboardAction, type AnimateState } from '../actions';

/**
 * Enqueue-only client wrapper around animateStoryboardAction. The
 * heavy lifting now happens on a Postgres-backed worker queue (see
 * /api/jobs/storyboard-animate), so this component is just responsible
 * for kicking off a job and surfacing acceptance/error feedback.
 *
 * Live progress (shot 1 of 4 animating, etc.) is rendered by the
 * sibling <JobStatusPoller/> component which polls /status.
 */
export function AnimateButton({
  storyboardId,
  pendingShotCount,
  totalShots,
  allAnimated,
  jobInFlight,
  reviewApproved,
  costPerShot,
}: {
  storyboardId: string;
  pendingShotCount: number;
  totalShots: number;
  allAnimated: boolean;
  jobInFlight: boolean;
  reviewApproved: boolean;
  costPerShot: number;
}) {
  const [state, formAction] = useActionState<AnimateState | null, FormData>(
    animateStoryboardAction,
    { status: 'idle' },
  );

  const required = pendingShotCount * costPerShot;
  // While the worker is draining a job, hide the button entirely —
  // the JobStatusPoller is already showing progress and a second
  // enqueue would just error.
  const disableAll = allAnimated || jobInFlight || !reviewApproved;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="storyboardId" value={storyboardId} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          allAnimated={allAnimated}
          jobInFlight={jobInFlight}
          reviewApproved={reviewApproved}
          disabled={disableAll}
          pendingShotCount={pendingShotCount}
          totalShots={totalShots}
          required={required}
        />
        <p className="text-[11px] leading-[1.45] text-ink-muted">
          {allAnimated
            ? 'All shots animated. Each preview now uses real Luma footage.'
            : jobInFlight
              ? 'Render in flight — watch progress above.'
              : !reviewApproved
                ? 'Approve the storyboard before starting a paid Luma video render.'
                : `Queues ${pendingShotCount} ${
                    pendingShotCount === 1 ? 'shot' : 'shots'
                  } for Luma Dream Machine. Each shot ≈ 60–90s. The page updates as shots come back.`}
        </p>
      </div>

      {state?.status === 'error' ? (
        <p className="rounded-[10px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-[12px] text-[#fca5a5]">
          {state.error}
        </p>
      ) : null}
      {state?.status === 'insufficient_credits' ? (
        <p className="rounded-[10px] border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2 text-[12px] text-[#fcd34d]">
          Not enough credits — need {state.required}, balance {state.balance}.
        </p>
      ) : null}
      {state?.status === 'queued' ? (
        <p className="rounded-[10px] border border-[#a855f7]/30 bg-[#a855f7]/10 px-3 py-2 text-[12px] text-[#e9d5ff]">
          Queued — {state.shotsToAnimate} {state.shotsToAnimate === 1 ? 'shot' : 'shots'} in the
          render pipeline.
        </p>
      ) : null}
    </form>
  );
}

function SubmitButton({
  allAnimated,
  jobInFlight,
  reviewApproved,
  disabled,
  pendingShotCount,
  totalShots,
  required,
}: {
  allAnimated: boolean;
  jobInFlight: boolean;
  reviewApproved: boolean;
  disabled: boolean;
  pendingShotCount: number;
  totalShots: number;
  required: number;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  return (
    <button
      type="submit"
      disabled={isDisabled}
      className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#a855f7] px-4 text-[13px] font-medium text-white shadow-[0_8px_24px_-6px_rgba(168,85,247,0.45)] transition hover:bg-[#b366ff] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Queuing…
        </>
      ) : allAnimated ? (
        <>
          <Film size={14} />
          All {totalShots} shots animated
        </>
      ) : jobInFlight ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Rendering…
        </>
      ) : !reviewApproved ? (
        <>
          <Lock size={14} />
          Approval required
        </>
      ) : pendingShotCount < totalShots ? (
        <>
          <RotateCw size={14} />
          Animate {pendingShotCount} missing · {required} credits
        </>
      ) : (
        <>
          <Film size={14} />
          Animate to video · {required} credits
        </>
      )}
    </button>
  );
}
