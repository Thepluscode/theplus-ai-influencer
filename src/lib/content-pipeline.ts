import 'server-only';
import type { ContentJobRow } from '@/lib/supabase/types';
import { COSTS, consumeCredits, refundCredits, type CreditReason } from '@/lib/credits';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { fallbackBrandDefaults } from '@/lib/workspace-controls';
import {
  createPack,
  getContentSourceAdmin,
  getPackItemAdmin,
  insertAtoms,
  insertPackItems,
  listAtomsForSourceAdmin,
  recordSourceError,
  setPackStatus,
  setSourceStatus,
  updatePackItem,
} from '@/lib/content-sources';
import { generateMediaBrief } from '@/lib/content-media';
import { extractAtoms, extractSourceText } from '@/lib/content-extraction';
import {
  generateContentPack,
  packResponseToItems,
  type RepackageBrand,
} from '@/lib/content-repackage';
import { CHANNELS } from '@/lib/content-sources-schema';
import { markContentJobCompleted, markContentJobFailed } from '@/lib/content-jobs';

// ---------------------------------------------------------------------------
// Content OS — job processors invoked by /api/jobs/content-pipeline.
// ---------------------------------------------------------------------------
// One processor per job kind. Each charges credits right before the paid call
// and refunds on failure (Rule: charge-before-call, refund-on-failure). All
// decisions are logged for observability (Rule 8). Repackage/media processors
// are added in later phases.
// ---------------------------------------------------------------------------

export type JobOutcome =
  | { ok: true; detail: string }
  | { ok: false; reason: 'insufficient_credits' | 'error'; detail: string };

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'unknown error';
  }
}

/**
 * Extract: source → normalized text → structured atoms.
 * Charges SOURCE_TRANSCRIPTION (audio/video) or SOURCE_EXTRACTION_TEXT.
 */
export async function runExtractJob(job: ContentJobRow): Promise<JobOutcome> {
  if (!job.source_id) {
    return { ok: false, reason: 'error', detail: 'extract job has no source_id' };
  }
  const source = await getContentSourceAdmin(job.source_id);
  if (!source) {
    return { ok: false, reason: 'error', detail: `source ${job.source_id} not found` };
  }

  const isMedia = source.type === 'audio' || source.type === 'video';
  const amount = isMedia ? COSTS.SOURCE_TRANSCRIPTION : COSTS.SOURCE_EXTRACTION_TEXT;
  const reason: CreditReason = isMedia ? 'source_transcription' : 'source_extraction_text';

  const consume = await consumeCredits({
    workspaceId: job.workspace_id,
    amount,
    reason,
    refKind: 'content_source',
    refId: source.id,
  });
  if (!consume.ok) {
    const detail = `insufficient credits (need ${consume.required}, have ${consume.balance})`;
    await setSourceStatus(source.id, 'failed', { lastError: detail });
    await markContentJobFailed(job.id, detail, 0);
    console.warn('[content-pipeline] extract blocked', { jobId: job.id, sourceId: source.id, detail });
    return { ok: false, reason: 'insufficient_credits', detail };
  }

  await setSourceStatus(source.id, 'extracting');

  try {
    const text = await extractSourceText(source);
    const atoms = await extractAtoms(text);
    await insertAtoms(source.workspace_id, source.id, atoms);
    await setSourceStatus(source.id, 'extracted', { extractedText: text });
    await markContentJobCompleted(job.id);
    console.info('[content-pipeline] extract done', {
      jobId: job.id,
      sourceId: source.id,
      atoms: atoms.length,
      chars: text.length,
    });
    return { ok: true, detail: `extracted ${atoms.length} atoms` };
  } catch (err) {
    const detail = toMessage(err);
    // The paid call produced no usable output — refund the charge.
    await refundCredits({ workspaceId: job.workspace_id, amount, refKind: 'content_source', refId: source.id });
    await recordSourceError(source.id, detail);
    await markContentJobFailed(job.id, detail, amount);
    console.error('[content-pipeline] extract failed', { jobId: job.id, sourceId: source.id, detail });
    return { ok: false, reason: 'error', detail };
  }
}

async function readBrand(workspaceId: string): Promise<RepackageBrand> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('workspace_brand_defaults')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const bd = data ?? fallbackBrandDefaults(workspaceId);
  return { tone: bd.brand_tone, vibe: bd.brand_vibe, palette: bd.brand_palette, cta: bd.default_cta };
}

/**
 * Repackage: source atoms → a 10-channel content pack (one OpenAI call).
 * Charges CONTENT_REPACKAGE; refunds on failure. Drafts only — nothing is
 * scheduled or published here.
 */
export async function runRepackageJob(job: ContentJobRow): Promise<JobOutcome> {
  if (!job.source_id) {
    return { ok: false, reason: 'error', detail: 'repackage job has no source_id' };
  }
  const source = await getContentSourceAdmin(job.source_id);
  if (!source) {
    return { ok: false, reason: 'error', detail: `source ${job.source_id} not found` };
  }

  const atoms = await listAtomsForSourceAdmin(source.id);
  if (atoms.length === 0) {
    const detail = 'no atoms to repackage — run extraction first';
    await markContentJobFailed(job.id, detail, 0);
    console.warn('[content-pipeline] repackage blocked', { jobId: job.id, sourceId: source.id, detail });
    return { ok: false, reason: 'error', detail };
  }

  const amount = COSTS.CONTENT_REPACKAGE;
  const consume = await consumeCredits({
    workspaceId: job.workspace_id,
    amount,
    reason: 'content_repackage',
    refKind: 'content_source',
    refId: source.id,
  });
  if (!consume.ok) {
    const detail = `insufficient credits (need ${consume.required}, have ${consume.balance})`;
    await markContentJobFailed(job.id, detail, 0);
    console.warn('[content-pipeline] repackage blocked', { jobId: job.id, sourceId: source.id, detail });
    return { ok: false, reason: 'insufficient_credits', detail };
  }

  await setSourceStatus(source.id, 'repackaging');
  const pack = await createPack({ workspaceId: job.workspace_id, sourceId: source.id, status: 'generating' });

  try {
    const brand = await readBrand(job.workspace_id);
    const response = await generateContentPack({
      sourceTitle: source.title,
      atoms: atoms.map((a) => ({ kind: a.kind, text: a.text })),
      brand,
    });
    const items = packResponseToItems(response);
    await insertPackItems(job.workspace_id, pack.id, items);
    await setPackStatus(pack.id, 'ready', { channels: CHANNELS.map((c) => c.key) });
    await setSourceStatus(source.id, 'ready');
    await markContentJobCompleted(job.id);
    console.info('[content-pipeline] repackage done', {
      jobId: job.id,
      sourceId: source.id,
      packId: pack.id,
      items: items.length,
    });
    return { ok: true, detail: `repackaged into ${items.length} channels` };
  } catch (err) {
    const detail = toMessage(err);
    await refundCredits({ workspaceId: job.workspace_id, amount, refKind: 'content_source', refId: source.id });
    await setPackStatus(pack.id, 'failed', { lastError: detail });
    // Leave the source 'extracted' so the operator can retry repackaging.
    await setSourceStatus(source.id, 'extracted');
    await markContentJobFailed(job.id, detail, amount);
    console.error('[content-pipeline] repackage failed', { jobId: job.id, sourceId: source.id, detail });
    return { ok: false, reason: 'error', detail };
  }
}

/**
 * Media: generate a shot-level visual brief for a visual pack item and attach
 * it under body.mediaBrief, moving the item to ready_for_approval. Charges
 * PACK_MEDIA_RENDER; refunds on failure. Does not render Luma assets — that's
 * a manual handoff to the Storyboard surface.
 */
export async function runMediaJob(job: ContentJobRow): Promise<JobOutcome> {
  if (!job.pack_item_id) {
    return { ok: false, reason: 'error', detail: 'media job has no pack_item_id' };
  }
  const item = await getPackItemAdmin(job.pack_item_id);
  if (!item) {
    return { ok: false, reason: 'error', detail: `pack item ${job.pack_item_id} not found` };
  }

  const amount = COSTS.PACK_MEDIA_RENDER;
  const consume = await consumeCredits({
    workspaceId: job.workspace_id,
    amount,
    reason: 'pack_media_render',
    refKind: 'content_pack_item',
    refId: item.id,
  });
  if (!consume.ok) {
    const detail = `insufficient credits (need ${consume.required}, have ${consume.balance})`;
    await markContentJobFailed(job.id, detail, 0);
    console.warn('[content-pipeline] media blocked', { jobId: job.id, itemId: item.id, detail });
    return { ok: false, reason: 'insufficient_credits', detail };
  }

  await updatePackItem(item.id, { status: 'media_generating' });

  try {
    const brief = await generateMediaBrief(item.channel, item.body);
    const mergedBody = { ...(item.body as Record<string, unknown>), mediaBrief: brief };
    await updatePackItem(item.id, { body: mergedBody, status: 'ready_for_approval' });
    await markContentJobCompleted(job.id);
    console.info('[content-pipeline] media done', {
      jobId: job.id,
      itemId: item.id,
      scenes: brief.scenes.length,
    });
    return { ok: true, detail: `media brief with ${brief.scenes.length} scenes` };
  } catch (err) {
    const detail = toMessage(err);
    await refundCredits({ workspaceId: job.workspace_id, amount, refKind: 'content_pack_item', refId: item.id });
    await updatePackItem(item.id, { status: 'draft', lastError: detail });
    await markContentJobFailed(job.id, detail, amount);
    console.error('[content-pipeline] media failed', { jobId: job.id, itemId: item.id, detail });
    return { ok: false, reason: 'error', detail };
  }
}
