import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { ReviewDecisionRow } from '@/lib/supabase/types';
import type { ReviewDecisionFormInput } from '@/lib/review-approvals-schema';

export async function listReviewDecisionsForStoryboard(
  storyboardId: string,
  workspaceId: string,
): Promise<ReviewDecisionRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('review_decisions')
    .select('*')
    .eq('subject_type', 'storyboard')
    .eq('storyboard_id', storyboardId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list storyboard review decisions: ${error.message}`);
  }
  return data ?? [];
}

export async function listPublicReviewDecisionsForPost(
  postId: string,
): Promise<ReviewDecisionRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('review_decisions')
    .select('*')
    .eq('subject_type', 'post')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list public review decisions: ${error.message}`);
  }
  return data ?? [];
}

export async function recordStoryboardReviewDecision(input: {
  workspaceId: string;
  storyboardId: string;
  decision: ReviewDecisionFormInput;
}): Promise<ReviewDecisionRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .rpc('record_storyboard_review_decision', {
      p_workspace_id: input.workspaceId,
      p_storyboard_id: input.storyboardId,
      p_decision: input.decision.decision,
      p_reviewer_name: input.decision.reviewerName,
      p_reviewer_email: input.decision.reviewerEmail,
      p_summary: input.decision.summary,
    })
    .single();

  if (error || !data) {
    throw new Error(`Failed to record storyboard decision: ${error?.message ?? 'no row'}`);
  }
  return data;
}

export async function recordPublicPostReviewDecision(input: {
  workspaceId: string;
  postId: string;
  decision: ReviewDecisionFormInput;
}): Promise<ReviewDecisionRow> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .rpc('record_post_review_decision', {
      p_workspace_id: input.workspaceId,
      p_post_id: input.postId,
      p_decision: input.decision.decision,
      p_reviewer_name: input.decision.reviewerName,
      p_reviewer_email: input.decision.reviewerEmail,
      p_summary: input.decision.summary,
    })
    .single();

  if (error || !data) {
    throw new Error(`Failed to record public post decision: ${error?.message ?? 'no row'}`);
  }
  return data;
}
