import { type NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { animateSingleShot, type RenderedShot } from '@/lib/storyboard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  claimNextRenderJob,
  markJobCompleted,
  failJobWithRefund,
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

// A transient Luma failure (429/5xx/network) shouldn't kill the job — the SDK
// already backs off within a tick; we release for a few more ticks before
// giving up. The same budget bounds a job that keeps being reclaimed because
// the worker crashed mid-shot.
const MAX_RENDER_ATTEMPTS = 4;

/**
 * Claims that did not complete a shot, excluding the current one. `attempts`
 * is bumped by every claim — including the one per successful shot — so it
 * cannot be compared with the budget directly: a healthy 6-shot job would
 * exhaust it on successes alone.
 */
function unproductiveClaims(job: { attempts: number; shots_completed: number }): number {
  return Math.max(0, job.attempts - job.shots_completed - 1);
}

/**
 * Cron worker for animate-to-video.
 *
 * Authentication: `Authorization: Bearer ${CRON_SECRET}`.
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
 * the job to `failed`. Already-rendered shots stay saved. Refunds are keyed
 * on the job id, not the storyboard id: 0021 allows one refund per ref, and a
 * storyboard can be rendered (and fail) more than once.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!isCronAuthorized(authHeader)) {
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

  // Step 2b: a job reclaimed again and again without progress (a worker that
  // crashes mid-shot never reaches the failure path below) is failed and
  // refunded here, before another paid render is attempted.
  if (unproductiveClaims(job) >= MAX_RENDER_ATTEMPTS) {
    const reason = `Gave up after ${unproductiveClaims(job)} claims without progress.`;
    console.error('[storyboard-animate] retry budget exhausted', { jobId: job.id, reason });
    return failAndRefund(job.id, reason);
  }

  // Step 3: load the storyboard. If it was deleted under us, fail the job.
  const admin = getSupabaseAdminClient();
  const { data: sb, error: sbErr } = await admin
    .from('storyboards')
    .select('*')
    .eq('id', job.storyboard_id)
    .maybeSingle();
  if (sbErr || !sb) {
    return failAndRefund(job.id, `Storyboard ${job.storyboard_id} not found.`);
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
    const msg = toMessage(err);
    // Transient upstream failure → release for a bounded retry instead of
    // failing + refunding. Only on retryable errors and under the attempt cap;
    // anything else (or an exhausted job) falls through to the fail path.
    if (isTransientError(err) && unproductiveClaims(job) + 1 < MAX_RENDER_ATTEMPTS) {
      await releaseJobClaim(job.id);
      return NextResponse.json(
        { ran: true, jobId: job.id, status: 'retry', attempts: job.attempts, error: msg },
        { status: 200 },
      );
    }
    return failAndRefund(job.id, msg);
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

/**
 * Fail the job and refund its unproduced shots atomically. If that cannot be
 * recorded, answer 500 and write nothing else: the job stays claimed, the
 * stalled-job sweep reclaims it, and the attempt cap routes it back here
 * without another render.
 */
async function failAndRefund(jobId: string, reason: string): Promise<NextResponse> {
  try {
    const refunded = await failJobWithRefund(jobId, reason);
    return NextResponse.json({ ran: true, jobId, status: 'failed', error: reason, refunded });
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'render_job_fail_unrecorded', jobId, reason, error: toMessage(err) }),
    );
    return NextResponse.json(
      { ran: true, jobId, status: 'fail_unrecorded', error: reason },
      { status: 500 },
    );
  }
}

/**
 * Is this a retryable upstream failure (rate limit / transient server / network)
 * rather than a permanent one? Luma's SDK throws errors carrying an HTTP
 * `status`; we also sniff the message for connection-level failures.
 */
function isTransientError(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  if (typeof status === 'number') {
    if (status === 429 || status === 408 || status >= 500) return true;
    return false; // a concrete 4xx (bad request, auth) is permanent
  }
  const msg = toMessage(err).toLowerCase();
  return /\b(429|408|5\d\d)\b|rate.?limit|timed?.?out|timeout|econnreset|econnrefused|enotfound|etimedout|network|fetch failed|socket hang up/.test(
    msg,
  );
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
