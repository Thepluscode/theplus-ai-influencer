import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { StoryboardRenderJobRow } from '@/lib/supabase/types';

/**
 * DB layer for the animate-to-video job queue.
 *
 * Writers (enqueue / claim / release / complete / fail / reclaim) all
 * use the service-role admin client so RLS doesn't block worker writes.
 * The read helpers (status polling) use the cookie-scoped client so we
 * stay inside the user's workspace and depend on the SELECT policy
 * defined in migration 0011.
 */

/** Insert a new pending job. Caller must have already charged credits. */
export async function enqueueAnimationJob(input: {
  workspaceId: string;
  storyboardId: string;
  shotsTotal: number;
  costPerShot: number;
  costChargedTotal: number;
}): Promise<StoryboardRenderJobRow> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('storyboard_render_jobs')
    .insert({
      workspace_id: input.workspaceId,
      storyboard_id: input.storyboardId,
      status: 'pending',
      shots_total: input.shotsTotal,
      shots_completed: 0,
      cost_charged_total: input.costChargedTotal,
      cost_per_shot: input.costPerShot,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to enqueue render job: ${error?.message ?? 'no row'}`);
  }
  return data;
}

/**
 * Claim the oldest pending/processing job that has no active lock. Uses
 * the SECURITY DEFINER RPC defined in 0011 to atomically pick + lock.
 * Returns null when the queue is empty.
 *
 * NOTE: the hand-written Database type doesn't declare custom RPCs so
 * we cast `.rpc` to a loose signature here. When we regenerate types
 * with `supabase gen types typescript`, this cast can go away.
 */
export async function claimNextRenderJob(): Promise<StoryboardRenderJobRow | null> {
  const supabase = getSupabaseAdminClient();
  // Call rpc as a bound method — detaching it (`const rpc = supabase.rpc`)
  // loses `this`, so the admin client's internal `this.rest` is undefined.
  const { data, error } = await (
    supabase.rpc as unknown as (
      this: typeof supabase,
      fn: string,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  ).call(supabase, 'claim_storyboard_render_job');
  if (error) {
    throw new Error(`Failed to claim render job: ${error.message}`);
  }
  // A plpgsql function `returns storyboard_render_jobs` yields a ROW OF NULLS
  // (not SQL NULL) on an empty queue — guard on a real id, not truthiness.
  const row = (data ?? null) as StoryboardRenderJobRow | null;
  if (!row || !row.id) return null;
  return row;
}

/** Release a claim without changing status — next cron tick can re-pick. */
export async function releaseJobClaim(jobId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('storyboard_render_jobs')
    .update({ claimed_at: null })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to release claim: ${error.message}`);
}

/** Increment shots_completed and clear the claim so the next tick continues. */
export async function recordShotProgress(jobId: string, shotsCompleted: number): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('storyboard_render_jobs')
    .update({
      shots_completed: shotsCompleted,
      claimed_at: null,
    })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to record shot progress: ${error.message}`);
}

/** Flip job to completed. Called after the last shot lands. */
export async function markJobCompleted(jobId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('storyboard_render_jobs')
    .update({
      status: 'completed',
      claimed_at: null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to mark job completed: ${error.message}`);
}

/**
 * Flip job to failed and record refund amount. Caller is responsible for
 * actually crediting the workspace via refundCredits() — this just
 * captures the bookkeeping on the job row.
 */
export async function markJobFailed(
  jobId: string,
  errorMessage: string,
  costRefunded: number,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('storyboard_render_jobs')
    .update({
      status: 'failed',
      claimed_at: null,
      last_error: errorMessage.slice(0, 1000),
      cost_refunded: costRefunded,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to mark job failed: ${error.message}`);
}

/** Unstick jobs whose worker died mid-shot (claimed_at > 6 min old). */
export async function reclaimStalledJobs(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await (
    supabase.rpc as unknown as (
      this: typeof supabase,
      fn: string,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  ).call(supabase, 'reclaim_stalled_storyboard_render_jobs');
  if (error) {
    throw new Error(`Failed to reclaim stalled jobs: ${error.message}`);
  }
  return typeof data === 'number' ? data : 0;
}

/**
 * Latest job for a storyboard, scoped to the caller's workspace via RLS.
 * Used by the status-poll endpoint that the UI hits every few seconds.
 */
export async function getLatestJobForStoryboard(
  storyboardId: string,
): Promise<StoryboardRenderJobRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('storyboard_render_jobs')
    .select('*')
    .eq('storyboard_id', storyboardId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load render job: ${error.message}`);
  }
  return data;
}

/**
 * Is there an in-flight job for this storyboard right now? Used by the
 * server action to refuse double-enqueue.
 */
export async function hasActiveJobForStoryboard(storyboardId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('storyboard_render_jobs')
    .select('id')
    .eq('storyboard_id', storyboardId)
    .in('status', ['pending', 'processing'])
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to check active jobs: ${error.message}`);
  }
  return Boolean(data);
}
