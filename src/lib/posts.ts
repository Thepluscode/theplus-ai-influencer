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

/**
 * All scheduled posts within an inclusive date range, plus the unscheduled
 * drafts (returned in a separate field so the UI can surface them in a
 * "promote a draft" shelf above the calendar grid).
 */
export async function listPostsInRange(
  workspaceId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ scheduled: PostRow[]; drafts: PostRow[] }> {
  const supabase = await getSupabaseServerClient();

  const [scheduled, drafts] = await Promise.all([
    supabase
      .from('posts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .not('scheduled_for', 'is', null)
      .gte('scheduled_for', rangeStart.toISOString())
      .lte('scheduled_for', rangeEnd.toISOString())
      .order('scheduled_for', { ascending: true }),
    supabase
      .from('posts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('scheduled_for', null)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (scheduled.error) {
    throw new Error(`Failed to list scheduled posts: ${scheduled.error.message}`);
  }
  if (drafts.error) {
    throw new Error(`Failed to list draft posts: ${drafts.error.message}`);
  }

  return { scheduled: scheduled.data ?? [], drafts: drafts.data ?? [] };
}

export async function updatePostSchedule(
  postId: string,
  scheduledFor: Date | null,
  caption?: string | null,
): Promise<PostRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('posts')
    .update({
      scheduled_for: scheduledFor ? scheduledFor.toISOString() : null,
      status: scheduledFor ? 'scheduled' : 'draft',
      ...(caption !== undefined ? { caption } : {}),
    })
    .eq('id', postId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update post schedule: ${error?.message ?? 'no row returned'}`);
  }
  return data;
}

export async function deletePost(postId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) {
    throw new Error(`Failed to delete post: ${error.message}`);
  }
}
