'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, CircleAlert, Send } from 'lucide-react';
import {
  setPublicReviewDecisionAction,
  type PublicReviewDecisionState,
} from '@/app/p/[token]/actions';
import { formatReviewDecision, type ReviewDecision } from '@/lib/review-approvals-schema';
import type { ReviewDecisionRow } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';

interface Props {
  token: string;
  status: ReviewDecision;
  version: number;
  decisions: ReviewDecisionRow[];
}

export function PublicPostDecisionPanel({ token, status, version, decisions }: Props) {
  const [state, formAction] = useActionState<PublicReviewDecisionState | null, FormData>(
    setPublicReviewDecisionAction,
    null,
  );

  return (
    <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
            Decision
          </p>
          <h2 className="mt-1 text-[14px] font-medium text-ink">{formatReviewDecision(status)}</h2>
        </div>
        <span
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium uppercase tracking-wider ring-1',
            status === 'approved' || status === 'final'
              ? 'bg-[#22c55e]/12 text-[#86efac] ring-[#22c55e]/30'
              : 'bg-[#ff7a3d]/12 text-[#ffb38a] ring-[#ff7a3d]/30',
          )}
        >
          {status === 'approved' || status === 'final' ? (
            <CheckCircle2 size={12} />
          ) : (
            <CircleAlert size={12} />
          )}
          V{version}
        </span>
      </div>

      <form action={formAction} className="grid gap-2">
        <input type="hidden" name="token" value={token} />
        <div className="grid grid-cols-2 gap-2">
          <label className="sr-only" htmlFor="public-decision-reviewer">
            Name
          </label>
          <input
            id="public-decision-reviewer"
            name="reviewerName"
            className="h-9 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[12px] text-ink outline-none transition placeholder:text-[#555] focus:border-[#0099ff]"
            placeholder="Name"
          />
          <label className="sr-only" htmlFor="public-decision-email">
            Email
          </label>
          <input
            id="public-decision-email"
            name="reviewerEmail"
            type="email"
            className="h-9 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[12px] text-ink outline-none transition placeholder:text-[#555] focus:border-[#0099ff]"
            placeholder="Email"
          />
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-[10px] border border-[#262626] bg-surface-2 p-1">
          {(['needs_changes', 'approved'] as const).map((decision) => (
            <label
              key={decision}
              className="has-[:checked]:bg-white has-[:checked]:text-black rounded-[8px] px-2 py-2 text-center text-[11px] font-medium text-ink-muted transition hover:text-ink"
            >
              <input
                type="radio"
                name="decision"
                value={decision}
                defaultChecked={
                  decision === status || (status === 'final' && decision === 'approved')
                }
                className="sr-only"
              />
              {formatReviewDecision(decision)}
            </label>
          ))}
        </div>

        <label className="sr-only" htmlFor="public-decision-summary">
          Decision summary
        </label>
        <textarea
          id="public-decision-summary"
          name="summary"
          rows={3}
          className="min-h-[76px] resize-none rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[12px] leading-[1.45] text-ink outline-none transition placeholder:text-[#555] focus:border-[#0099ff]"
          placeholder="Approval note or requested change..."
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

        <SubmitDecisionButton />
      </form>

      <ul className="mt-4 grid gap-2">
        {decisions.length > 0
          ? decisions.slice(0, 3).map((decision) => (
              <li
                key={decision.id}
                className="rounded-[12px] border border-[#262626] bg-surface-2 p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-ink">
                    {formatReviewDecision(decision.decision)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[#666]">
                    V{decision.version_number}
                  </span>
                </div>
                <p className="line-clamp-3 text-[12px] leading-[1.45] text-ink-muted">
                  {decision.summary}
                </p>
              </li>
            ))
          : null}
      </ul>
    </section>
  );
}

function SubmitDecisionButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] bg-white px-3 text-[12px] font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Send size={13} />
      {pending ? 'Sending...' : 'Send decision'}
    </button>
  );
}
