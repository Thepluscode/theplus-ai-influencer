import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cron-auth', () => ({ isCronAuthorized: vi.fn() }));
vi.mock('@/lib/storyboard-export-jobs', () => ({
  claimNextStoryboardExportJob: vi.fn(),
  isStoryboardExportApprovalCurrent: vi.fn(),
  markStoryboardExportCompleted: vi.fn(),
  markStoryboardExportFailed: vi.fn(),
  reclaimStalledStoryboardExportJobs: vi.fn(),
  releaseStoryboardExportForRetry: vi.fn(),
  removeStoryboardExportObject: vi.fn(),
  storyboardExportOutputPath: vi.fn(() => 'workspace/storyboard/job.mp4'),
  uploadStoryboardExport: vi.fn(),
}));
vi.mock('@/lib/storyboard-export', () => ({
  downloadStoryboardClips: vi.fn(),
  parseExportShots: vi.fn(),
  readRenderedMp4: vi.fn(),
  renderStoryboardMp4: vi.fn(),
}));

import { POST } from './route';
import { isCronAuthorized } from '@/lib/cron-auth';
import {
  claimNextStoryboardExportJob,
  isStoryboardExportApprovalCurrent,
  markStoryboardExportCompleted,
  markStoryboardExportFailed,
  reclaimStalledStoryboardExportJobs,
  releaseStoryboardExportForRetry,
  removeStoryboardExportObject,
  uploadStoryboardExport,
} from '@/lib/storyboard-export-jobs';
import {
  downloadStoryboardClips,
  parseExportShots,
  readRenderedMp4,
  renderStoryboardMp4,
} from '@/lib/storyboard-export';

const job = {
  id: 'job-1',
  workspace_id: 'workspace-1',
  storyboard_id: 'storyboard-1',
  status: 'rendering',
  attempts: 1,
  format: 'portrait',
  shots_snapshot: [{ index: 0, videoUrl: 'https://storage.cdn-luma.com/clip.mp4' }],
};

describe('storyboard MP4 worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCronAuthorized).mockReturnValue(true);
    vi.mocked(reclaimStalledStoryboardExportJobs).mockResolvedValue(0);
    vi.mocked(removeStoryboardExportObject).mockResolvedValue();
    vi.mocked(claimNextStoryboardExportJob).mockResolvedValue(job as never);
    vi.mocked(isStoryboardExportApprovalCurrent).mockResolvedValue(true);
    vi.mocked(parseExportShots).mockReturnValue(job.shots_snapshot);
    vi.mocked(downloadStoryboardClips).mockResolvedValue(['/tmp/clip.mp4']);
    vi.mocked(renderStoryboardMp4).mockResolvedValue({
      path: '/tmp/output.mp4',
      bytes: 1234,
      durationMs: 500,
      width: 720,
      height: 1280,
      hasAudio: true,
      sourceAudioShots: 0,
    });
    vi.mocked(readRenderedMp4).mockResolvedValue(Buffer.from('mp4'));
    vi.mocked(uploadStoryboardExport).mockResolvedValue('workspace/storyboard/job.mp4');
  });

  it('rejects an unauthenticated worker request before touching the queue', async () => {
    vi.mocked(isCronAuthorized).mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(claimNextStoryboardExportJob).not.toHaveBeenCalled();
  });

  it('renders, stores, and atomically completes an approved snapshot', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(body).toMatchObject({
      status: 'completed',
      durationMs: 500,
      width: 720,
      height: 1280,
      hasAudio: true,
    });
    expect(isStoryboardExportApprovalCurrent).toHaveBeenCalledTimes(2);
    expect(uploadStoryboardExport).toHaveBeenCalledWith(job, Buffer.from('mp4'));
    expect(markStoryboardExportCompleted).toHaveBeenCalledWith(
      'job-1',
      'workspace/storyboard/job.mp4',
      expect.objectContaining({ bytes: 1234 }),
    );
  });

  it('fails closed when approval was withdrawn before rendering', async () => {
    vi.mocked(isStoryboardExportApprovalCurrent).mockResolvedValueOnce(false);
    const response = await POST(request());

    expect(await response.json()).toMatchObject({ status: 'failed' });
    expect(downloadStoryboardClips).not.toHaveBeenCalled();
    expect(markStoryboardExportFailed).toHaveBeenCalledWith(
      'job-1',
      expect.stringMatching(/approval changed/i),
    );
  });

  it('requeues a bounded transient render failure', async () => {
    vi.mocked(renderStoryboardMp4).mockRejectedValue(new Error('ffmpeg temporarily unavailable'));
    const response = await POST(request());

    expect(await response.json()).toMatchObject({ status: 'retry', attempts: 1 });
    expect(releaseStoryboardExportForRetry).toHaveBeenCalledWith(
      'job-1',
      'ffmpeg temporarily unavailable',
    );
    expect(markStoryboardExportFailed).not.toHaveBeenCalled();
  });
});

function request(): NextRequest {
  return new NextRequest('http://localhost/api/jobs/storyboard-export', {
    method: 'POST',
    headers: { authorization: 'Bearer test' },
  });
}
