import 'server-only';
import type { ImageCreateParams } from 'lumaai/resources/generations/image';
import { serverEnv } from '@/lib/env';
import { replaceMentions } from '@/lib/handles';
import { getLumaClient } from '@/lib/luma';
import { stubCreationImage } from '@/lib/luma-stub';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow, CreationRow } from '@/lib/supabase/types';
import type { CreateAspect, CreateMode, CreationView } from '@/types/creation';

export const CREATIONS_PAGE_SIZE = 24;

const NEGATIVE_TERMS =
  'no text, no logos, no watermark, no extra limbs, no deformed hands, no warped face, no plastic skin';

export interface RenderRequest {
  mode: CreateMode;
  prompt: string;
  aspect: CreateAspect;
  persona: Pick<AiModelRow, 'portrait_url'> | null;
  /** Edit only: the asset being modified, taken from a creation row. */
  sourceUrl?: string;
}

/**
 * The exact Luma request for a Create render. Pure, so the face lock and the
 * edit source can be asserted without calling the paid API.
 * - A mentioned persona locks identity through character_ref; the handle is
 *   replaced in the prompt so it is never drawn as text.
 * - Edit sends the source as modify_image_ref at full weight: change only what
 *   the prompt asks for.
 */
export function buildRenderRequest(req: RenderRequest): ImageCreateParams {
  if (req.mode === 'edit' && !req.sourceUrl) {
    throw new Error('Edit needs a source image.');
  }
  const text = replaceMentions(req.prompt.trim());
  const prompt =
    req.mode === 'edit'
      ? `${text}. Keep everything else in the image unchanged. ${NEGATIVE_TERMS}.`
      : `${text}. Photorealistic. ${NEGATIVE_TERMS}.`;
  return {
    model: 'photon-1',
    prompt,
    aspect_ratio: req.aspect,
    sync: true,
    sync_timeout: 120,
    ...(req.persona
      ? { character_ref: { identity0: { images: [req.persona.portrait_url] } } }
      : {}),
    ...(req.mode === 'edit' ? { modify_image_ref: { url: req.sourceUrl, weight: 1 } } : {}),
  };
}

/** Renders one image. LUMA_STUB=1 returns a deterministic placeholder. */
export async function renderCreation(
  req: RenderRequest,
): Promise<{ url: string; generationId: string }> {
  const params = buildRenderRequest(req);
  if (serverEnv.LUMA_STUB) {
    return stubCreationImage(
      `${req.mode}|${req.aspect}|${params.prompt}|${req.sourceUrl ?? ''}`,
      req.aspect,
    );
  }
  const result = await getLumaClient().generations.image.create(params);
  const url = result.assets?.image;
  if (!url || !result.id) {
    throw new Error(
      `Luma render incomplete: ${result.failure_reason ?? 'no image URL or generation id returned'}`,
    );
  }
  return { url, generationId: result.id };
}

/**
 * Records a paid result. Service role, because 0032 grants authenticated users
 * no INSERT: only the server, after charging credits, may create a row.
 */
export async function insertCreation(row: {
  id: string;
  workspaceId: string;
  mode: CreateMode;
  prompt: string;
  personaId: string | null;
  sourceCreationId: string | null;
  aspect: CreateAspect;
  assetUrl: string;
  generationId: string;
  creditsSpent: number;
}): Promise<CreationRow> {
  const { data, error } = await getSupabaseAdminClient()
    .from('creations')
    .insert({
      id: row.id,
      workspace_id: row.workspaceId,
      mode: row.mode,
      prompt: row.prompt,
      persona_id: row.personaId,
      source_creation_id: row.sourceCreationId,
      aspect_ratio: row.aspect,
      asset_url: row.assetUrl,
      generation_id: row.generationId,
      credits_spent: row.creditsSpent,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to save creation: ${error?.message ?? 'no row returned'}`);
  }
  return data;
}

/** A creation in the caller's workspace (session client: RLS applies too). */
export async function getCreation(workspaceId: string, id: string): Promise<CreationRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('creations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to read creation: ${error.message}`);
  return data;
}

export async function listCreations(
  workspaceId: string,
  limit = CREATIONS_PAGE_SIZE,
): Promise<CreationRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('creations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list creations: ${error.message}`);
  return data ?? [];
}

export function toCreationView(
  row: CreationRow,
  personas: readonly Pick<AiModelRow, 'id' | 'name'>[],
): CreationView {
  return {
    id: row.id,
    mode: row.mode,
    prompt: row.prompt,
    personaName: personas.find((p) => p.id === row.persona_id)?.name ?? null,
    sourceCreationId: row.source_creation_id,
    aspect: row.aspect_ratio,
    assetUrl: row.asset_url,
    creditsSpent: row.credits_spent,
    createdAt: row.created_at,
    saved: true,
  };
}
