import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';
import type {
  AiModelRow,
  ContentAtomRow,
  ContentPackItemRow,
  ContentPackRow,
  ContentSourceRow,
} from '@/lib/supabase/types';
import type { AtomKind, SourceType } from '@/lib/content-sources-schema';

// ---------------------------------------------------------------------------
// Content OS — content_sources / content_atoms / content_packs DB layer.
// ---------------------------------------------------------------------------
// Reads + user-initiated writes go through the cookie-scoped server client so
// RLS keeps everything inside the caller's workspace. The cron worker mutates
// status/text/atoms via the service-role admin client (the *Admin helpers).
// ---------------------------------------------------------------------------

type SourceStatus = ContentSourceRow['status'];

async function getAdminClient() {
  const { getSupabaseAdminClient } = await import('@/lib/supabase/admin');
  return getSupabaseAdminClient();
}

/** Insert a new source row (status defaults to 'uploaded'). Server client so
 *  the workspace INSERT policy applies. */
export async function createContentSource(input: {
  workspaceId: string;
  title: string;
  type: SourceType;
  storagePath?: string | null;
  byteSize?: number | null;
  mimeType?: string | null;
  rawText?: string | null;
}): Promise<ContentSourceRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_sources')
    .insert({
      workspace_id: input.workspaceId,
      title: input.title,
      type: input.type,
      storage_path: input.storagePath ?? null,
      byte_size: input.byteSize ?? null,
      mime_type: input.mimeType ?? null,
      raw_text: input.rawText ?? null,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to create content source: ${error?.message ?? 'no row'}`);
  }
  return data;
}

/** RLS-scoped read for UI/actions. Returns null if missing or not owned. */
export async function getContentSource(sourceId: string): Promise<ContentSourceRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_sources')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load content source: ${error.message}`);
  return data;
}

/** Service-role read for the cron worker (bypasses RLS). */
export async function getContentSourceAdmin(sourceId: string): Promise<ContentSourceRow | null> {
  const supabase = await getAdminClient();
  const { data, error } = await supabase
    .from('content_sources')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load content source: ${error.message}`);
  return data;
}

export async function listContentSources(workspaceId: string): Promise<ContentSourceRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_sources')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to list content sources: ${error.message}`);
  return data ?? [];
}

/** Worker status transition (admin). Optionally persists extracted text. */
export async function setSourceStatus(
  sourceId: string,
  status: SourceStatus,
  extra?: { extractedText?: string | null; lastError?: string | null },
): Promise<void> {
  const supabase = await getAdminClient();
  const patch: Database['public']['Tables']['content_sources']['Update'] = { status };
  if (extra && 'extractedText' in extra) patch.extracted_text = extra.extractedText ?? null;
  if (extra && 'lastError' in extra) patch.last_error = extra.lastError?.slice(0, 1000) ?? null;
  const { error } = await supabase.from('content_sources').update(patch).eq('id', sourceId);
  if (error) throw new Error(`Failed to set source status: ${error.message}`);
}

export async function recordSourceError(sourceId: string, message: string): Promise<void> {
  await setSourceStatus(sourceId, 'failed', { lastError: message });
}

// --- atoms ---------------------------------------------------------------

export async function insertAtoms(
  workspaceId: string,
  sourceId: string,
  atoms: Array<{
    kind: AtomKind;
    text: string;
    tags?: string[];
    sourceLocation?: string | null;
    confidence?: number | null;
  }>,
): Promise<number> {
  if (atoms.length === 0) return 0;
  const supabase = await getAdminClient();
  const { error } = await supabase.from('content_atoms').insert(
    atoms.map((a) => ({
      workspace_id: workspaceId,
      source_id: sourceId,
      kind: a.kind,
      text: a.text,
      tags: a.tags ?? [],
      source_location: a.sourceLocation ?? null,
      confidence: a.confidence ?? null,
    })),
  );
  if (error) throw new Error(`Failed to insert atoms: ${error.message}`);
  return atoms.length;
}

export async function listAtomsForSource(sourceId: string): Promise<ContentAtomRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_atoms')
    .select('*')
    .eq('source_id', sourceId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to list atoms: ${error.message}`);
  return data ?? [];
}

/** Service-role atom read for the cron worker (repackage needs the atoms). */
export async function listAtomsForSourceAdmin(sourceId: string): Promise<ContentAtomRow[]> {
  const supabase = await getAdminClient();
  const { data, error } = await supabase
    .from('content_atoms')
    .select('*')
    .eq('source_id', sourceId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to list atoms: ${error.message}`);
  return data ?? [];
}

// --- packs + items -------------------------------------------------------

type PackStatus = ContentPackRow['status'];

/** Create a pack row (admin — repackage runs in the worker). */
export async function createPack(input: {
  workspaceId: string;
  sourceId: string;
  status?: PackStatus;
  channels?: string[];
}): Promise<ContentPackRow> {
  const supabase = await getAdminClient();
  const { data, error } = await supabase
    .from('content_packs')
    .insert({
      workspace_id: input.workspaceId,
      source_id: input.sourceId,
      status: input.status ?? 'generating',
      channels: input.channels ?? [],
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`Failed to create pack: ${error?.message ?? 'no row'}`);
  return data;
}

export async function setPackStatus(
  packId: string,
  status: PackStatus,
  extra?: { channels?: string[]; lastError?: string | null },
): Promise<void> {
  const supabase = await getAdminClient();
  const patch: Database['public']['Tables']['content_packs']['Update'] = { status };
  if (extra && 'channels' in extra) patch.channels = extra.channels ?? [];
  if (extra && 'lastError' in extra) patch.last_error = extra.lastError?.slice(0, 1000) ?? null;
  const { error } = await supabase.from('content_packs').update(patch).eq('id', packId);
  if (error) throw new Error(`Failed to set pack status: ${error.message}`);
}

/** Insert pack items (admin). Returns the inserted rows. */
export async function insertPackItems(
  workspaceId: string,
  packId: string,
  items: Array<{ channel: string; format: string; body: unknown }>,
): Promise<ContentPackItemRow[]> {
  if (items.length === 0) return [];
  const supabase = await getAdminClient();
  const { data, error } = await supabase
    .from('content_pack_items')
    .insert(
      items.map((it) => ({
        workspace_id: workspaceId,
        pack_id: packId,
        channel: it.channel,
        format: it.format,
        body: it.body,
      })),
    )
    .select('*');
  if (error) throw new Error(`Failed to insert pack items: ${error.message}`);
  return data ?? [];
}

export async function listPacksForSource(sourceId: string): Promise<ContentPackRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_packs')
    .select('*')
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list packs: ${error.message}`);
  return data ?? [];
}

export async function listPackItems(packId: string): Promise<ContentPackItemRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_pack_items')
    .select('*')
    .eq('pack_id', packId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to list pack items: ${error.message}`);
  return data ?? [];
}

/** Scheduled/published pack items across the workspace — the distribution queue. */
export async function listScheduledPackItems(workspaceId: string): Promise<ContentPackItemRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_pack_items')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['scheduled', 'published'])
    .order('updated_at', { ascending: false })
    .limit(25);
  if (error) throw new Error(`Failed to list scheduled items: ${error.message}`);
  return data ?? [];
}

/** RLS-scoped single pack item read for approve/schedule actions. */
export async function getPackItem(itemId: string): Promise<ContentPackItemRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_pack_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load pack item: ${error.message}`);
  return data;
}

/** Service-role pack item read for the cron worker. */
export async function getPackItemAdmin(itemId: string): Promise<ContentPackItemRow | null> {
  const supabase = await getAdminClient();
  const { data, error } = await supabase
    .from('content_pack_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load pack item: ${error.message}`);
  return data;
}

type PackItemStatus = ContentPackItemRow['status'];

/** Patch a pack item (admin). Used by the worker + approve/schedule actions. */
export async function updatePackItem(
  itemId: string,
  patch: {
    status?: PackItemStatus;
    body?: unknown;
    postId?: string | null;
    storyboardId?: string | null;
    lastError?: string | null;
  },
): Promise<void> {
  const supabase = await getAdminClient();
  const update: Database['public']['Tables']['content_pack_items']['Update'] = {};
  if ('status' in patch && patch.status) update.status = patch.status;
  if ('body' in patch) update.body = patch.body;
  if ('postId' in patch) update.post_id = patch.postId ?? null;
  if ('storyboardId' in patch) update.storyboard_id = patch.storyboardId ?? null;
  if ('lastError' in patch) update.last_error = patch.lastError?.slice(0, 1000) ?? null;
  const { error } = await supabase.from('content_pack_items').update(update).eq('id', itemId);
  if (error) throw new Error(`Failed to update pack item: ${error.message}`);
}

/**
 * The workspace's default AI influencer (oldest), or null. The media job uses
 * its portrait as a Luma character_ref so generated visuals feature the
 * persona; absent a model, media falls back to model-less renders.
 */
export async function getWorkspaceModelAdmin(workspaceId: string): Promise<AiModelRow | null> {
  const supabase = await getAdminClient();
  const { data, error } = await supabase
    .from('ai_models')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load workspace model: ${error.message}`);
  return data;
}
