import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { Database, ReviewCommentRow } from '@/lib/supabase/types';
import type { ReviewCommentFormInput, ReviewCommentStatus } from '@/lib/review-comments-schema';

type ReviewCommentInsert = Database['public']['Tables']['review_comments']['Insert'];

export async function listReviewCommentsForStoryboard(
  storyboardId: string,
  workspaceId: string,
): Promise<ReviewCommentRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('review_comments')
    .select('*')
    .eq('subject_type', 'storyboard')
    .eq('storyboard_id', storyboardId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to list storyboard review comments: ${error.message}`);
  }
  return data ?? [];
}

export async function listPublicReviewCommentsForPost(postId: string): Promise<ReviewCommentRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('review_comments')
    .select('*')
    .eq('subject_type', 'post')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to list public review comments: ${error.message}`);
  }
  return data ?? [];
}

export async function createStoryboardReviewComment(input: {
  workspaceId: string;
  storyboardId: string;
  comment: ReviewCommentFormInput;
}): Promise<ReviewCommentRow> {
  return insertReviewComment({
    workspace_id: input.workspaceId,
    subject_type: 'storyboard',
    storyboard_id: input.storyboardId,
    post_id: null,
    author_name: input.comment.authorName,
    author_email: input.comment.authorEmail,
    body: input.comment.body,
    status: 'open',
    shot_index: input.comment.shotIndex,
    variant_index: null,
    time_ms: input.comment.timeMs,
    anchor_x: input.comment.anchorX,
    anchor_y: input.comment.anchorY,
  });
}

export async function createPublicPostReviewComment(input: {
  workspaceId: string;
  postId: string;
  comment: ReviewCommentFormInput;
}): Promise<ReviewCommentRow> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('review_comments')
    .insert({
      workspace_id: input.workspaceId,
      subject_type: 'post',
      post_id: input.postId,
      storyboard_id: null,
      author_name: input.comment.authorName,
      author_email: input.comment.authorEmail,
      body: input.comment.body,
      status: 'open',
      shot_index: null,
      variant_index: input.comment.variantIndex,
      time_ms: input.comment.timeMs,
      anchor_x: input.comment.anchorX,
      anchor_y: input.comment.anchorY,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to add public review comment: ${error?.message ?? 'no row'}`);
  }
  return data;
}

export async function updateReviewCommentStatus(input: {
  id: string;
  workspaceId: string;
  status: ReviewCommentStatus;
}): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from('review_comments')
    .update({ status: input.status })
    .eq('id', input.id)
    .eq('workspace_id', input.workspaceId);

  if (error) {
    throw new Error(`Failed to update review comment: ${error.message}`);
  }
}

async function insertReviewComment(input: ReviewCommentInsert): Promise<ReviewCommentRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from('review_comments').insert(input).select('*').single();

  if (error || !data) {
    throw new Error(`Failed to add review comment: ${error?.message ?? 'no row'}`);
  }
  return data;
}
