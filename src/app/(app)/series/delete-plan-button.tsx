'use client';

import { Trash2 } from 'lucide-react';
import { deleteContentPlanAction } from './actions';

export function DeletePlanButton({ planId }: { planId: string }) {
  return (
    <form action={deleteContentPlanAction} className="absolute right-3 top-3 z-10">
      <input type="hidden" name="planId" value={planId} />
      <button
        type="submit"
        onClick={(event) => {
          if (!window.confirm('Delete this plan?')) {
            event.preventDefault();
          }
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#262626] bg-surface-2 text-ink-muted opacity-0 transition group-hover:opacity-100 hover:border-[#ff5577]/40 hover:bg-[#ff5577]/10 hover:text-[#ff5577]"
        aria-label="Delete plan"
        title="Delete plan"
      >
        <Trash2 size={11} />
      </button>
    </form>
  );
}
