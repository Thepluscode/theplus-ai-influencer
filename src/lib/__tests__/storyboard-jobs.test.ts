import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const rpcMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdminClient: () => ({ rpc: rpcMock }) }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => ({ rpc: rpcMock }) }));

import { claimNextRenderJob } from '@/lib/storyboard-jobs';

afterEach(() => rpcMock.mockReset());

describe('claimNextRenderJob — empty-queue handling', () => {
  it('returns null on a row of NULLs (empty queue)', async () => {
    rpcMock.mockResolvedValue({
      data: { id: null, storyboard_id: null, workspace_id: null },
      error: null,
    });
    expect(await claimNextRenderJob()).toBeNull();
  });

  it('returns null on true SQL NULL', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    expect(await claimNextRenderJob()).toBeNull();
  });

  it('returns the claimed job when a real row comes back', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'job-1', storyboard_id: 'sb-1', workspace_id: 'w1', status: 'processing' },
      error: null,
    });
    expect((await claimNextRenderJob())?.id).toBe('job-1');
  });

  it('throws when the RPC returns an error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(claimNextRenderJob()).rejects.toThrow(/boom/);
  });
});
