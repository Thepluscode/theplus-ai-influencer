// @vitest-environment node
// Real worker, real job/credit helpers; only the Supabase client is faked, and
// it records every write. Reproduces Codex round 5 (task-mwvzeif8-pa30zn):
// the job was marked failed with cost_refunded BEFORE the credit grant ran, so
// a failed grant stranded the refund on a job that is never retried; and the
// refund trusted a stale shots_completed, over-refunding saved shots.
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.CRON_SECRET = 'cron_refund_secret_123';
});

const h = vi.hoisted(() => ({
  job: null as Record<string, unknown> | null,
  shots: [] as Record<string, unknown>[],
  rpcError: {} as Record<string, string | undefined>,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  jobUpdates: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/storyboard', () => ({
  animateSingleShot: async () => {
    throw Object.assign(new Error('bad request'), { status: 400 });
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => {
    const client = {
      rpc(fn: string, args: Record<string, unknown> = {}) {
        h.rpcCalls.push({ fn, args });
        if (fn === 'claim_storyboard_render_job')
          return Promise.resolve({ data: h.job, error: null });
        if (fn === 'reclaim_stalled_storyboard_render_jobs')
          return Promise.resolve({ data: 0, error: null });
        const message = h.rpcError[fn];
        return Promise.resolve({ data: message ? null : 0, error: message ? { message } : null });
      },
      from(table: string) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'sb', format: 'portrait', shots: h.shots },
                error: null,
              }),
            }),
          }),
          update: (row: Record<string, unknown>) => ({
            eq: async () => {
              if (table === 'storyboard_render_jobs') h.jobUpdates.push(row);
              return { error: null };
            },
          }),
        };
      },
    };
    return client;
  },
}));

const { POST } = await import('./route');

function tick() {
  return POST({
    headers: new Headers({ authorization: 'Bearer cron_refund_secret_123' }),
  } as unknown as NextRequest);
}

const shot = (index: number, done: boolean) => ({
  index,
  prompt: 'p',
  imageUrl: 'https://img.example/a.png',
  ...(done ? { videoUrl: 'https://cdn.example/v.mp4' } : {}),
});

beforeEach(() => {
  h.job = {
    id: 'job',
    workspace_id: 'ws',
    storyboard_id: 'sb',
    shots_total: 2,
    shots_completed: 0,
    cost_per_shot: 25,
    attempts: 1,
  };
  h.shots = [shot(0, false), shot(1, false)];
  h.rpcError = {};
  h.rpcCalls = [];
  h.jobUpdates = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const failedWrites = () => h.jobUpdates.filter((u) => u.status === 'failed');

describe('render job failure and refund', () => {
  it('never records a job as failed-and-refunded when the refund did not happen', async () => {
    h.rpcError = {
      grant_credits: 'database unavailable',
      fail_storyboard_render_job: 'database unavailable',
    };
    const res = await tick();

    // The failure is not swallowed: the tick reports an error and the job is
    // left claimed, so the stalled-job sweep retries the whole fail+refund.
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(failedWrites()).toEqual([]);
  });

  it('fails and refunds in one database call, keyed to the job', async () => {
    const res = await tick();

    expect((await res.json()).status).toBe('failed');
    expect(failedWrites()).toEqual([]); // no separate status write
    const fail = h.rpcCalls.filter((c) => c.fn === 'fail_storyboard_render_job');
    expect(fail).toEqual([
      { fn: 'fail_storyboard_render_job', args: { p_job_id: 'job', p_error: 'bad request' } },
    ]);
    expect(h.rpcCalls.some((c) => c.fn === 'grant_credits')).toBe(false);
  });
});
