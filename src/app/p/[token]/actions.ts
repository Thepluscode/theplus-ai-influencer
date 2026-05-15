'use server';

import { revalidatePath } from 'next/cache';
import { getPostByShareToken } from '@/lib/posts';
import { recordPublicPostReviewDecision } from '@/lib/review-approvals';
import { parseReviewDecisionFormData } from '@/lib/review-approvals-schema';
import { createPublicPostReviewComment } from '@/lib/review-comments';
import { parseReviewCommentFormData } from '@/lib/review-comments-schema';
import { dispatchWorkspaceWebhookEvent } from '@/lib/workspace-webhooks';

export type PublicReviewCommentState =
  | { status: 'success'; message: string }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> };

export type PublicReviewDecisionState =
  | { status: 'success'; message: string }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addPublicReviewCommentAction(
  _prev: PublicReviewCommentState | null,
  formData: FormData,
): Promise<PublicReviewCommentState> {
  const token = formData.get('token');
  if (typeof token !== 'string' || !UUID_RE.test(token)) {
    return { status: 'error', error: 'Review link is invalid.' };
  }

  const parsed = parseReviewCommentFormData(formData);
  if (!parsed.ok) {
    return {
      status: 'error',
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    const post = await getPostByShareToken(token);
    if (!post) {
      return { status: 'error', error: 'Review link is no longer active.' };
    }

    const variantIndex = parsed.data.variantIndex;
    if (
      variantIndex !== null &&
      post.variants.length > 0 &&
      (variantIndex < 0 || variantIndex >= post.variants.length)
    ) {
      return {
        status: 'error',
        error: 'Selected variant is no longer available.',
        fieldErrors: { variantIndex: 'Pick an existing variant.' },
      };
    }

    const comment = await createPublicPostReviewComment({
      workspaceId: post.workspace_id,
      postId: post.id,
      comment: parsed.data,
    });
    await dispatchWorkspaceWebhookEvent({
      workspaceId: post.workspace_id,
      event: 'comment.created',
      payload: {
        subjectType: 'post',
        postId: post.id,
        commentId: comment.id,
        authorName: comment.author_name,
        variantIndex: comment.variant_index,
      },
    }).catch((err) => {
      console.error('Failed to dispatch comment.created webhook', {
        workspaceId: post.workspace_id,
        postId: post.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    revalidatePath(`/p/${token}`);
    return { status: 'success', message: 'Review comment sent.' };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to send review comment.',
    };
  }
}

export async function setPublicReviewDecisionAction(
  _prev: PublicReviewDecisionState | null,
  formData: FormData,
): Promise<PublicReviewDecisionState> {
  const token = formData.get('token');
  if (typeof token !== 'string' || !UUID_RE.test(token)) {
    return { status: 'error', error: 'Review link is invalid.' };
  }

  const parsed = parseReviewDecisionFormData(formData);
  if (!parsed.ok) {
    return {
      status: 'error',
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }
  if (parsed.data.decision === 'final') {
    return { status: 'error', error: 'Only the workspace owner can mark work final.' };
  }

  try {
    const post = await getPostByShareToken(token);
    if (!post) {
      return { status: 'error', error: 'Review link is no longer active.' };
    }

    const decision = await recordPublicPostReviewDecision({
      workspaceId: post.workspace_id,
      postId: post.id,
      decision: parsed.data,
    });
    if (parsed.data.decision === 'approved') {
      await dispatchWorkspaceWebhookEvent({
        workspaceId: post.workspace_id,
        event: 'review.approved',
        payload: {
          subjectType: 'post',
          postId: post.id,
          decisionId: decision.id,
          reviewerName: decision.reviewer_name,
          versionNumber: decision.version_number,
        },
      }).catch((err) => {
        console.error('Failed to dispatch review.approved webhook', {
          workspaceId: post.workspace_id,
          postId: post.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
    revalidatePath(`/p/${token}`);
    return { status: 'success', message: 'Review decision sent.' };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to send review decision.',
    };
  }
}
