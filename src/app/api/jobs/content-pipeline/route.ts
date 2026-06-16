import { type NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { claimContentJob, reclaimStalledContentJobs } from '@/lib/content-jobs';
import { runExtractJob, runMediaJob, runRepackageJob } from '@/lib/content-pipeline';

export const runtime = 'nodejs';
// Extraction/transcription/repackage each make one OpenAI call; transcription
// of a 25 MB file can take a while. Keep the function alive long enough.
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Cron worker for the Content OS pipeline.
 *
 * Authentication: either
 *   - `Authorization: Bearer ${CRON_SECRET}` (production cron)
 *   - `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` (manual curl / scripts)
 *
 * Behavior per tick:
 *   1. Reclaim any job stuck > 6 min (crashed worker recovery).
 *   2. Claim the oldest pending/processing job (atomic, SKIP LOCKED).
 *   3. If nothing claimed → `{ ran: false }`.
 *   4. Dispatch by kind: extract → repackage → media. Each processor charges
 *      credits before its paid call and refunds on failure.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!isAuthorized(authHeader)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    await reclaimStalledContentJobs();
  } catch (err) {
    // Non-fatal — the next tick retries reclaim.
    console.warn('[content-pipeline] reclaim failed:', toMessage(err));
  }

  let job;
  try {
    job = await claimContentJob();
  } catch (err) {
    return NextResponse.json({ error: 'claim failed', detail: toMessage(err) }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ ran: false, reason: 'empty queue' });
  }

  try {
    const outcome =
      job.kind === 'extract'
        ? await runExtractJob(job)
        : job.kind === 'repackage'
          ? await runRepackageJob(job)
          : await runMediaJob(job);

    return NextResponse.json({
      ran: true,
      jobId: job.id,
      kind: job.kind,
      status: outcome.ok ? 'completed' : 'failed',
      detail: outcome.detail,
      ...(outcome.ok ? {} : { reason: outcome.reason }),
    });
  } catch (err) {
    // A processor threw outside its own try/catch — the job is left claimed
    // and will be reclaimed after the stall window. Surface a 500.
    const detail = toMessage(err);
    console.error('[content-pipeline] processor crashed', { jobId: job.id, kind: job.kind, detail });
    return NextResponse.json({ ran: true, jobId: job.id, status: 'error', error: detail }, { status: 500 });
  }
}

function isAuthorized(header: string): boolean {
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return false;
  if (serverEnv.CRON_SECRET && token === serverEnv.CRON_SECRET) return true;
  if (serverEnv.SUPABASE_SERVICE_ROLE_KEY && token === serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    return true;
  }
  return false;
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'unknown error';
  }
}
