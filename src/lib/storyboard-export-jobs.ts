import 'server-only';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { StoryboardExportJobRow } from '@/lib/supabase/types';
import { STORYBOARD_EXPORT_BUCKET, type RenderedMp4 } from '@/lib/storyboard-export';

export async function enqueueStoryboardExport(input: {
  workspaceId: string;
  storyboardId: string;
}): Promise<StoryboardExportJobRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .rpc('enqueue_storyboard_export', {
      p_workspace_id: input.workspaceId,
      p_storyboard_id: input.storyboardId,
    })
    .single();
  if (error || !data) {
    throw new Error(`Failed to queue MP4 export: ${error?.message ?? 'no row'}`);
  }
  return data;
}

export async function claimNextStoryboardExportJob(): Promise<StoryboardExportJobRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await (
    supabase.rpc as unknown as (
      this: typeof supabase,
      fn: string,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  ).call(supabase, 'claim_storyboard_export_job');
  if (error) throw new Error(`Failed to claim MP4 export: ${error.message}`);
  const row = (data ?? null) as StoryboardExportJobRow | null;
  return row?.id ? row : null;
}

export async function reclaimStalledStoryboardExportJobs(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await (
    supabase.rpc as unknown as (
      this: typeof supabase,
      fn: string,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  ).call(supabase, 'reclaim_stalled_storyboard_export_jobs');
  if (error) throw new Error(`Failed to reclaim MP4 exports: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}

export async function getLatestStoryboardExportJob(
  storyboardId: string,
): Promise<StoryboardExportJobRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('storyboard_export_jobs')
    .select('*')
    .eq('storyboard_id', storyboardId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load MP4 export: ${error.message}`);
  return data;
}

export async function getStoryboardExportForDownload(input: {
  jobId: string;
  storyboardId: string;
  workspaceId: string;
}): Promise<StoryboardExportJobRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('storyboard_export_jobs')
    .select('*')
    .eq('id', input.jobId)
    .eq('storyboard_id', input.storyboardId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Failed to authorize MP4 download: ${error.message}`);
  return data;
}

export async function isStoryboardExportApprovalCurrent(
  job: StoryboardExportJobRow,
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('storyboards')
    .select('review_status,review_version')
    .eq('id', job.storyboard_id)
    .eq('workspace_id', job.workspace_id)
    .maybeSingle();
  if (error) throw new Error(`Failed to recheck storyboard approval: ${error.message}`);
  return Boolean(
    data &&
    data.review_version === job.review_version &&
    (data.review_status === 'approved' || data.review_status === 'final'),
  );
}

export async function uploadStoryboardExport(
  job: StoryboardExportJobRow,
  contents: Buffer,
): Promise<string> {
  const outputPath = storyboardExportOutputPath(job);
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(STORYBOARD_EXPORT_BUCKET)
    .upload(outputPath, contents, {
      contentType: 'video/mp4',
      cacheControl: '3600',
      upsert: true,
    });
  if (error) throw new Error(`Failed to store MP4 export: ${error.message}`);
  return outputPath;
}

export async function markStoryboardExportCompleted(
  jobId: string,
  outputPath: string,
  rendered: RenderedMp4,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )('complete_storyboard_export', {
    p_job_id: jobId,
    p_output_path: outputPath,
    p_output_bytes: rendered.bytes,
    p_output_duration_ms: rendered.durationMs,
    p_output_width: rendered.width,
    p_output_height: rendered.height,
    p_has_audio: rendered.hasAudio,
  });
  if (error) throw new Error(`Failed to complete MP4 export: ${error.message}`);
}

export function storyboardExportOutputPath(job: StoryboardExportJobRow): string {
  return `${job.workspace_id}/${job.storyboard_id}/${job.id}.mp4`;
}

export async function releaseStoryboardExportForRetry(
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('storyboard_export_jobs')
    .update({
      status: 'queued',
      claimed_at: null,
      last_error: errorMessage.slice(0, 1000),
    })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to requeue MP4 export: ${error.message}`);
}

export async function markStoryboardExportFailed(
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('storyboard_export_jobs')
    .update({
      status: 'failed',
      claimed_at: null,
      completed_at: new Date().toISOString(),
      last_error: errorMessage.slice(0, 1000),
    })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to mark MP4 export failed: ${error.message}`);
}

export async function removeStoryboardExportObject(outputPath: string | null): Promise<void> {
  if (!outputPath) return;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage.from(STORYBOARD_EXPORT_BUCKET).remove([outputPath]);
  if (error) throw new Error(`Failed to clean up MP4 export: ${error.message}`);
}

export async function createStoryboardExportDownloadUrl(outputPath: string): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(STORYBOARD_EXPORT_BUCKET)
    .createSignedUrl(outputPath, 300, { download: true });
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign MP4 download: ${error?.message ?? 'no URL'}`);
  }
  return data.signedUrl;
}
