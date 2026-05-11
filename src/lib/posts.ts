import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { PostRow } from '@/lib/supabase/types';
import type { PostBriefInput, PostVariant } from '@/types/post';

interface SaveDraftInput {
  workspaceId: string;
  brief: PostBriefInput;
  variants: PostVariant[];
  caption?: string | null;
}

export async function saveDraftPost({
  workspaceId,
  brief,
  variants,
  caption = null,
}: SaveDraftInput): Promise<PostRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('posts')
    .insert({
      workspace_id: workspaceId,
      model_id: brief.modelId,
      name: brief.name,
      status: 'draft',
      platforms: [...brief.platforms],
      format: brief.format,
      prompt_inputs: brief,
      variants,
      caption,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save post draft: ${error?.message ?? 'no row returned'}`);
  }
  return data;
}

export async function listDraftPosts(workspaceId: string, limit = 20): Promise<PostRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list posts: ${error.message}`);
  }
  return data ?? [];
}
