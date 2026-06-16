'use server';

import { revalidatePath } from 'next/cache';
import { serverEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { DEMO_SOURCE_ID, isDemoMode } from '@/lib/demo-mode';
import {
  createContentSourceSchema,
  sourceTypeFromMime,
  VISUAL_CHANNELS,
  type ChannelKey,
  type CreateContentSourceInput,
} from '@/lib/content-sources-schema';
import {
  createContentSource,
  getContentSource,
  getPackItem,
  updatePackItem,
} from '@/lib/content-sources';
import { enqueueContentJob, getContentJob, requeueContentJob } from '@/lib/content-jobs';
import { COSTS } from '@/lib/credits';
import { createDraftFromPackItem } from '@/lib/content-distribution';
import { enablePostSharing, getPostById, updatePostSchedule } from '@/lib/posts';
import { describeSafetyBlock, runPublishBrandSafetyGate } from '@/lib/publish-safety';
import {
  getDefaultZernioProfileId,
  getZernioClient,
  pickAccountsForPlatforms,
  type ZernioPlatformTarget,
} from '@/lib/zernio';

// ---------------------------------------------------------------------------
// Content OS server actions.
// ---------------------------------------------------------------------------
// Mutations return typed { ok, ... } | { ok: false, error } shapes — never
// { success: true } on failure. Publishing stays approval-gated: these actions
// create sources, atoms, packs, and drafts but never push to a live account
// without passing the brand-safety gate AND explicit approval.
// ---------------------------------------------------------------------------

export type CreateSourceState =
  | { ok: true; sourceId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function deriveTitle(input: CreateContentSourceInput): string {
  if (input.title && input.title.trim()) return input.title.trim().slice(0, 200);
  if (input.mode === 'paste' && input.text) {
    const firstLine = input.text.trim().split('\n')[0]?.trim() ?? '';
    return (firstLine.slice(0, 80) || 'Pasted source').trim();
  }
  if (input.mode === 'upload' && input.storagePath) {
    const base = input.storagePath.split('/').pop() ?? 'Uploaded source';
    return base.slice(0, 200);
  }
  return 'Untitled source';
}

/**
 * Record a new source (paste text, or a file already uploaded to the
 * content-sources bucket) and enqueue an extraction job. The cron worker
 * (/api/jobs/content-pipeline) picks it up and extracts atoms.
 */
export async function createContentSourceAction(
  input: CreateContentSourceInput,
): Promise<CreateSourceState> {
  const parsed = createContentSourceSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'Please fix the highlighted fields.', fieldErrors };
  }
  const data = parsed.data;

  // Demo mode: never touch Supabase or enqueue real work.
  if (isDemoMode()) {
    return { ok: true, sourceId: DEMO_SOURCE_ID };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Sign in to add a source.' };
  }
  const ws = await getOrCreateCurrentWorkspace(user);

  const type =
    data.mode === 'paste' ? 'paste' : (sourceTypeFromMime(data.mimeType ?? '') ?? 'txt');

  let source;
  try {
    source = await createContentSource({
      workspaceId: ws.id,
      title: deriveTitle(data),
      type,
      storagePath: data.mode === 'upload' ? (data.storagePath ?? null) : null,
      byteSize: data.mode === 'upload' ? (data.byteSize ?? null) : null,
      mimeType: data.mode === 'upload' ? (data.mimeType ?? null) : null,
      rawText: data.mode === 'paste' ? (data.text ?? null) : null,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save source.' };
  }

  // Enqueue extraction. cost_charged is recorded so the worker can refund the
  // exact amount on failure; the actual ledger charge happens in the worker
  // right before the paid call.
  try {
    await enqueueContentJob({
      workspaceId: ws.id,
      kind: 'extract',
      sourceId: source.id,
      costCharged:
        type === 'audio' || type === 'video'
          ? COSTS.SOURCE_TRANSCRIPTION
          : COSTS.SOURCE_EXTRACTION_TEXT,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Source saved but extraction could not start.',
    };
  }

  revalidatePath('/content-os');
  return { ok: true, sourceId: source.id };
}

export type SimpleActionState = { ok: true } | { ok: false; error: string };

/** Re-run extraction for an existing source (retry after a failed extract). */
export async function runSourceExtractionAction(sourceId: string): Promise<SimpleActionState> {
  if (isDemoMode()) return { ok: true };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to re-run extraction.' };

  const source = await getContentSource(sourceId);
  if (!source) return { ok: false, error: 'Source not found.' };

  try {
    await enqueueContentJob({
      workspaceId: source.workspace_id,
      kind: 'extract',
      sourceId: source.id,
      costCharged:
        source.type === 'audio' || source.type === 'video'
          ? COSTS.SOURCE_TRANSCRIPTION
          : COSTS.SOURCE_EXTRACTION_TEXT,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to queue extraction.' };
  }

  revalidatePath(`/content-os/${sourceId}`);
  return { ok: true };
}

export type ApprovePackItemState =
  | { ok: true; postId: string; shareToken: string | null }
  | { ok: false; error: string };

/**
 * Approve a pack item: create a draft post from it, enable a review share
 * link, and mark the item approved. Creates a draft only — never schedules
 * or publishes.
 */
export async function approvePackItemAction(itemId: string): Promise<ApprovePackItemState> {
  if (isDemoMode()) return { ok: true, postId: DEMO_SOURCE_ID, shareToken: 'demo-review-link' };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to approve.' };

  const item = await getPackItem(itemId);
  if (!item) return { ok: false, error: 'Pack item not found.' };
  if (item.status === 'scheduled' || item.status === 'published') {
    return { ok: false, error: 'This item is already scheduled.' };
  }

  try {
    const post = await createDraftFromPackItem(item.workspace_id, item);
    let shareToken: string | null = null;
    try {
      shareToken = await enablePostSharing(post.id);
    } catch {
      // Review link is a nice-to-have; approval still succeeds without it.
      shareToken = null;
    }
    await updatePackItem(item.id, { status: 'approved', postId: post.id });
    revalidatePath('/content-os');
    return { ok: true, postId: post.id, shareToken };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to approve item.' };
  }
}

export type SchedulePackItemState =
  | { ok: true; pushedToZernio: boolean; warning?: string }
  | { ok: false; error: string };

/**
 * Schedule an approved pack item through the existing publish path. Runs the
 * brand-safety gate FIRST — a block keeps the item approved (draft editable)
 * and never schedules. Social channels push to Zernio; non-social channels
 * schedule as calendar entries only.
 */
export async function schedulePackItemAction(
  itemId: string,
  scheduledForIso: string,
): Promise<SchedulePackItemState> {
  if (isDemoMode()) {
    return {
      ok: true,
      pushedToZernio: false,
      warning: 'Demo mode — schedule saved to the fixture only; Zernio publish is disabled.',
    };
  }

  const when = new Date(scheduledForIso);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, error: 'Could not parse the scheduled date.' };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to schedule.' };

  const item = await getPackItem(itemId);
  if (!item) return { ok: false, error: 'Pack item not found.' };
  if (!item.post_id) return { ok: false, error: 'Approve the item before scheduling.' };

  const post = await getPostById(item.post_id);
  if (!post) return { ok: false, error: 'Linked draft post not found.' };

  // Brand-safety gate — fail-closed. A block keeps the item approved + the
  // draft editable; nothing is scheduled or pushed.
  const gate = await runPublishBrandSafetyGate({
    workspaceId: post.workspace_id,
    postId: post.id,
    caption: post.caption ?? null,
    imageUrl: post.variants[0]?.url ?? null,
    platforms: post.platforms,
  });
  if (!gate.ok) {
    if (gate.reason === 'insufficient_credits') {
      return {
        ok: false,
        error: `Not enough credits for the brand-safety check — need ${gate.required}, you have ${gate.balance}.`,
      };
    }
    if (gate.reason === 'blocked') {
      return { ok: false, error: `Brand safety blocked this item: ${describeSafetyBlock(gate.summary, gate.issues)}` };
    }
    return { ok: false, error: `Brand-safety check failed, nothing was scheduled: ${gate.error}` };
  }

  const zernioReady = Boolean(serverEnv.ZERNIO_API_KEY) && post.platforms.length > 0;
  let zernioPostId: string | null | undefined = undefined;
  let warning: string | null = gate.note ? `Brand safety: ${gate.note}` : null;

  if (zernioReady) {
    try {
      const profileId = await getDefaultZernioProfileId();
      const zernio = getZernioClient();
      const accounts = await zernio.listAccounts(profileId);
      const { resolved, missing } = pickAccountsForPlatforms(accounts, post.platforms);
      if (resolved.length === 0) {
        warning = `No connected Zernio accounts for: ${post.platforms.join(', ')}. Saved to calendar only.`;
      } else {
        const zernioPost = await zernio.createPost({
          content: post.caption ?? '',
          platforms: resolved as ZernioPlatformTarget[],
          scheduledFor: when,
          profileId,
        });
        zernioPostId = zernioPost._id;
        if (missing.length > 0) {
          warning = `Scheduled on ${resolved.map((r) => r.platform).join(', ')}; ${missing.join(', ')} not connected.`;
        }
      }
    } catch (err) {
      warning = `Saved to calendar; Zernio push failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  try {
    await updatePostSchedule(post.id, when, { caption: post.caption ?? null, zernioPostId });
    await updatePackItem(item.id, { status: 'scheduled' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to schedule.' };
  }

  revalidatePath('/content-os');
  revalidatePath('/calendar');
  return { ok: true, pushedToZernio: Boolean(zernioPostId), warning: warning ?? undefined };
}

/** Retry a failed pipeline job. */
export async function retryContentJobAction(jobId: string): Promise<SimpleActionState> {
  if (isDemoMode()) return { ok: true };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to retry.' };

  const job = await getContentJob(jobId);
  if (!job) return { ok: false, error: 'Job not found.' };
  if (job.status !== 'failed') return { ok: false, error: 'Only failed jobs can be retried.' };

  try {
    await requeueContentJob(job.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to retry job.' };
  }

  revalidatePath('/content-os');
  return { ok: true };
}

/** Enqueue a media-brief job for a visual pack item (carousel / short-form). */
export async function generateMediaForItemAction(itemId: string): Promise<SimpleActionState> {
  if (isDemoMode()) return { ok: true };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to generate media.' };

  const item = await getPackItem(itemId);
  if (!item) return { ok: false, error: 'Pack item not found.' };
  if (!VISUAL_CHANNELS.includes(item.channel as ChannelKey)) {
    return { ok: false, error: 'Media briefs are only generated for visual channels.' };
  }

  try {
    await enqueueContentJob({
      workspaceId: item.workspace_id,
      kind: 'media',
      packItemId: item.id,
      costCharged: COSTS.PACK_MEDIA_RENDER,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to queue media.' };
  }

  revalidatePath(`/content-os`);
  return { ok: true };
}

/** Enqueue a repackage job — turns a source's atoms into a 10-channel pack. */
export async function generateContentPackAction(sourceId: string): Promise<SimpleActionState> {
  if (isDemoMode()) return { ok: true };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to generate a pack.' };

  const source = await getContentSource(sourceId);
  if (!source) return { ok: false, error: 'Source not found.' };
  if (source.status !== 'extracted' && source.status !== 'ready') {
    return { ok: false, error: 'Extract the source before generating a pack.' };
  }

  try {
    await enqueueContentJob({
      workspaceId: source.workspace_id,
      kind: 'repackage',
      sourceId: source.id,
      costCharged: COSTS.CONTENT_REPACKAGE,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to queue repackage.' };
  }

  revalidatePath(`/content-os/${sourceId}`);
  return { ok: true };
}
