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
  /** Minted by the caller so the debit and any refund share the job's id as their ref. */
  id: string;
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
      id: input.id,
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

/**
 * Release this worker's claim without changing status — next cron tick can
 * re-pick. Matches on the claim token so a late worker cannot release a
 * newer worker's claim.
 */
export async function releaseJobClaim(jobId: string, claimedAt: string | null): Promise<void> {
  if (!claimedAt) return;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('storyboard_render_jobs')
    .update({ claimed_at: null })
    .eq('id', jobId)
    .eq('claimed_at', claimedAt);
  if (error) throw new Error(`Failed to release claim: ${error.message}`);
}

export type RecordShotResult = 'progress' | 'completed' | 'stale' | 'missing';

/**
 * Save the storyboard's shots and advance the job in ONE transaction
 * (migration 0037), so shots_completed always matches the saved work.
 * Fenced by the worker's claim token: 'stale' means another worker owns the
 * job (or it finished) and nothing was written.
 */
export async function recordRenderShot(
  jobId: string,
  claimedAt: string | null,
  shots: unknown,
): Promise<RecordShotResult> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await rpc(supabase, 'record_storyboard_render_shot', {
    p_job_id: jobId,
    p_claimed_at: claimedAt,
    p_shots: shots,
  });
  if (error) throw new Error(`Failed to record shot progress: ${error.message}`);
  if (data === 'progress' || data === 'completed' || data === 'stale' || data === 'missing') {
    return data;
  }
  throw new Error(`Unexpected shot record result: ${String(data)}`);
}

/** Flip this worker's job to completed (the no-pending-shots path). */
export async function markJobCompleted(jobId: string, claimedAt: string | null): Promise<void> {
  if (!claimedAt) return;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('storyboard_render_jobs')
    .update({
      status: 'completed',
      claimed_at: null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    // Only while this worker still holds it, and never over a failed job.
    .eq('claimed_at', claimedAt)
    .in('status', ['pending', 'processing']);
  if (error) throw new Error(`Failed to mark job completed: ${error.message}`);
}

/**
 * Fail the job and refund what it charged for but did not deliver, in ONE
 * transaction (migration 0037). Returns the credits refunded, or null when
 * this worker's claim is stale (nothing changed). Safe to repeat, so it is
 * retried in-request; throws only if every attempt errored, leaving the job
 * claimable for the stalled-job sweep.
 */
export async function failJobWithRefund(input: {
  job: Pick<StoryboardRenderJobRow, 'id' | 'claimed_at'>;
  error: string;
  attempts?: number;
}): Promise<number | null> {
  const { job } = input;
  const supabase = getSupabaseAdminClient();
  let lastError = '';
  for (let attempt = 0; attempt < (input.attempts ?? 3); attempt += 1) {
    const { data, error } = await rpc(supabase, 'fail_storyboard_render_job', {
      p_job_id: job.id,
      p_claimed_at: job.claimed_at,
      p_error: input.error,
    });
    if (!error) return typeof data === 'number' ? data : null;
    lastError = error.message;
  }
  throw new Error(`Failed to fail and refund render job: ${lastError}`);
}

function rpc(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  return (
    supabase.rpc as unknown as (
      this: typeof supabase,
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  ).call(supabase, fn, args);
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
