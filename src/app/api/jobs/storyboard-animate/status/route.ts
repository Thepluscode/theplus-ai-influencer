import { type NextRequest, NextResponse } from 'next/server';
import { getLatestJobForStoryboard } from '@/lib/storyboard-jobs';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Client-facing job status endpoint. The UI polls this every few
 * seconds while an animation is in flight. RLS scopes the query to the
 * caller's workspace, so an attacker can't peek at someone else's job.
 *
 * Response shape kept small — the page only needs status + progress to
 * render a progress bar and call router.refresh() on completion.
 */
export async function GET(req: NextRequest) {
  const storyboardId = req.nextUrl.searchParams.get('storyboardId');
  if (!storyboardId) {
    return NextResponse.json({ error: 'storyboardId required' }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  // Touch the workspace so RLS context is hydrated for the read below.
  await getOrCreateCurrentWorkspace(user);

  const job = await getLatestJobForStoryboard(storyboardId);
  if (!job) {
    return NextResponse.json({ status: 'none' });
  }
  return NextResponse.json({
    status: job.status,
    shotsCompleted: job.shots_completed,
    shotsTotal: job.shots_total,
    lastError: job.last_error,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  });
}
