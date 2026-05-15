import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { StoryboardRow } from '@/lib/supabase/types';
import type { RenderedShot } from '@/lib/storyboard';
import type { PostFormat } from '@/types/post';

export async function saveStoryboard(input: {
  workspaceId: string;
  modelId: string | null;
  name: string;
  brief: string;
  format: PostFormat;
  summary: string | null;
  shots: RenderedShot[];
}): Promise<StoryboardRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('storyboards')
    .insert({
      workspace_id: input.workspaceId,
      model_id: input.modelId,
      name: input.name,
      brief: input.brief,
      format: input.format,
      summary: input.summary,
      shots: input.shots,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to save storyboard: ${error?.message ?? 'no row'}`);
  }
  return data;
}

export async function listStoryboards(workspaceId: string): Promise<StoryboardRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('storyboards')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list storyboards: ${error.message}`);
  }
  return data ?? [];
}

export async function getStoryboard(id: string): Promise<StoryboardRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('storyboards')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load storyboard: ${error.message}`);
  }
  return data;
}

export async function deleteStoryboard(id: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from('storyboards').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete storyboard: ${error.message}`);
  }
}

/** Replace the entire `shots` array — used by the animate-to-video flow. */
export async function updateStoryboardShots(
  id: string,
  shots: RenderedShot[],
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from('storyboards')
    .update({ shots })
    .eq('id', id);
  if (error) {
    throw new Error(`Failed to update storyboard shots: ${error.message}`);
  }
}
