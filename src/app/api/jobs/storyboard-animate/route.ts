import { type NextRequest, NextResponse } from 'next/server';
import { refundCredits } from '@/lib/credits';
import { serverEnv } from '@/lib/env';
import { animateSingleShot, type RenderedShot } from '@/lib/storyboard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  claimNextRenderJob,
  markJobCompleted,
  markJobFailed,
  reclaimStalledJobs,
  recordShotProgress,
  releaseJobClaim,
} from '@/lib/storyboard-jobs';
import type { PostFormat } from '@/types/post';

export const runtime = 'nodejs';
// Each tick processes ONE shot. Luma video is ~60-90s, and Luma client
// polling sleeps in 5s intervals — keep the function alive long enough.
export const maxDuration = 120;
// Don't cache this — every call must hit the queue fresh.
export const dynamic = 'force-dynamic';

/**
 * Cron worker for animate-to-video.
 *
 * Authentication: either
 *   - `Authorization: Bearer ${CRON_SECRET}` (production cron)
 *   - `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` (manual curl / scripts)
 *
 * Behavior per tick:
 *   1. Reclaim any job stuck > 6 min (crashed worker recovery).
 *   2. Claim the oldest pending/processing job (atomic, SKIP LOCKED).
 *   3. If nothing claimed → return `{ ran: false }`.
 *   4. Otherwise: fetch the storyboard row, find the next shot missing
 *      a videoUrl, run Luma Dream Machine for that one shot, save the
 *      updated shots array, bump shots_completed, release the claim.
 *   5. When shots_completed === shots_total, mark the job completed.
 *
 * On Luma failure: refund the proportional remaining credits and flip
 * the job to `failed`. Already-rendered shots stay saved.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!isAuthorized(authHeader)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Step 1: recover any stalled jobs before claiming.
  try {
    await reclaimStalledJobs();
  } catch (err) {
    // Reclaim failure is non-fatal — log and continue. Worst case the
    // next tick retries reclaim.
    console.warn('[storyboard-animate] reclaim failed:', toMessage(err));
  }

  // Step 2: claim a job.
  let job;
  try {
    job = await claimNextRenderJob();
  } catch (err) {
    return NextResponse.json({ error: 'claim failed', detail: toMessage(err) }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ ran: false, reason: 'empty queue' });
  }

  // Step 3: load the storyboard. If it was deleted under us, fail the job.
  const admin = getSupabaseAdminClient();
  const { data: sb, error: sbErr } = await admin
    .from('storyboards')
    .select('*')
    .eq('id', job.storyboard_id)
    .maybeSingle();
  if (sbErr || !sb) {
    await markJobFailed(
      job.id,
      `Storyboard ${job.storyboard_id} not found.`,
      remainingCost(job.shots_total, job.shots_completed, job.cost_per_shot),
    );
    await refundCredits({
      workspaceId: job.workspace_id,
      amount: remainingCost(job.shots_total, job.shots_completed, job.cost_per_shot),
      refKind: 'storyboard',
      refId: job.storyboard_id,
    });
    return NextResponse.json({ ran: true, jobId: job.id, status: 'failed' });
  }

  const shots = (Array.isArray(sb.shots) ? sb.shots : []) as RenderedShot[];
  const target = shots.find((s) => !s.videoUrl);
  if (!target) {
    // No pending shots — this shouldn't happen with the claim filter,
    // but be defensive and mark completed.
    await markJobCompleted(job.id);
    return NextResponse.json({
      ran: true,
      jobId: job.id,
      status: 'completed',
      reason: 'no pending shots',
    });
  }

  // Step 4: animate one shot.
  let animated: RenderedShot;
  try {
    animated = await animateSingleShot({
      shot: target,
      format: sb.format as PostFormat,
    });
  } catch (err) {
    const refundAmount = remainingCost(job.shots_total, job.shots_completed, job.cost_per_shot);
    const msg = toMessage(err);
    await markJobFailed(job.id, msg, refundAmount);
    if (refundAmount > 0) {
      await refundCredits({
        workspaceId: job.workspace_id,
        amount: refundAmount,
        refKind: 'storyboard',
        refId: job.storyboard_id,
      });
    }
    return NextResponse.json(
      { ran: true, jobId: job.id, status: 'failed', error: msg },
      { status: 200 },
    );
  }

  // Step 5: merge back, save, advance progress.
  const merged = shots.map((s) => (s.index === animated.index ? animated : s));
  const { error: saveErr } = await admin
    .from('storyboards')
    .update({ shots: merged })
    .eq('id', sb.id);
  if (saveErr) {
    // Save failed but Luma already charged us for this render. Release
    // the claim so the next tick retries — the unchanged shots array
    // still has the same target shot pending.
    await releaseJobClaim(job.id);
    return NextResponse.json(
      { ran: true, jobId: job.id, status: 'save_failed', error: saveErr.message },
      { status: 500 },
    );
  }

  const completed = job.shots_completed + 1;
  if (completed >= job.shots_total) {
    await markJobCompleted(job.id);
    return NextResponse.json({
      ran: true,
      jobId: job.id,
      status: 'completed',
      shotsCompleted: completed,
      shotsTotal: job.shots_total,
    });
  }

  await recordShotProgress(job.id, completed);
  return NextResponse.json({
    ran: true,
    jobId: job.id,
    status: 'processing',
    shotsCompleted: completed,
    shotsTotal: job.shots_total,
  });
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

function remainingCost(shotsTotal: number, shotsCompleted: number, costPerShot: number): number {
  return Math.max(0, (shotsTotal - shotsCompleted) * costPerShot);
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
