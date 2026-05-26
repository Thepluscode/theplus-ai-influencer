'use client';

import { Trash2 } from 'lucide-react';
import { deleteStoryboardAction } from './actions';

export function DeleteStoryboardButton({ storyboardId }: { storyboardId: string }) {
  return (
    <form action={deleteStoryboardAction} className="absolute right-2 top-2 z-10">
      <input type="hidden" name="storyboardId" value={storyboardId} />
      <button
        type="submit"
        onClick={(event) => {
          if (!window.confirm('Delete this storyboard?')) {
            event.preventDefault();
          }
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#262626] bg-surface-2 text-ink-muted opacity-0 transition group-hover:opacity-100 hover:border-[#ff5577]/40 hover:bg-[#ff5577]/10 hover:text-[#ff5577]"
        aria-label="Delete storyboard"
        title="Delete storyboard"
      >
        <Trash2 size={11} />
      </button>
    </form>
  );
}
