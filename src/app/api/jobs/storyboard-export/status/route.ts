import { type NextRequest, NextResponse } from 'next/server';
import { getLatestStoryboardExportJob } from '@/lib/storyboard-export-jobs';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const storyboardId = req.nextUrl.searchParams.get('storyboardId');
  if (!storyboardId) {
    return NextResponse.json({ error: 'storyboardId required' }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  await getOrCreateCurrentWorkspace(user);

  const job = await getLatestStoryboardExportJob(storyboardId);
  if (!job) return NextResponse.json({ status: 'none' });
  return NextResponse.json({
    id: job.id,
    status: job.status,
    reviewVersion: job.review_version,
    lastError: job.last_error,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    bytes: job.output_bytes,
    durationMs: job.output_duration_ms,
    width: job.output_width,
    height: job.output_height,
    hasAudio: job.has_audio,
    captionsBurnedIn: job.captions_burned_in,
  });
}
