import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import {
  claimNextStoryboardExportJob,
  isStoryboardExportApprovalCurrent,
  markStoryboardExportCompleted,
  markStoryboardExportFailed,
  reclaimStalledStoryboardExportJobs,
  releaseStoryboardExportForRetry,
  removeStoryboardExportObject,
  storyboardExportOutputPath,
  uploadStoryboardExport,
} from '@/lib/storyboard-export-jobs';
import {
  downloadStoryboardClips,
  parseExportShots,
  readRenderedMp4,
  renderStoryboardMp4,
} from '@/lib/storyboard-export';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 3;
const WORKER_TIMEOUT_MS = 105_000;

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get('authorization') ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    await reclaimStalledStoryboardExportJobs();
  } catch (error) {
    console.warn('[storyboard-export] reclaim failed:', toMessage(error));
  }

  let job;
  try {
    job = await claimNextStoryboardExportJob();
  } catch (error) {
    return NextResponse.json({ error: 'claim failed', detail: toMessage(error) }, { status: 500 });
  }
  if (!job) return NextResponse.json({ ran: false, reason: 'empty queue' });

  const workDir = await mkdtemp(path.join(tmpdir(), 'theplus-storyboard-export-'));
  const outputPath = path.join(workDir, 'storyboard.mp4');
  const storedPath = storyboardExportOutputPath(job);
  const deadline = Date.now() + WORKER_TIMEOUT_MS;
  try {
    if (!(await isStoryboardExportApprovalCurrent(job))) {
      throw new PermanentExportError('Storyboard approval changed before export started.');
    }

    const shots = parseExportShots(job.shots_snapshot);
    const clipPaths = await downloadStoryboardClips(shots, workDir, {
      timeoutMs: remainingMs(deadline),
    });
    const rendered = await renderStoryboardMp4({
      clipPaths,
      format: job.format,
      workDir,
      outputPath,
      timeoutMs: remainingMs(deadline),
    });

    if (!(await isStoryboardExportApprovalCurrent(job))) {
      throw new PermanentExportError('Storyboard approval changed while the MP4 was rendering.');
    }

    const stored = await uploadStoryboardExport(job, await readRenderedMp4(rendered.path));
    try {
      await markStoryboardExportCompleted(job.id, stored, rendered);
    } catch (error) {
      await removeStoryboardExportObject(stored).catch((cleanupError) => {
        console.error('[storyboard-export] failed to remove uncommitted output', {
          jobId: job.id,
          error: toMessage(cleanupError),
        });
      });
      throw error;
    }

    return NextResponse.json({
      ran: true,
      jobId: job.id,
      status: 'completed',
      durationMs: rendered.durationMs,
      width: rendered.width,
      height: rendered.height,
      hasAudio: rendered.hasAudio,
      sourceAudioShots: rendered.sourceAudioShots,
    });
  } catch (error) {
    const message = toMessage(error);
    if (!(error instanceof PermanentExportError) && job.attempts < MAX_ATTEMPTS) {
      await releaseStoryboardExportForRetry(job.id, message);
      return NextResponse.json({
        ran: true,
        jobId: job.id,
        status: 'retry',
        attempts: job.attempts,
        error: message,
      });
    }

    await removeStoryboardExportObject(storedPath).catch((cleanupError) => {
      console.error('[storyboard-export] failed to clean terminal output', {
        jobId: job.id,
        error: toMessage(cleanupError),
      });
    });
    await markStoryboardExportFailed(job.id, message);
    return NextResponse.json({
      ran: true,
      jobId: job.id,
      status: 'failed',
      error: message,
    });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch((error) => {
      console.error('[storyboard-export] failed to remove temp directory', {
        jobId: job.id,
        error: toMessage(error),
      });
    });
  }
}

class PermanentExportError extends Error {}

function remainingMs(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Storyboard export exceeded its worker timeout.');
  return remaining;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
