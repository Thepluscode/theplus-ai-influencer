import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { ContentPackItemRow, PostRow } from '@/lib/supabase/types';
import type { Platform, PostBriefInput, PostFormat } from '@/types/post';
import { packItemToPlainText } from '@/lib/content-repackage-schema';
import { CHANNELS } from '@/lib/content-sources-schema';

// ---------------------------------------------------------------------------
// Content OS — distribution bridge.
// ---------------------------------------------------------------------------
// Turns an approved pack item into a draft `posts` row so it flows through the
// existing Calendar / Zernio / review-link machinery. Content OS sources are
// NOT tied to an AI model, so we insert with model_id = null directly rather
// than via saveDraftPost() (which is model-centric).
// ---------------------------------------------------------------------------

const CHANNEL_TO_PLATFORMS: Record<string, Platform[]> = {
  linkedin: ['linkedin'],
  x_thread: ['twitter'],
  instagram_carousel: ['instagram'],
  tiktok_reels: ['tiktok'],
  youtube_short: ['youtube'],
  // newsletter / blog_aeo / email_sequence / captions / sales_snippets have no
  // native social target — they schedule as calendar entries only.
};

export function channelToPlatforms(channel: string): Platform[] {
  return CHANNEL_TO_PLATFORMS[channel] ?? [];
}

function channelToFormat(channel: string): PostFormat {
  if (channel === 'tiktok_reels' || channel === 'youtube_short') return 'portrait';
  return 'square';
}

function channelLabel(channel: string): string {
  return CHANNELS.find((c) => c.key === channel)?.label ?? channel;
}

/**
 * Create a draft post from a pack item. Returns the new post. Caption is the
 * channel-flattened body; platforms map from the channel (empty for non-social
 * channels, which still get a calendar draft).
 */
export async function createDraftFromPackItem(
  workspaceId: string,
  item: ContentPackItemRow,
): Promise<PostRow> {
  const caption = packItemToPlainText(item.channel, item.body).trim();
  const platforms = channelToPlatforms(item.channel);
  const format = channelToFormat(item.channel);
  const name = `Content OS · ${channelLabel(item.channel)}`;

  // prompt_inputs is stored as jsonb; build a complete brief-shaped object.
  // modelId is empty (no AI model backs a repurposed source) — it lives only
  // in the jsonb payload, never in the model_id FK column.
  const brief: PostBriefInput = {
    modelId: '',
    name,
    platforms,
    format,
    brief: (caption || name).slice(0, 800),
    scene: '',
    outfit: '',
    props: '',
    brandTone: 'professional',
    cta: 'no_cta',
    productRefUrls: [],
    postGoal: 'engagement',
    lighting: 'natural',
  };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('posts')
    .insert({
      workspace_id: workspaceId,
      model_id: null,
      name,
      status: 'draft',
      platforms,
      format,
      prompt_inputs: brief,
      variants: [],
      caption: caption || null,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to create draft from pack item: ${error?.message ?? 'no row'}`);
  }
  return data;
}
