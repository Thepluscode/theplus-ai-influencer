import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { Database, PostRow } from '@/lib/supabase/types';
import type { PostBriefInput, PostVariant } from '@/types/post';

type PostUpdate = Database['public']['Tables']['posts']['Update'];

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
    .is('scheduled_for', null)
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

interface UpdateScheduleOpts {
  caption?: string | null;
  zernioPostId?: string | null;
}

export async function updatePostSchedule(
  postId: string,
  scheduledFor: Date | null,
  opts: UpdateScheduleOpts = {},
): Promise<PostRow> {
  const supabase = await getSupabaseServerClient();
  const update: PostUpdate = {
    scheduled_for: scheduledFor ? scheduledFor.toISOString() : null,
    status: scheduledFor ? 'scheduled' : 'draft',
  };
  if (opts.caption !== undefined) update.caption = opts.caption;
  if (opts.zernioPostId !== undefined) update.zernio_post_id = opts.zernioPostId;

  const { data, error } = await supabase
    .from('posts')
    .update(update)
    .eq('id', postId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update post schedule: ${error?.message ?? 'no row returned'}`);
  }
  return data;
}

export async function getPostById(postId: string): Promise<PostRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
  if (error) {
    throw new Error(`Failed to load post: ${error.message}`);
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

// -----------------------------------------------------------------------------
// Public share links
// -----------------------------------------------------------------------------

/**
 * Generate (or return existing) share token for a post the caller owns.
 * RLS on UPDATE already restricts this to the workspace owner.
 */
export async function enablePostSharing(postId: string): Promise<string> {
  const supabase = await getSupabaseServerClient();

  const existing = await supabase
    .from('posts')
    .select('share_token')
    .eq('id', postId)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Failed to load post for share: ${existing.error.message}`);
  }
  if (!existing.data) {
    throw new Error('Post not found.');
  }
  if (existing.data.share_token) {
    return existing.data.share_token;
  }

  const token = crypto.randomUUID();
  const { error } = await supabase.from('posts').update({ share_token: token }).eq('id', postId);

  if (error) {
    throw new Error(`Failed to enable sharing: ${error.message}`);
  }
  return token;
}

export async function disablePostSharing(postId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from('posts').update({ share_token: null }).eq('id', postId);
  if (error) {
    throw new Error(`Failed to disable sharing: ${error.message}`);
  }
}

/**
 * Public-facing read by share token. Relies on the
 * "anyone can read shared posts" RLS policy added in 0004_post_share_token.sql
 * — the anon client cannot see non-shared rows even with this query.
 */
export async function getPostByShareToken(token: string): Promise<PostRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('share_token', token)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load shared post: ${error.message}`);
  }
  return data;
}
