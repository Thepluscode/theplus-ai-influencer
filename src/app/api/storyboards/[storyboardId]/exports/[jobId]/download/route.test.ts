import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(),
}));
vi.mock('@/lib/workspace', () => ({
  getOrCreateCurrentWorkspace: vi.fn(),
}));
vi.mock('@/lib/storyboard-export-jobs', () => ({
  getStoryboardExportForDownload: vi.fn(),
  createStoryboardExportDownloadUrl: vi.fn(),
}));

import { GET } from './route';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import {
  createStoryboardExportDownloadUrl,
  getStoryboardExportForDownload,
} from '@/lib/storyboard-export-jobs';

const STORYBOARD_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';

describe('authorized storyboard export download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-a' } } }) },
    } as never);
    vi.mocked(getOrCreateCurrentWorkspace).mockResolvedValue({ id: 'workspace-a' } as never);
  });

  it('returns 404 when RLS/ownership lookup cannot see another workspace export', async () => {
    vi.mocked(getStoryboardExportForDownload).mockResolvedValue(null);

    const response = await invoke();

    expect(response.status).toBe(404);
    expect(getStoryboardExportForDownload).toHaveBeenCalledWith({
      jobId: JOB_ID,
      storyboardId: STORYBOARD_ID,
      workspaceId: 'workspace-a',
    });
    expect(createStoryboardExportDownloadUrl).not.toHaveBeenCalled();
  });

  it('does not sign an incomplete export', async () => {
    vi.mocked(getStoryboardExportForDownload).mockResolvedValue({
      id: JOB_ID,
      status: 'rendering',
      output_path: null,
    } as never);

    const response = await invoke();

    expect(response.status).toBe(409);
    expect(createStoryboardExportDownloadUrl).not.toHaveBeenCalled();
  });

  it('redirects an owner to a short-lived signed URL only after completion', async () => {
    vi.mocked(getStoryboardExportForDownload).mockResolvedValue({
      id: JOB_ID,
      status: 'completed',
      output_path: 'workspace-a/storyboard/job.mp4',
    } as never);
    vi.mocked(createStoryboardExportDownloadUrl).mockResolvedValue(
      'https://storage.example/signed.mp4?token=short-lived',
    );

    const response = await invoke();

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://storage.example/signed.mp4?token=short-lived',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});

function invoke() {
  return GET(new Request('http://localhost/download'), {
    params: Promise.resolve({ storyboardId: STORYBOARD_ID, jobId: JOB_ID }),
  });
}
