'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/lib/env';
import {
  buildCarouselCalendarDraft,
  buildCarouselAssetBrief,
  getCarouselAssetTargets,
  getReadyCarouselVariants,
  mergeCarouselDraftPost,
  mergeCarouselAssetResults,
  mergeCarouselReviewLink,
  mergeCarouselScheduledPost,
  type CarouselAssetMode,
  type CarouselAssetResult,
} from '@/lib/carousel-assets';
import { listAiModels } from '@/lib/ai-models';
import { getContentPlan, updateContentPlanItems } from '@/lib/content-plans';
import { consumeCredits, COSTS, refundCredits } from '@/lib/credits';
import { generatePostVariants } from '@/lib/luma-post';
import { enablePostSharing, getPostById, saveDraftPost, updatePostSchedule } from '@/lib/posts';
import { describeSafetyBlock, runPublishBrandSafetyGate } from '@/lib/publish-safety';
import type { PlanItem } from '@/lib/series-planner';
import type { PostRow } from '@/lib/supabase/types';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { dispatchWorkspaceWebhookEvent } from '@/lib/workspace-webhooks';
import {
  getDefaultZernioProfileId,
  getZernioClient,
  pickAccountsForPlatforms,
  type ZernioPlatformTarget,
} from '@/lib/zernio';

export type CarouselAssetsState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'insufficient_credits'; balance: number; required: number }
  | { status: 'success'; generated: number; failed: number };

export type CalendarDraftState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'saved'; postId: string; reused: boolean };

export type RecommendedScheduleState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | {
      status: 'scheduled';
      postId: string;
      scheduledFor: string;
      pushedToZernio: boolean;
      reused: boolean;
    }
  | { status: 'partial'; postId: string; scheduledFor: string; warning: string };

export type ReviewLinkState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'ready'; postId: string; token: string; reused: boolean };

const GenerateCarouselAssetsSchema = z.object({
  planId: z.string().uuid(),
  itemIndex: z.coerce.number().int().min(0),
  mode: z.enum(['missing', 'regenerate']).default('missing'),
});

const CreateCalendarDraftSchema = z.object({
  planId: z.string().uuid(),
  itemIndex: z.coerce.number().int().min(0),
});

export async function generateCarouselAssetsAction(
  _prev: CarouselAssetsState | null,
  formData: FormData,
): Promise<CarouselAssetsState> {
  const parsed = GenerateCarouselAssetsSchema.safeParse({
    planId: formData.get('planId'),
    itemIndex: formData.get('itemIndex'),
    mode: formData.get('mode') ?? 'missing',
  });
  if (!parsed.success) {
    return { status: 'error', error: 'Invalid carousel asset request.' };
  }

  const { planId, itemIndex, mode } = parsed.data;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };

    const ws = await getOrCreateCurrentWorkspace(user);
    const plan = await getContentPlan(planId);
    if (!plan || plan.workspace_id !== ws.id) {
      return { status: 'error', error: 'Content plan not found.' };
    }
    if (!plan.model_id) {
      return { status: 'error', error: 'This content plan no longer has a source AI model.' };
    }

    const items = (Array.isArray(plan.items) ? plan.items : []) as PlanItem[];
    const item = items[itemIndex];
    if (!item?.contentPackage) {
      return { status: 'error', error: 'Content package not found for this plan item.' };
    }

    const slides = item.contentPackage.carouselSlides;
    const targets = getCarouselAssetTargets(slides, mode as CarouselAssetMode);
    if (targets.length === 0) {
      return { status: 'success', generated: 0, failed: 0 };
    }

    const models = await listAiModels(ws.id);
    const model = models.find((candidate) => candidate.id === plan.model_id);
    if (!model) {
      return { status: 'error', error: 'Source AI model not found in this workspace.' };
    }

    const briefs = targets.map((slideIndex) =>
      buildCarouselAssetBrief({
        modelId: model.id,
        item,
        slide: slides[slideIndex],
        slideIndex,
      }),
    );
    const totalCredits = COSTS.POST_VARIANT_RENDER * targets.length;
    const consume = await consumeCredits({
      workspaceId: ws.id,
      amount: totalCredits,
      reason: 'post_variant_render',
      refKind: 'content_plan_carousel',
      refId: `${plan.id}:${itemIndex}`,
    });
    if (!consume.ok) {
      return {
        status: 'insufficient_credits',
        balance: consume.balance,
        required: consume.required,
      };
    }

    const results = await Promise.all(
      briefs.map(async (brief, index): Promise<CarouselAssetResult> => {
        const slideIndex = targets[index];
        try {
          const [variant] = await generatePostVariants(brief, model, 1);
          if (!variant) {
            throw new Error('No image returned from Luma.');
          }
          return {
            status: 'ready',
            slideIndex,
            url: variant.url,
            generationId: variant.generationId,
            generatedAt: variant.generatedAt,
          };
        } catch (err) {
          return {
            status: 'failed',
            slideIndex,
            error: err instanceof Error ? err.message : 'Image generation failed.',
            attemptedAt: new Date().toISOString(),
          };
        }
      }),
    );

    const nextItems = mergeCarouselAssetResults(items, itemIndex, results);
    try {
      await updateContentPlanItems(plan.id, nextItems);
    } catch (err) {
      await refundCredits({
        workspaceId: ws.id,
        amount: totalCredits,
        refKind: 'content_plan_carousel',
        refId: `${plan.id}:${itemIndex}:save_failed`,
      });
      return {
        status: 'error',
        error: `Generated assets but could not save them, so credits were refunded: ${
          err instanceof Error ? err.message : 'save failed'
        }`,
      };
    }

    const failed = results.filter((result) => result.status === 'failed').length;
    if (failed > 0) {
      await refundCredits({
        workspaceId: ws.id,
        amount: COSTS.POST_VARIANT_RENDER * failed,
        refKind: 'content_plan_carousel',
        refId: `${plan.id}:${itemIndex}:failed_slides`,
      });
    }

    revalidatePath(`/series/${plan.id}`);
    revalidatePath('/series');
    return { status: 'success', generated: results.length - failed, failed };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Carousel asset generation failed.',
    };
  }
}

export async function createCarouselCalendarDraftAction(
  _prev: CalendarDraftState | null,
  formData: FormData,
): Promise<CalendarDraftState> {
  const parsed = CreateCalendarDraftSchema.safeParse({
    planId: formData.get('planId'),
    itemIndex: formData.get('itemIndex'),
  });
  if (!parsed.success) {
    return { status: 'error', error: 'Invalid calendar draft request.' };
  }

  const { planId, itemIndex } = parsed.data;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };

    const ws = await getOrCreateCurrentWorkspace(user);
    const plan = await getContentPlan(planId);
    if (!plan || plan.workspace_id !== ws.id) {
      return { status: 'error', error: 'Content plan not found.' };
    }
    if (!plan.model_id) {
      return { status: 'error', error: 'This content plan no longer has a source AI model.' };
    }

    const items = (Array.isArray(plan.items) ? plan.items : []) as PlanItem[];
    const item = items[itemIndex];
    if (!item?.contentPackage) {
      return { status: 'error', error: 'Content package not found for this plan item.' };
    }

    const existingPostId = item.contentPackage.calendarDraft?.postId;
    if (existingPostId) {
      const existing = await getPostById(existingPostId);
      if (existing && existing.workspace_id === ws.id) {
        revalidatePath('/calendar');
        return { status: 'saved', postId: existing.id, reused: true };
      }
    }

    const variants = getReadyCarouselVariants(item.contentPackage.carouselSlides);
    if (variants.length === 0) {
      return {
        status: 'error',
        error: 'Generate at least one carousel asset before creating a calendar draft.',
      };
    }

    const { brief, caption } = buildCarouselCalendarDraft({
      modelId: plan.model_id,
      item,
    });
    const draft = await saveDraftPost({
      workspaceId: ws.id,
      brief,
      variants,
      caption,
    });

    const nextItems = mergeCarouselDraftPost(items, itemIndex, {
      postId: draft.id,
      createdAt: new Date().toISOString(),
    });
    await updateContentPlanItems(plan.id, nextItems);

    revalidatePath(`/series/${plan.id}`);
    revalidatePath('/series');
    revalidatePath('/calendar');
    revalidatePath('/dashboard');
    revalidatePath('/studio');
    return { status: 'saved', postId: draft.id, reused: false };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Calendar draft creation failed.',
    };
  }
}

export async function scheduleCarouselRecommendedSlotAction(
  _prev: RecommendedScheduleState | null,
  formData: FormData,
): Promise<RecommendedScheduleState> {
  const parsed = CreateCalendarDraftSchema.safeParse({
    planId: formData.get('planId'),
    itemIndex: formData.get('itemIndex'),
  });
  if (!parsed.success) {
    return { status: 'error', error: 'Invalid schedule request.' };
  }

  const { planId, itemIndex } = parsed.data;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };

    const ws = await getOrCreateCurrentWorkspace(user);
    const plan = await getContentPlan(planId);
    if (!plan || plan.workspace_id !== ws.id) {
      return { status: 'error', error: 'Content plan not found.' };
    }
    if (!plan.model_id) {
      return { status: 'error', error: 'This content plan no longer has a source AI model.' };
    }

    const items = (Array.isArray(plan.items) ? plan.items : []) as PlanItem[];
    const item = items[itemIndex];
    if (!item?.contentPackage) {
      return { status: 'error', error: 'Content package not found for this plan item.' };
    }

    const scheduledFor = new Date(item.scheduledAt);
    if (Number.isNaN(scheduledFor.getTime())) {
      return { status: 'error', error: 'This package does not have a valid recommended slot.' };
    }
    const scheduledIso = scheduledFor.toISOString();

    const recordedScheduledPostId = item.contentPackage.scheduledPost?.postId;
    if (recordedScheduledPostId) {
      const existing = await getPostById(recordedScheduledPostId);
      if (existing?.workspace_id === ws.id && existing.scheduled_for) {
        revalidatePath('/calendar');
        return {
          status: 'scheduled',
          postId: existing.id,
          scheduledFor: existing.scheduled_for,
          pushedToZernio: Boolean(existing.zernio_post_id),
          reused: true,
        };
      }
    }

    const { post, created } = await getOrCreatePackagePost({
      workspaceId: ws.id,
      modelId: plan.model_id,
      item,
    });

    const caption = post.caption ?? item.contentPackage.linkedinPost ?? item.hook;

    // Brand-safety gate — before any detach/schedule, only when this will
    // publish. Fail-closed: a block/error returns without scheduling so the
    // operator can fix the package and retry (the draft post is reused).
    let safetyNote: string | null = null;
    if (serverEnv.ZERNIO_API_KEY && post.platforms.length > 0) {
      const gate = await runPublishBrandSafetyGate({
        workspaceId: ws.id,
        postId: post.id,
        caption,
        imageUrl: post.variants[0]?.url ?? null,
        platforms: post.platforms,
      });
      if (!gate.ok) {
        if (gate.reason === 'insufficient_credits') {
          return {
            status: 'error',
            error: `Not enough credits for the brand-safety check — need ${gate.required}, you have ${gate.balance}. Top up to publish.`,
          };
        }
        if (gate.reason === 'blocked') {
          return {
            status: 'error',
            error: `Brand safety blocked this package: ${describeSafetyBlock(gate.summary, gate.issues)}`,
          };
        }
        return {
          status: 'error',
          error: `Brand-safety check failed, so nothing was published: ${gate.error}`,
        };
      }
      safetyNote = gate.note;
    }

    const zernioPostId: string | null | undefined = post.zernio_post_id ? null : undefined;
    let warning: string | null = null;
    if (post.zernio_post_id && serverEnv.ZERNIO_API_KEY) {
      try {
        await getZernioClient().deletePost(post.zernio_post_id);
      } catch (err) {
        warning = `Could not detach previous Zernio post: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    }

    const locallyScheduled = await updatePostSchedule(post.id, scheduledFor, {
      caption,
      zernioPostId,
    });

    let pushedToZernio = false;
    if (!serverEnv.ZERNIO_API_KEY) {
      warning = warning ?? 'ZERNIO_API_KEY not configured — scheduled locally only.';
    } else if (locallyScheduled.platforms.length === 0) {
      warning = warning ?? 'No platforms selected — scheduled locally only.';
    } else {
      try {
        const profileId = await getDefaultZernioProfileId();
        const zernio = getZernioClient();
        const accounts = await zernio.listAccounts(profileId);
        const { resolved, missing } = pickAccountsForPlatforms(
          accounts,
          locallyScheduled.platforms,
        );
        if (resolved.length === 0) {
          warning = `No connected Zernio accounts for: ${locallyScheduled.platforms.join(
            ', ',
          )}. Scheduled locally only.`;
        } else {
          const zernioPost = await zernio.createPost({
            content: caption,
            platforms: resolved as ZernioPlatformTarget[],
            scheduledFor,
            profileId,
            mediaItems: locallyScheduled.variants.slice(0, 1).map((variant) => ({
              type: 'image' as const,
              url: variant.url,
            })),
          });
          try {
            await updatePostSchedule(locallyScheduled.id, scheduledFor, {
              caption,
              zernioPostId: zernioPost._id,
            });
            pushedToZernio = true;
            if (missing.length > 0) {
              warning = `Scheduled on ${resolved
                .map((target) => target.platform)
                .join(', ')}; ${missing.join(', ')} not connected on Zernio.`;
            }
          } catch (dbErr) {
            const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
            try {
              await zernio.deletePost(zernioPost._id);
              warning = `Scheduled locally, but could not record Zernio id, so the remote post was rolled back. (${dbMsg})`;
            } catch (rollbackErr) {
              const rbMsg =
                rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
              warning = `Scheduled locally and pushed to Zernio (${zernioPost._id}), but local Zernio tracking failed and rollback failed. Check /accounts before retrying. (db: ${dbMsg}; rollback: ${rbMsg})`;
            }
          }
        }
      } catch (err) {
        warning = `Scheduled locally; Zernio push failed: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    }

    const nextItems = mergeCarouselScheduledPost(items, itemIndex, {
      postId: locallyScheduled.id,
      scheduledFor: scheduledIso,
      pushedToZernio,
      updatedAt: new Date().toISOString(),
    });
    try {
      await updateContentPlanItems(plan.id, nextItems);
    } catch (err) {
      warning = `Scheduled post, but could not update the content package status: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }

    revalidateContentPlanSurfaces(plan.id);
    const webhookSummary = await dispatchWorkspaceWebhookEvent({
      workspaceId: ws.id,
      event: 'post.scheduled',
      payload: {
        postId: locallyScheduled.id,
        campaignName: locallyScheduled.name,
        scheduledFor: scheduledIso,
        platforms: locallyScheduled.platforms,
        pushedToZernio,
        source: created ? 'content_engine_created_post' : 'content_engine_existing_post',
      },
    });
    if (webhookSummary.failed > 0) {
      console.error('One or more workspace webhooks failed for content-engine schedule', {
        workspaceId: ws.id,
        postId: locallyScheduled.id,
        attempted: webhookSummary.attempted,
        failed: webhookSummary.failed,
      });
    }

    if (warning) {
      const combined = safetyNote ? `${warning} · Brand safety: ${safetyNote}` : warning;
      return {
        status: 'partial',
        postId: locallyScheduled.id,
        scheduledFor: scheduledIso,
        warning: combined,
      };
    }
    if (safetyNote) {
      return {
        status: 'partial',
        postId: locallyScheduled.id,
        scheduledFor: scheduledIso,
        warning: `Brand safety: ${safetyNote}`,
      };
    }
    return {
      status: 'scheduled',
      postId: locallyScheduled.id,
      scheduledFor: scheduledIso,
      pushedToZernio,
      reused: !created,
    };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Recommended schedule failed.',
    };
  }
}

export async function sendCarouselPackageToReviewAction(
  _prev: ReviewLinkState | null,
  formData: FormData,
): Promise<ReviewLinkState> {
  const parsed = CreateCalendarDraftSchema.safeParse({
    planId: formData.get('planId'),
    itemIndex: formData.get('itemIndex'),
  });
  if (!parsed.success) {
    return { status: 'error', error: 'Invalid review link request.' };
  }

  const { planId, itemIndex } = parsed.data;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };

    const ws = await getOrCreateCurrentWorkspace(user);
    const plan = await getContentPlan(planId);
    if (!plan || plan.workspace_id !== ws.id) {
      return { status: 'error', error: 'Content plan not found.' };
    }
    if (!plan.model_id) {
      return { status: 'error', error: 'This content plan no longer has a source AI model.' };
    }

    const items = (Array.isArray(plan.items) ? plan.items : []) as PlanItem[];
    const item = items[itemIndex];
    if (!item?.contentPackage) {
      return { status: 'error', error: 'Content package not found for this plan item.' };
    }

    const recordedReview = item.contentPackage.reviewLink;
    if (recordedReview?.postId) {
      const existing = await getPostById(recordedReview.postId);
      if (existing?.workspace_id === ws.id && existing.share_token) {
        const token = existing.share_token;
        if (token !== recordedReview.token) {
          const nextItems = mergeCarouselReviewLink(items, itemIndex, {
            postId: existing.id,
            token,
            enabledAt: recordedReview.enabledAt,
          });
          await updateContentPlanItems(plan.id, nextItems);
          revalidateContentPlanSurfaces(plan.id);
          revalidatePath(`/p/${token}`);
        }
        return { status: 'ready', postId: existing.id, token, reused: true };
      }
    }

    const post =
      (await getReusablePackagePost({
        workspaceId: ws.id,
        postIds: [
          item.contentPackage.scheduledPost?.postId,
          item.contentPackage.calendarDraft?.postId,
        ],
      })) ??
      (
        await getOrCreatePackagePost({
          workspaceId: ws.id,
          modelId: plan.model_id,
          item,
        })
      ).post;

    const token = await enablePostSharing(post.id);
    const enabledAt = new Date().toISOString();
    const nextItems = mergeCarouselReviewLink(items, itemIndex, {
      postId: post.id,
      token,
      enabledAt,
    });
    await updateContentPlanItems(plan.id, nextItems);

    revalidateContentPlanSurfaces(plan.id);
    revalidatePath(`/p/${token}`);
    return { status: 'ready', postId: post.id, token, reused: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Review link creation failed.';
    return {
      status: 'error',
      error: message.replace(
        'Generate at least one carousel asset before scheduling this package.',
        'Generate at least one carousel asset before sending this package to review.',
      ),
    };
  }
}

async function getReusablePackagePost(input: {
  workspaceId: string;
  postIds: Array<string | null | undefined>;
}): Promise<PostRow | null> {
  const seen = new Set<string>();
  for (const postId of input.postIds) {
    if (!postId || seen.has(postId)) continue;
    seen.add(postId);
    const post = await getPostById(postId);
    if (post?.workspace_id === input.workspaceId) return post;
  }
  return null;
}

async function getOrCreatePackagePost(input: {
  workspaceId: string;
  modelId: string;
  item: PlanItem;
}): Promise<{ post: PostRow; created: boolean }> {
  const existingPostId = input.item.contentPackage.calendarDraft?.postId;
  if (existingPostId) {
    const existing = await getPostById(existingPostId);
    if (existing?.workspace_id === input.workspaceId) {
      return { post: existing, created: false };
    }
  }

  const variants = getReadyCarouselVariants(input.item.contentPackage.carouselSlides);
  if (variants.length === 0) {
    throw new Error('Generate at least one carousel asset before scheduling this package.');
  }

  const { brief, caption } = buildCarouselCalendarDraft({
    modelId: input.modelId,
    item: input.item,
  });
  const post = await saveDraftPost({
    workspaceId: input.workspaceId,
    brief,
    variants,
    caption,
  });
  return { post, created: true };
}

function revalidateContentPlanSurfaces(planId: string) {
  revalidatePath(`/series/${planId}`);
  revalidatePath('/series');
  revalidatePath('/calendar');
  revalidatePath('/dashboard');
  revalidatePath('/studio');
}
