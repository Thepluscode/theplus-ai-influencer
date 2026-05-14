'use server';

import { revalidatePath } from 'next/cache';
import { listAiModels } from '@/lib/ai-models';
import {
  generateCaptions,
  reformatForPlatforms,
  type CaptionsResult,
  type PlatformVariant,
} from '@/lib/captions';
import { consumeCredits, COSTS, refundCredits } from '@/lib/credits';
import { generatePostVariants } from '@/lib/luma-post';
import { getPostById, saveDraftPost, updatePostSchedule } from '@/lib/posts';
import type { PostRow } from '@/lib/supabase/types';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { serverEnv } from '@/lib/env';
import {
  getDefaultZernioProfileId,
  getZernioClient,
  pickAccountsForPlatforms,
  type ZernioPlatformTarget,
} from '@/lib/zernio';
import { PostBriefInput, type Platform, type PostVariant } from '@/types/post';

export type GeneratePostState =
  | { status: 'idle' }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> }
  | { status: 'insufficient_credits'; balance: number; required: number }
  | { status: 'success'; brief: PostBriefInput; variants: PostVariant[] };

export type SavePostState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'saved'; postId: string };

const Schema = PostBriefInput;

function readBrief(formData: FormData): Record<string, unknown> {
  // Multiple product references arrive as repeated form fields with the
  // same name; getAll returns all of them. Empty strings are stripped by
  // the schema's transform.
  const productRefUrls = formData.getAll('productRefUrls').filter((v) => typeof v === 'string');
  return {
    modelId: formData.get('modelId'),
    name: formData.get('name'),
    platforms: formData.getAll('platforms'),
    format: formData.get('format'),
    brief: formData.get('brief'),
    scene: formData.get('scene') ?? '',
    outfit: formData.get('outfit') ?? '',
    props: formData.get('props') ?? '',
    brandTone: formData.get('brandTone'),
    cta: formData.get('cta'),
    uploadedImageUrl: formData.get('uploadedImageUrl') ?? '',
    productRefUrls,
    postGoal: formData.get('postGoal') ?? 'engagement',
    lighting: formData.get('lighting') ?? 'natural',
  };
}

export async function generatePostVariantsAction(
  _prev: GeneratePostState | null,
  formData: FormData,
): Promise<GeneratePostState> {
  const parsed = Schema.safeParse(readBrief(formData));
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

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: 'error', error: 'Not signed in.' };
    }
    const ws = await getOrCreateCurrentWorkspace(user);
    const models = await listAiModels(ws.id);
    const model = models.find((m) => m.id === parsed.data.modelId);
    if (!model) {
      return {
        status: 'error',
        error: 'Selected model not found in your workspace.',
        fieldErrors: { modelId: 'Pick a model that belongs to your workspace.' },
      };
    }

    // Skip-render path — operator supplied their own finished image.
    // Costs 0 credits since no upstream API runs.
    if (parsed.data.uploadedImageUrl) {
      const variants: PostVariant[] = [
        {
          url: parsed.data.uploadedImageUrl,
          generationId: 'operator-upload',
          generatedAt: new Date().toISOString(),
        },
      ];
      return { status: 'success', brief: parsed.data, variants };
    }

    // Render path — 2 variants × per-variant cost. Consume up front so
    // simultaneous tabs can't double-spend; refund if Luma errors out.
    const variantCount = 2;
    const credits = COSTS.POST_VARIANT_RENDER * variantCount;
    const consume = await consumeCredits({
      workspaceId: ws.id,
      amount: credits,
      reason: 'post_variant_render',
      refKind: 'campaign',
      refId: parsed.data.name,
    });
    if (!consume.ok) {
      return {
        status: 'insufficient_credits',
        balance: consume.balance,
        required: consume.required,
      };
    }

    try {
      const variants = await generatePostVariants(parsed.data, model, variantCount);
      return { status: 'success', brief: parsed.data, variants };
    } catch (innerErr) {
      await refundCredits({
        workspaceId: ws.id,
        amount: credits,
        refKind: 'campaign',
        refId: parsed.data.name,
      });
      throw innerErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Luma error';
    return { status: 'error', error: message };
  }
}

export async function saveDraftPostAction(
  _prev: SavePostState | null,
  formData: FormData,
): Promise<SavePostState> {
  const briefJson = formData.get('brief');
  const variantsJson = formData.get('variants');
  const caption = formData.get('caption');

  if (typeof briefJson !== 'string' || typeof variantsJson !== 'string') {
    return { status: 'error', error: 'Missing payload — regenerate variants and try again.' };
  }

  let brief: PostBriefInput;
  let variants: PostVariant[];
  try {
    brief = Schema.parse(JSON.parse(briefJson));
    variants = JSON.parse(variantsJson) as PostVariant[];
    if (!Array.isArray(variants) || variants.length === 0) {
      throw new Error('no variants in payload');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid payload';
    return { status: 'error', error: `Could not save: ${message}` };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: 'error', error: 'Not signed in.' };
    }
    const ws = await getOrCreateCurrentWorkspace(user);
    const saved = await saveDraftPost({
      workspaceId: ws.id,
      brief,
      variants,
      caption: typeof caption === 'string' && caption.trim() ? caption.trim() : null,
    });
    revalidatePath('/create-post');
    revalidatePath('/calendar');
    return { status: 'saved', postId: saved.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed';
    return { status: 'error', error: message };
  }
}

// ===========================================================================
// Caption Writer + Cross-Platform Reformatter
// ===========================================================================
// v1 wedge — see STRATEGY.md. These actions are invoked from the captions
// panel that appears after Luma variants render on /create-post.

export type CaptionsState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'insufficient_credits'; balance: number; required: number }
  | { status: 'success'; data: CaptionsResult };

export async function generateCaptionsAction(
  _prev: CaptionsState | null,
  formData: FormData,
): Promise<CaptionsState> {
  const briefJson = formData.get('brief');
  if (typeof briefJson !== 'string') {
    return { status: 'error', error: 'Missing brief payload.' };
  }
  let brief: PostBriefInput;
  try {
    brief = Schema.parse(JSON.parse(briefJson));
  } catch (err) {
    const m = err instanceof Error ? err.message : 'invalid brief';
    return { status: 'error', error: `Could not read brief: ${m}` };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);
    const models = await listAiModels(ws.id);
    const model = models.find((m) => m.id === brief.modelId);
    if (!model) {
      return { status: 'error', error: 'Model not found in workspace.' };
    }

    const consume = await consumeCredits({
      workspaceId: ws.id,
      amount: COSTS.CAPTION_GENERATION,
      reason: 'caption_generation',
      refKind: 'campaign',
      refId: brief.name,
    });
    if (!consume.ok) {
      return {
        status: 'insufficient_credits',
        balance: consume.balance,
        required: consume.required,
      };
    }

    try {
      const data = await generateCaptions({
        model: { name: model.name, wizard_input: model.wizard_input },
        brief,
      });
      return { status: 'success', data };
    } catch (innerErr) {
      await refundCredits({
        workspaceId: ws.id,
        amount: COSTS.CAPTION_GENERATION,
        refKind: 'campaign',
        refId: brief.name,
      });
      throw innerErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Caption generation failed';
    return { status: 'error', error: message };
  }
}

export type ReformatState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: PlatformVariant[] };

export async function reformatCaptionAction(
  _prev: ReformatState | null,
  formData: FormData,
): Promise<ReformatState> {
  const briefJson = formData.get('brief');
  const caption = formData.get('caption');
  const hashtagsJson = formData.get('hashtags');
  if (typeof briefJson !== 'string' || typeof caption !== 'string') {
    return { status: 'error', error: 'Missing caption or brief.' };
  }
  if (!caption.trim()) {
    return { status: 'error', error: 'Pick a caption first, then reformat.' };
  }
  let brief: PostBriefInput;
  try {
    brief = Schema.parse(JSON.parse(briefJson));
  } catch (err) {
    const m = err instanceof Error ? err.message : 'invalid brief';
    return { status: 'error', error: `Could not read brief: ${m}` };
  }
  let hashtags: string[] = [];
  if (typeof hashtagsJson === 'string' && hashtagsJson) {
    try {
      const parsed = JSON.parse(hashtagsJson);
      if (Array.isArray(parsed)) hashtags = parsed.filter((h): h is string => typeof h === 'string');
    } catch {
      // hashtags are optional — ignore parse failures
    }
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);
    const models = await listAiModels(ws.id);
    const model = models.find((m) => m.id === brief.modelId);
    if (!model) return { status: 'error', error: 'Model not found in workspace.' };

    const data = await reformatForPlatforms({
      caption,
      hashtags,
      model: { name: model.name, wizard_input: model.wizard_input },
      brief,
      platforms: brief.platforms as Platform[],
    });
    return { status: 'success', data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reformat failed';
    return { status: 'error', error: message };
  }
}

// ===========================================================================
// Schedule & Publish — Phase 2 of BUILD_PLAN.md
// ===========================================================================
// One action handles draft / schedule-now / schedule-later from the
// create-post page so the operator doesn't have to bounce to /calendar to
// put a date on a fresh post. Pushes to Zernio when scheduledFor is set
// (and a real ZERNIO_API_KEY is present); otherwise stores locally only.

export type SchedulePostState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'partial'; postId: string; warning: string }
  | { status: 'scheduled'; postId: string; scheduledFor: string; pushedToZernio: boolean }
  | { status: 'saved_draft'; postId: string };

export async function scheduleAndPublishAction(
  _prev: SchedulePostState | null,
  formData: FormData,
): Promise<SchedulePostState> {
  const briefJson = formData.get('brief');
  const variantsJson = formData.get('variants');
  const captionRaw = formData.get('caption');
  const mode = formData.get('mode'); // 'draft' | 'now' | 'later'
  const scheduledForRaw = formData.get('scheduledFor');
  // Optional handle for a previously-saved post — set by the UI on retry so we
  // reuse the existing row instead of inserting a duplicate. If the row already
  // has a zernio_post_id, we short-circuit the Zernio publish.
  const retryPostIdRaw = formData.get('postId');
  const retryPostId =
    typeof retryPostIdRaw === 'string' && retryPostIdRaw.trim() ? retryPostIdRaw.trim() : null;

  if (typeof briefJson !== 'string' || typeof variantsJson !== 'string') {
    return { status: 'error', error: 'Missing payload — regenerate and try again.' };
  }
  if (mode !== 'draft' && mode !== 'now' && mode !== 'later') {
    return { status: 'error', error: 'Pick draft, schedule now, or schedule for a later time.' };
  }

  let brief: PostBriefInput;
  let variants: PostVariant[];
  try {
    brief = Schema.parse(JSON.parse(briefJson));
    variants = JSON.parse(variantsJson) as PostVariant[];
    if (!Array.isArray(variants) || variants.length === 0) {
      throw new Error('no variants in payload');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid payload';
    return { status: 'error', error: `Could not save: ${message}` };
  }

  // Resolve the scheduled timestamp first so we can validate before doing
  // any writes. "now" means immediately; "later" requires a parseable ISO.
  let scheduledFor: Date | null = null;
  if (mode === 'now') {
    scheduledFor = new Date();
  } else if (mode === 'later') {
    if (typeof scheduledForRaw !== 'string' || !scheduledForRaw.trim()) {
      return { status: 'error', error: 'Pick a date and time for the scheduled post.' };
    }
    const d = new Date(scheduledForRaw);
    if (Number.isNaN(d.getTime())) {
      return { status: 'error', error: 'Could not parse the scheduled date.' };
    }
    if (d.getTime() < Date.now() - 60_000) {
      return { status: 'error', error: 'Scheduled time is in the past — pick a future date.' };
    }
    scheduledFor = d;
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: 'error', error: 'Not signed in.' };
    }
    const ws = await getOrCreateCurrentWorkspace(user);
    const caption =
      typeof captionRaw === 'string' && captionRaw.trim() ? captionRaw.trim() : null;

    // 1. Always persist locally first so the operator's draft survives any
    //    Zernio outage. On retry (postId present in formData) we reuse the
    //    existing row instead of inserting a duplicate, and short-circuit if
    //    Zernio already published it last time.
    let saved: PostRow;
    if (retryPostId) {
      const existing = await getPostById(retryPostId);
      if (!existing) {
        return { status: 'error', error: 'Retry target post not found.' };
      }
      if (existing.zernio_post_id) {
        return {
          status: 'scheduled',
          postId: existing.id,
          scheduledFor:
            existing.scheduled_for ?? (scheduledFor ?? new Date()).toISOString(),
          pushedToZernio: true,
        };
      }
      saved = existing;
    } else {
      saved = await saveDraftPost({
        workspaceId: ws.id,
        brief,
        variants,
        caption,
      });
    }

    // 2. Promote to scheduled status if a time was picked.
    if (scheduledFor) {
      await updatePostSchedule(saved.id, scheduledFor, { caption });
    }
    revalidatePath('/create-post');
    revalidatePath('/calendar');
    revalidatePath('/dashboard');
    revalidatePath('/studio');

    if (mode === 'draft') {
      return { status: 'saved_draft', postId: saved.id };
    }

    // 3. Push to Zernio if configured. Save succeeds either way; Zernio
    //    failures surface as a `partial` so the operator knows the local
    //    schedule went through but the cross-poster needs attention.
    let pushedToZernio = false;
    let warning: string | null = null;
    if (!serverEnv.ZERNIO_API_KEY) {
      warning = 'ZERNIO_API_KEY not configured — saved locally, but no cross-platform push.';
    } else if (brief.platforms.length === 0) {
      warning = 'No platforms selected — saved locally only.';
    } else {
      try {
        const profileId = await getDefaultZernioProfileId();
        const zernio = getZernioClient();
        const accounts = await zernio.listAccounts(profileId);
        const { resolved, missing } = pickAccountsForPlatforms(accounts, brief.platforms);
        if (resolved.length === 0) {
          warning = `None of the selected platforms are connected (${missing.join(', ')}). Connect them in /accounts to publish.`;
        } else {
          const zernioPost = await zernio.createPost({
            content: caption ?? '',
            platforms: resolved as ZernioPlatformTarget[],
            scheduledFor: scheduledFor as Date,
            profileId,
            mediaItems: variants.slice(0, 1).map((v) => ({ type: 'image' as const, url: v.url })),
          });
          // Zernio accepted the post. The local DB write that records the
          // zernio_post_id is a separate failure surface — if it throws, we'd
          // have an orphan remote post the operator can't track or cancel.
          // Compensate by best-effort deleting the remote post so a retry
          // doesn't publish a duplicate.
          try {
            await updatePostSchedule(saved.id, scheduledFor as Date, {
              caption,
              zernioPostId: zernioPost._id,
            });
            pushedToZernio = true;
            if (missing.length > 0) {
              warning = `Scheduled on ${resolved.map((r) => r.platform).join(', ')} — ${missing.join(', ')} not connected.`;
            }
          } catch (dbErr) {
            const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
            try {
              await zernio.deletePost(zernioPost._id);
              warning = `Couldn't record the Zernio publish locally — rolled it back, please retry. (${dbMsg})`;
            } catch (rollbackErr) {
              const rbMsg =
                rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
              warning = `Published to Zernio (id: ${zernioPost._id}) but couldn't record locally and rollback failed. Check /accounts and the platforms manually before retrying. (db: ${dbMsg}; rollback: ${rbMsg})`;
            }
          }
        }
      } catch (err) {
        warning = `Saved locally; Zernio push failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    revalidatePath('/calendar');
    if (warning) {
      return { status: 'partial', postId: saved.id, warning };
    }
    return {
      status: 'scheduled',
      postId: saved.id,
      scheduledFor: (scheduledFor as Date).toISOString(),
      pushedToZernio,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Schedule failed';
    return { status: 'error', error: message };
  }
}
