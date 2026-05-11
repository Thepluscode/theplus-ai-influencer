'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { deletePost, updatePostSchedule } from '@/lib/posts';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export type ReschedState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'saved'; postId: string };

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
    const updated = await updatePostSchedule(
      parsed.data.postId,
      when,
      parsed.data.caption ?? null,
    );
    revalidatePath('/calendar');
    return { status: 'saved', postId: updated.id };
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
  await deletePost(postId);
  revalidatePath('/calendar');
}
