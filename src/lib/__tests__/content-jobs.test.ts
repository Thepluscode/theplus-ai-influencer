import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const rpcMock = vi.fn();
// Admin + server clients both resolve to a stub exposing the mocked rpc.
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdminClient: () => ({ rpc: rpcMock }) }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => ({ rpc: rpcMock }) }));

import { claimContentJob } from '@/lib/content-jobs';

afterEach(() => rpcMock.mockReset());

describe('claimContentJob — empty-queue handling', () => {
  it('returns null when the RPC yields a row of NULLs (empty queue)', async () => {
    // plpgsql `returns content_jobs` emits all-null columns, not SQL NULL.
    rpcMock.mockResolvedValue({ data: { id: null, kind: null, workspace_id: null }, error: null });
    expect(await claimContentJob()).toBeNull();
  });

  it('returns null when the RPC yields true SQL NULL', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    expect(await claimContentJob()).toBeNull();
  });

  it('returns the claimed job when a real row comes back', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'job-1', kind: 'extract', workspace_id: 'w1', status: 'processing' },
      error: null,
    });
    const job = await claimContentJob();
    expect(job?.id).toBe('job-1');
    expect(job?.kind).toBe('extract');
  });

  it('throws when the RPC returns an error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(claimContentJob()).rejects.toThrow(/boom/);
  });
});
