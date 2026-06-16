import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { ContentJobRow } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Content OS — content_jobs queue DB layer.
// ---------------------------------------------------------------------------
// Mirrors storyboard-jobs.ts. Writers (enqueue/claim/release/complete/fail/
// reclaim) use the service-role admin client so RLS doesn't block worker
// writes. Read helpers (UI status polling) use the cookie-scoped client and
// rely on the SELECT policy in migration 0017.
// ---------------------------------------------------------------------------

type JobKind = ContentJobRow['kind'];

/** Insert a new pending job. Caller charges credits separately (cost_charged
 *  is bookkeeping for refunds, not a ledger write). */
export async function enqueueContentJob(input: {
  workspaceId: string;
  kind: JobKind;
  sourceId?: string | null;
  packId?: string | null;
  packItemId?: string | null;
  costCharged?: number;
}): Promise<ContentJobRow> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_jobs')
    .insert({
      workspace_id: input.workspaceId,
      kind: input.kind,
      source_id: input.sourceId ?? null,
      pack_id: input.packId ?? null,
      pack_item_id: input.packItemId ?? null,
      status: 'pending',
      cost_charged: input.costCharged ?? 0,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to enqueue content job: ${error?.message ?? 'no row'}`);
  }
  return data;
}

/** Atomic claim via the SECURITY DEFINER RPC from 0017. Null when empty. */
export async function claimContentJob(): Promise<ContentJobRow | null> {
  const supabase = getSupabaseAdminClient();
  const rpc = supabase.rpc as unknown as (
    fn: string,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc('claim_content_job');
  if (error) throw new Error(`Failed to claim content job: ${error.message}`);
  if (!data) return null;
  return data as ContentJobRow;
}

/** Free jobs whose worker died mid-run (claimed_at > 6 min old). */
export async function reclaimStalledContentJobs(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const rpc = supabase.rpc as unknown as (
    fn: string,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc('reclaim_stalled_content_jobs');
  if (error) throw new Error(`Failed to reclaim stalled content jobs: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}

/** Release a claim without changing status — next tick re-picks it. */
export async function releaseContentJobClaim(jobId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('content_jobs')
    .update({ claimed_at: null })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to release content job claim: ${error.message}`);
}

export async function markContentJobCompleted(jobId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('content_jobs')
    .update({ status: 'completed', claimed_at: null, completed_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to mark content job completed: ${error.message}`);
}

export async function markContentJobFailed(
  jobId: string,
  errorMessage: string,
  costRefunded = 0,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('content_jobs')
    .update({
      status: 'failed',
      claimed_at: null,
      last_error: errorMessage.slice(0, 1000),
      cost_refunded: costRefunded,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to mark content job failed: ${error.message}`);
}

/** Re-queue a failed job (retry). Resets status + clears error/claim. */
export async function requeueContentJob(jobId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('content_jobs')
    .update({ status: 'pending', claimed_at: null, started_at: null, completed_at: null })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to requeue content job: ${error.message}`);
}

/** RLS-scoped read for the retry action ownership check. */
export async function getContentJob(jobId: string): Promise<ContentJobRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load content job: ${error.message}`);
  return data;
}

/** Active (pending/processing) jobs for the workspace — drives the UI panel. */
export async function listActiveContentJobs(workspaceId: string): Promise<ContentJobRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) throw new Error(`Failed to list active content jobs: ${error.message}`);
  return data ?? [];
}

/** Recent jobs for a single source — drives the source-detail status strip. */
export async function listJobsForSource(sourceId: string): Promise<ContentJobRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_jobs')
    .select('*')
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) throw new Error(`Failed to list source jobs: ${error.message}`);
  return data ?? [];
}
