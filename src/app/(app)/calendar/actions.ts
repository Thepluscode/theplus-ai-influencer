'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/lib/env';
import { deletePost, getPostById, updatePostSchedule } from '@/lib/posts';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  getZernioClient,
  pickAccountsForPlatforms,
  type ZernioPlatformTarget,
} from '@/lib/zernio';

export type ReschedState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'saved'; postId: string; pushedToZernio: boolean }
  | { status: 'partial'; postId: string; warning: string };

const ReschedSchema = z.object({
  postId: z.string().uuid(),
  // datetime-local fields render as e.g. "2026-05-15T14:30" (no timezone).
  // Empty string means "unschedule and move back to drafts".
  scheduledFor: z.string(),
  caption: z.string().nullable(),
});

async function requireUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not signed in');
  }
  return user;
}

export async function reschedulePostAction(
  _prev: ReschedState | null,
  formData: FormData,
): Promise<ReschedState> {
  const parsed = ReschedSchema.safeParse({
    postId: formData.get('postId'),
    scheduledFor: formData.get('scheduledFor') ?? '',
    caption: formData.get('caption'),
  });
  if (!parsed.success) {
    return { status: 'error', error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  let when: Date | null = null;
  if (parsed.data.scheduledFor.trim()) {
    const parsedDate = new Date(parsed.data.scheduledFor);
    if (Number.isNaN(parsedDate.getTime())) {
      return { status: 'error', error: 'Could not parse scheduled date.' };
    }
    when = parsedDate;
  }

  try {
    await requireUser();
    const post = await getPostById(parsed.data.postId);
    if (!post) {
      return { status: 'error', error: 'Post not found.' };
    }

    const zernioReady = Boolean(serverEnv.ZERNIO_API_KEY);
    let zernioPostId: string | null | undefined = undefined; // undefined = leave column unchanged
    let warning: string | null = null;

    // Detach any prior Zernio post first — covers reschedule + unschedule both.
    if (post.zernio_post_id) {
      try {
        if (zernioReady) {
          await getZernioClient().deletePost(post.zernio_post_id);
        }
      } catch (err) {
        // Already-published posts cannot be deleted; that's fine.
        warning = `Could not detach previous Zernio post: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
      zernioPostId = null;
    }

    // If we're scheduling (not unscheduling) and Zernio is configured, push.
    if (when && zernioReady) {
      try {
        const zernio = getZernioClient();
        const accounts = await zernio.listAccounts();
        const { resolved, missing } = pickAccountsForPlatforms(accounts, post.platforms);
        if (resolved.length === 0) {
          warning = `No connected Zernio accounts for: ${post.platforms.join(
            ', ',
          )}. Saved locally only — connect accounts on /accounts.`;
        } else {
          const zernioPost = await zernio.createPost({
            content: parsed.data.caption ?? post.caption ?? '',
            platforms: resolved as ZernioPlatformTarget[],
            scheduledFor: when,
            mediaItems: post.variants.slice(0, 1).map((v) => ({
              type: 'image' as const,
              url: v.url,
            })),
          });
          zernioPostId = zernioPost._id;
          if (missing.length > 0) {
            warning = `Scheduled on ${resolved
              .map((r) => r.platform)
              .join(', ')}; ${missing.join(', ')} not connected on Zernio.`;
          }
        }
      } catch (err) {
        warning = `Local save succeeded; Zernio push failed: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    }

    const updated = await updatePostSchedule(parsed.data.postId, when, {
      caption: parsed.data.caption ?? null,
      zernioPostId,
    });
    revalidatePath('/calendar');

    if (warning) {
      return { status: 'partial', postId: updated.id, warning };
    }
    return { status: 'saved', postId: updated.id, pushedToZernio: Boolean(when && zernioReady) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reschedule failed';
    return { status: 'error', error: message };
  }
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const postId = formData.get('postId');
  if (typeof postId !== 'string' || !postId) {
    throw new Error('postId required');
  }
  await requireUser();

  // Try to detach from Zernio first; non-fatal if it fails (already published).
  if (serverEnv.ZERNIO_API_KEY) {
    const post = await getPostById(postId);
    if (post?.zernio_post_id) {
      try {
        await getZernioClient().deletePost(post.zernio_post_id);
      } catch {
        // Ignore — locally deleting either way.
      }
    }
  }

  await deletePost(postId);
  revalidatePath('/calendar');
}
