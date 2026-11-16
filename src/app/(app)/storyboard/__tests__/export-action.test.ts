import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/env', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'http://localhost:3002' },
  serverEnv: { CRON_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn() }));
vi.mock('@/lib/workspace', () => ({ getOrCreateCurrentWorkspace: vi.fn() }));
vi.mock('@/lib/storyboards', () => ({
  getStoryboard: vi.fn(),
  saveStoryboard: vi.fn(),
  deleteStoryboard: vi.fn(),
}));
vi.mock('@/lib/storyboard-export-jobs', () => ({ enqueueStoryboardExport: vi.fn() }));
vi.mock('@/lib/credits', () => ({
  COSTS: { STORYBOARD_VIDEO_RENDER: 60 },
  consumeCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

import { exportStoryboardAction } from '@/app/(app)/storyboard/actions';
import { enqueueStoryboardExport } from '@/lib/storyboard-export-jobs';
import { getStoryboard } from '@/lib/storyboards';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { consumeCredits } from '@/lib/credits';

const STORYBOARD_ID = '11111111-1111-4111-8111-111111111111';

describe('exportStoryboardAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-a' } } }) },
    } as never);
    vi.mocked(getOrCreateCurrentWorkspace).mockResolvedValue({ id: 'workspace-a' } as never);
  });

  it('denies a storyboard from another workspace before enqueue', async () => {
    vi.mocked(getStoryboard).mockResolvedValue({
      id: STORYBOARD_ID,
      workspace_id: 'workspace-b',
    } as never);

    await expect(exportStoryboardAction(null, form())).resolves.toEqual({
      status: 'error',
      error: 'Storyboard not found.',
    });
    expect(enqueueStoryboardExport).not.toHaveBeenCalled();
  });

  it('returns the same atomic job for concurrent duplicate clicks without charging credits', async () => {
    vi.mocked(getStoryboard).mockResolvedValue({
      id: STORYBOARD_ID,
      workspace_id: 'workspace-a',
    } as never);
    vi.mocked(enqueueStoryboardExport).mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'queued',
    } as never);

    const [first, second] = await Promise.all([
      exportStoryboardAction(null, form()),
      exportStoryboardAction(null, form()),
    ]);

    expect(first).toEqual({ status: 'queued', jobId: '22222222-2222-4222-8222-222222222222' });
    expect(second).toEqual(first);
    expect(enqueueStoryboardExport).toHaveBeenCalledTimes(2);
    expect(consumeCredits).not.toHaveBeenCalled();
  });
});

function form(): FormData {
  const data = new FormData();
  data.set('storyboardId', STORYBOARD_ID);
  return data;
}
