'use client';

import { useState } from 'react';
import { PostChipButton, PostDetailsModal } from './post-details-modal';
import type { PostRow } from '@/lib/supabase/types';
import type { Platform } from '@/types/post';

interface Props {
  posts: PostRow[];
  /** Connected platforms for the active workspace — used by the modal's
   *  Connections-required warning. */
  connectedPlatforms: Platform[];
  /** Map of ai_model id → display name. Optional — the modal falls back
   *  gracefully when not provided. */
  modelNamesById?: Record<string, string>;
  saveDisabledReason?: string | null;
}

/**
 * Renders a vertical list of post chips and owns the modal lifecycle.
 * Drop this anywhere a list of posts needs to be openable as full
 * details. Manages the single modal instance internally so callers don't
 * need to wire state.
 */
export function PostsRail({
  posts,
  connectedPlatforms,
  modelNamesById,
  saveDisabledReason,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? (posts.find((p) => p.id === activeId) ?? null) : null;

  return (
    <>
      <ul className="flex flex-col gap-2">
        {posts.map((p) => (
          <li key={p.id}>
            <PostChipButton post={p} onClick={() => setActiveId(p.id)} />
          </li>
        ))}
      </ul>
      <PostDetailsModal
        post={active}
        connectedPlatforms={connectedPlatforms}
        modelName={active?.model_id ? modelNamesById?.[active.model_id] : null}
        saveDisabledReason={saveDisabledReason}
        onClose={() => setActiveId(null)}
      />
    </>
  );
}
