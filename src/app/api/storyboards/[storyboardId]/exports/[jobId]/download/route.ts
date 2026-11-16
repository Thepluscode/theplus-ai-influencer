import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createStoryboardExportDownloadUrl,
  getStoryboardExportForDownload,
} from '@/lib/storyboard-export-jobs';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  storyboardId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storyboardId: string; jobId: string }> },
) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const workspace = await getOrCreateCurrentWorkspace(user);
  const job = await getStoryboardExportForDownload({
    jobId: parsed.data.jobId,
    storyboardId: parsed.data.storyboardId,
    workspaceId: workspace.id,
  });
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (job.status !== 'completed' || !job.output_path) {
    return NextResponse.json({ error: 'export is not ready' }, { status: 409 });
  }

  const response = NextResponse.redirect(
    await createStoryboardExportDownloadUrl(job.output_path),
    302,
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
