'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { listAiModels } from '@/lib/ai-models';
import { consumeCredits, COSTS, refundCredits } from '@/lib/credits';
import { publicEnv, serverEnv } from '@/lib/env';
import { generateStoryboardScript, renderShots, type RenderedShot } from '@/lib/storyboard';
import { enqueueAnimationJob, hasActiveJobForStoryboard } from '@/lib/storyboard-jobs';
import { createStoryboardReviewComment, updateReviewCommentStatus } from '@/lib/review-comments';
import { recordStoryboardReviewDecision } from '@/lib/review-approvals';
import { parseReviewDecisionFormData } from '@/lib/review-approvals-schema';
import { parseReviewCommentFormData } from '@/lib/review-comments-schema';
import {
  deleteStoryboard as removeStoryboard,
  getStoryboard,
  saveStoryboard,
} from '@/lib/storyboards';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { dispatchWorkspaceWebhookEvent } from '@/lib/workspace-webhooks';
import { FORMATS } from '@/types/post';

export type StoryboardState =
  | { status: 'idle' }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> }
  | { status: 'insufficient_credits'; balance: number; required: number };

const StoryboardFormSchema = z.object({
  modelId: z.string().uuid('Pick a saved influencer'),
  name: z.string().min(1, 'Storyboard name required').max(120),
  brief: z.string().min(1, 'Describe the reel').max(800),
  format: z.enum(FORMATS).default('portrait'),
  shotCount: z.coerce.number().int().min(3).max(6).default(4),
});

export type ReviewCommentState =
  | { status: 'success'; message: string }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> };

export type ReviewDecisionState =
  | { status: 'success'; message: string }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> };

function readForm(formData: FormData): Record<string, unknown> {
  return {
    modelId: formData.get('modelId'),
    name: formData.get('name'),
    brief: formData.get('brief'),
    format: formData.get('format'),
    shotCount: formData.get('shotCount'),
  };
}

export async function generateStoryboardAction(
  _prev: StoryboardState | null,
  formData: FormData,
): Promise<StoryboardState> {
  const parsed = StoryboardFormSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      status: 'error',
      error: 'Please fix the highlighted fields.',
      fieldErrors,
    };
  }

  let newId: string;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);
    const models = await listAiModels(ws.id);
    const model = models.find((m) => m.id === parsed.data.modelId);
    if (!model) {
      return {
        status: 'error',
        error: 'Model not found.',
        fieldErrors: { modelId: 'Pick an influencer from your roster.' },
      };
    }

    // Total cost = script LLM + per-shot Luma renders. Charge up front
    // so two simultaneous Generate clicks can't double-spend.
    const totalCost =
      COSTS.STORYBOARD_GENERATION + COSTS.STORYBOARD_SHOT_RENDER * parsed.data.shotCount;
    const consume = await consumeCredits({
      workspaceId: ws.id,
      amount: totalCost,
      reason: 'storyboard_generation',
      refKind: 'storyboard',
    });
    if (!consume.ok) {
      return {
        status: 'insufficient_credits',
        balance: consume.balance,
        required: consume.required,
      };
    }

    let summary = '';
    let shots;
    try {
      const script = await generateStoryboardScript({
        brief: parsed.data.brief,
        format: parsed.data.format,
        model,
        shotCount: parsed.data.shotCount,
      });
      summary = script.summary;
      shots = await renderShots({
        script,
        model,
        format: parsed.data.format,
      });
    } catch (err) {
      await refundCredits({
        workspaceId: ws.id,
        amount: totalCost,
        refKind: 'storyboard',
      });
      throw err;
    }

    const saved = await saveStoryboard({
      workspaceId: ws.id,
      modelId: model.id,
      name: parsed.data.name,
      brief: parsed.data.brief,
      format: parsed.data.format,
      summary: summary || null,
      shots,
    });
    newId = saved.id;
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Storyboard generation failed.',
    };
  }

  revalidatePath('/storyboard');
  redirect(`/storyboard/${newId}`);
}

export async function deleteStoryboardAction(formData: FormData): Promise<void> {
  const id = formData.get('storyboardId');
  if (typeof id !== 'string' || !id) {
    throw new Error('storyboardId required');
  }
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in.');
    await getOrCreateCurrentWorkspace(user);
    await removeStoryboard(id);
    revalidatePath('/storyboard');
  } catch (err) {
    redirect(
      `/storyboard?error=${encodeURIComponent(err instanceof Error ? err.message : 'delete failed')}`,
    );
  }
  redirect('/storyboard');
}

export async function addStoryboardReviewCommentAction(
  _prev: ReviewCommentState | null,
  formData: FormData,
): Promise<ReviewCommentState> {
  const storyboardId = formData.get('storyboardId');
  if (typeof storyboardId !== 'string' || !z.string().uuid().safeParse(storyboardId).success) {
    return { status: 'error', error: 'Storyboard id is invalid.' };
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
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);

    const sb = await getStoryboard(storyboardId);
    if (!sb || sb.workspace_id !== ws.id) {
      return { status: 'error', error: 'Storyboard not found.' };
    }

    const shots = (Array.isArray(sb.shots) ? sb.shots : []) as RenderedShot[];
    const shotIndex = parsed.data.shotIndex;
    if (shotIndex !== null && shots.length > 0 && !shots.some((shot) => shot.index === shotIndex)) {
      return {
        status: 'error',
        error: 'Selected shot is no longer available.',
        fieldErrors: { shotIndex: 'Pick an existing shot.' },
      };
    }

    const comment = await createStoryboardReviewComment({
      workspaceId: ws.id,
      storyboardId,
      comment: parsed.data,
    });
    await dispatchWorkspaceWebhookEvent({
      workspaceId: ws.id,
      event: 'comment.created',
      payload: {
        subjectType: 'storyboard',
        storyboardId,
        commentId: comment.id,
        authorName: comment.author_name,
        shotIndex: comment.shot_index,
      },
    }).catch((err) => {
      console.error('Failed to dispatch storyboard comment.created webhook', {
        workspaceId: ws.id,
        storyboardId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    revalidatePath(`/storyboard/${storyboardId}`);
    return { status: 'success', message: 'Review comment added.' };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to add review comment.',
    };
  }
}

export async function setStoryboardReviewCommentStatusAction(formData: FormData): Promise<void> {
  const commentId = formData.get('commentId');
  const storyboardId = formData.get('storyboardId');
  const status = formData.get('status');
  const parsed = z
    .object({
      commentId: z.string().uuid(),
      storyboardId: z.string().uuid(),
      status: z.enum(['open', 'resolved']),
    })
    .safeParse({ commentId, storyboardId, status });

  if (!parsed.success) return;

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const ws = await getOrCreateCurrentWorkspace(user);
    const sb = await getStoryboard(parsed.data.storyboardId);
    if (!sb || sb.workspace_id !== ws.id) return;

    await updateReviewCommentStatus({
      id: parsed.data.commentId,
      workspaceId: ws.id,
      status: parsed.data.status,
    });
    revalidatePath(`/storyboard/${parsed.data.storyboardId}`);
  } catch (err) {
    console.error('Failed to update storyboard review comment status', err);
    return;
  }
}

export async function setStoryboardReviewDecisionAction(
  _prev: ReviewDecisionState | null,
  formData: FormData,
): Promise<ReviewDecisionState> {
  const storyboardId = formData.get('storyboardId');
  if (typeof storyboardId !== 'string' || !z.string().uuid().safeParse(storyboardId).success) {
    return { status: 'error', error: 'Storyboard id is invalid.' };
  }

  const parsed = parseReviewDecisionFormData(formData);
  if (!parsed.ok) {
    return {
      status: 'error',
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);

    const sb = await getStoryboard(storyboardId);
    if (!sb || sb.workspace_id !== ws.id) {
      return { status: 'error', error: 'Storyboard not found.' };
    }

    const decision = await recordStoryboardReviewDecision({
      workspaceId: ws.id,
      storyboardId,
      decision: parsed.data,
    });
    if (parsed.data.decision === 'approved' || parsed.data.decision === 'final') {
      await dispatchWorkspaceWebhookEvent({
        workspaceId: ws.id,
        event: 'review.approved',
        payload: {
          subjectType: 'storyboard',
          storyboardId,
          decisionId: decision.id,
          reviewerName: decision.reviewer_name,
          versionNumber: decision.version_number,
          decision: decision.decision,
        },
      }).catch((err) => {
        console.error('Failed to dispatch storyboard review.approved webhook', {
          workspaceId: ws.id,
          storyboardId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
    revalidatePath(`/storyboard/${storyboardId}`);
    revalidatePath('/storyboard');
    return { status: 'success', message: 'Review decision recorded.' };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to record review decision.',
    };
  }
}

// ---------------------------------------------------------------------------
// Animate to video — Luma Dream Machine (queued)
// ---------------------------------------------------------------------------
// This action no longer blocks on Luma. Instead it:
//   1. Validates ownership + shot count
//   2. Charges credits for the pending shots up front
//   3. Inserts a row into storyboard_render_jobs
//   4. Fires (and does NOT await) the worker route so the first shot
//      starts immediately during dev / single-instance deploys
//   5. Returns `queued` so the UI starts polling /api/jobs/.../status
//
// A cron-driven hit of /api/jobs/storyboard-animate keeps draining the
// queue for subsequent shots. Failure handling (refund + mark failed)
// happens inside the worker — the server action's job is just to put
// money on the counter and walk away.

export type AnimateState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'insufficient_credits'; balance: number; required: number }
  | { status: 'already_animated' }
  | { status: 'queued'; jobId: string; shotsToAnimate: number };

export async function animateStoryboardAction(
  _prev: AnimateState | null,
  formData: FormData,
): Promise<AnimateState> {
  const id = formData.get('storyboardId');
  if (typeof id !== 'string' || !id) {
    return { status: 'error', error: 'storyboardId required.' };
  }
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);

    const sb = await getStoryboard(id);
    if (!sb || sb.workspace_id !== ws.id) {
      return { status: 'error', error: 'Storyboard not found.' };
    }
    if (sb.review_status !== 'approved' && sb.review_status !== 'final') {
      return {
        status: 'error',
        error: 'Approve the storyboard before starting a paid video render.',
      };
    }
    const shots = (Array.isArray(sb.shots) ? sb.shots : []) as RenderedShot[];
    if (shots.length === 0) {
      return { status: 'error', error: 'Storyboard has no shots to animate.' };
    }
    const pending = shots.filter((s) => !s.videoUrl);
    if (pending.length === 0) {
      return { status: 'already_animated' };
    }

    // Refuse to double-enqueue. If a previous job is still draining,
    // user should wait for it to finish or fail before retrying.
    if (await hasActiveJobForStoryboard(id)) {
      return {
        status: 'error',
        error: 'A render is already in progress for this storyboard.',
      };
    }

    const costPerShot = COSTS.STORYBOARD_VIDEO_RENDER;
    const cost = costPerShot * pending.length;

    const consume = await consumeCredits({
      workspaceId: ws.id,
      amount: cost,
      reason: 'storyboard_video_render',
      refKind: 'storyboard',
      refId: id,
    });
    if (!consume.ok) {
      return {
        status: 'insufficient_credits',
        balance: consume.balance,
        required: consume.required,
      };
    }

    let job;
    try {
      job = await enqueueAnimationJob({
        workspaceId: ws.id,
        storyboardId: id,
        shotsTotal: pending.length,
        costPerShot,
        costChargedTotal: cost,
      });
    } catch (err) {
      // Refund immediately — the credits were debited but the job row
      // never landed, so there's no way for the worker to ever process
      // (or refund) them.
      await refundCredits({
        workspaceId: ws.id,
        amount: cost,
        refKind: 'storyboard',
        refId: id,
      });
      throw err;
    }

    // Fire-and-forget kick so the first shot starts even if cron isn't
    // wired up yet (dev ergonomics + small deploys). Don't await — we
    // want the user to see the queued UI immediately.
    void kickWorkerOnce();

    revalidatePath(`/storyboard/${id}`);
    revalidatePath('/storyboard');
    return {
      status: 'queued',
      jobId: job.id,
      shotsToAnimate: pending.length,
    };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Animation failed.',
    };
  }
}

/**
 * Best-effort POST to the worker route so the queue starts draining the
 * moment a job is enqueued. Errors are swallowed: cron is the
 * authoritative drain mechanism, this is just a latency optimization.
 */
async function kickWorkerOnce(): Promise<void> {
  const token = serverEnv.CRON_SECRET ?? serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) return;
  const url = `${publicEnv.NEXT_PUBLIC_APP_URL}/api/jobs/storyboard-animate`;
  try {
    // 5s connect timeout — the worker itself may run for up to 120s,
    // but we shouldn't block the server action on it. We're firing
    // this and forgetting it; the abort just protects against a stuck
    // socket holding the function alive.
    void fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {});
  } catch {
    // ignore — cron will pick this up
  }
}
