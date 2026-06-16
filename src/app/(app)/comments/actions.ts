'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { listAiModels } from '@/lib/ai-models';
import {
  classifyAndDraft,
  deleteComment as removeComment,
  getCommentById,
  saveDraftedComment,
  updateCommentStatus,
} from '@/lib/comments-engine';
import { consumeCredits, COSTS, refundCredits } from '@/lib/credits';
import { isDemoMode } from '@/lib/demo-mode';
import { serverEnv } from '@/lib/env';
import { getZernioClient } from '@/lib/zernio';
import { PLATFORMS } from '@/types/post';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';

export type AddCommentState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'insufficient_credits'; balance: number; required: number }
  | { status: 'saved'; id: string };

const AddCommentSchema = z.object({
  modelId: z.string().uuid().optional().or(z.literal('')),
  platform: z.enum(PLATFORMS),
  authorHandle: z.string().min(1, 'Author handle is required').max(60),
  commentText: z.string().min(1, 'Paste the comment').max(2000),
});

export async function addPastedCommentAction(
  _prev: AddCommentState | null,
  formData: FormData,
): Promise<AddCommentState> {
  const parsed = AddCommentSchema.safeParse({
    modelId: formData.get('modelId') ?? '',
    platform: formData.get('platform'),
    authorHandle: formData.get('authorHandle'),
    commentText: formData.get('commentText'),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
    };
  }
  if (isDemoMode()) {
    revalidatePath('/comments');
    return { status: 'saved', id: '00000000-0000-4000-8000-000000000599' };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);

    const consume = await consumeCredits({
      workspaceId: ws.id,
      amount: COSTS.COMMENT_REPLY_DRAFT,
      reason: 'comment_reply_draft',
      refKind: 'comment',
    });
    if (!consume.ok) {
      return {
        status: 'insufficient_credits',
        balance: consume.balance,
        required: consume.required,
      };
    }

    // Optional: thread the model's voice through the LLM if the operator
    // picked a persona. Otherwise default to a generic brand voice.
    const models = parsed.data.modelId ? await listAiModels(ws.id) : [];
    const model = parsed.data.modelId
      ? models.find((m) => m.id === parsed.data.modelId)
      : undefined;

    let draft;
    try {
      draft = await classifyAndDraft({
        commentText: parsed.data.commentText,
        personaName: model?.name ?? 'the persona',
        personaVibe: model?.wizard_input?.vibe,
      });
    } catch (err) {
      await refundCredits({
        workspaceId: ws.id,
        amount: COSTS.COMMENT_REPLY_DRAFT,
        refKind: 'comment',
      });
      throw err;
    }

    const saved = await saveDraftedComment({
      workspaceId: ws.id,
      platform: parsed.data.platform,
      authorHandle: parsed.data.authorHandle,
      commentText: parsed.data.commentText,
      classification: draft.classification,
      draftReply: draft.draftReply,
    });
    revalidatePath('/comments');
    return { status: 'saved', id: saved.id };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not triage comment.',
    };
  }
}

export async function approveCommentAction(formData: FormData): Promise<void> {
  const id = formData.get('id');
  const draftRaw = formData.get('draft');
  if (typeof id !== 'string' || !id) return;
  const draft = typeof draftRaw === 'string' ? draftRaw : undefined;
  if (isDemoMode()) {
    revalidatePath('/comments');
    return;
  }

  const comment = await getCommentById(id);
  if (!comment) return;
  const message = (draft ?? comment.draft_reply ?? '').trim();

  // Webhook-ingested comments carry Zernio provenance — post the reply back
  // to the platform. Fail loudly so a failed send never gets marked "replied".
  if (serverEnv.ZERNIO_API_KEY && comment.zernio_post_id && comment.zernio_account_id) {
    if (!message) {
      throw new Error('Write a reply before approving — empty replies are not posted.');
    }
    try {
      await getZernioClient().replyToComment({
        zernioPostId: comment.zernio_post_id,
        accountId: comment.zernio_account_id,
        message,
        commentId: comment.external_id ?? undefined,
      });
    } catch (err) {
      throw new Error(
        `Reply not posted to ${comment.platform}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await updateCommentStatus(id, 'replied', draft);
  revalidatePath('/comments');
}

export async function dismissCommentAction(formData: FormData): Promise<void> {
  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return;
  if (isDemoMode()) {
    revalidatePath('/comments');
    return;
  }
  await updateCommentStatus(id, 'dismissed');
  revalidatePath('/comments');
}

export async function hideCommentAction(formData: FormData): Promise<void> {
  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return;
  if (isDemoMode()) {
    revalidatePath('/comments');
    return;
  }
  await updateCommentStatus(id, 'hidden');
  revalidatePath('/comments');
}

export async function deleteCommentAction(formData: FormData): Promise<void> {
  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return;
  if (isDemoMode()) {
    revalidatePath('/comments');
    return;
  }
  await removeComment(id);
  revalidatePath('/comments');
}
