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
  rpcResult: {} as Record<string, unknown>,
  animate: 'fail' as 'fail' | 'ok',
  updatedRows: [{ id: 'job' }] as unknown[],
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  jobUpdates: [] as { row: Record<string, unknown>; filters: Record<string, unknown> }[],
}));

vi.mock('@/lib/storyboard', () => ({
  animateSingleShot: async ({ shot }: { shot: Record<string, unknown> }) => {
    if (h.animate === 'ok') return { ...shot, videoUrl: 'https://cdn.example/new.mp4' };
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
        if (message) return Promise.resolve({ data: null, error: { message } });
        return Promise.resolve({ data: fn in h.rpcResult ? h.rpcResult[fn] : 0, error: null });
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
          update: (row: Record<string, unknown>) => {
            // Records the row and every filter, so tests can see the fence.
            const write = { row, filters: {} as Record<string, unknown> };
            if (table === 'storyboard_render_jobs') h.jobUpdates.push(write);
            const builder = {
              eq: (k: string, v: unknown) => ((write.filters[k] = v), builder),
              in: (k: string, v: unknown) => ((write.filters[k] = v), builder),
              select: () => builder,
              then: (resolve: (r: { error: null; data: unknown[] }) => void) =>
                resolve({ error: null, data: h.updatedRows }),
            };
            return builder;
          },
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
    claimed_at: '2026-11-25T10:00:00.123456+00:00',
  };
  h.shots = [shot(0, false), shot(1, false)];
  h.rpcError = {};
  h.rpcResult = {};
  h.animate = 'fail';
  h.updatedRows = [{ id: 'job' }];
  h.rpcCalls = [];
  h.jobUpdates = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const calls = (fn: string) => h.rpcCalls.filter((c) => c.fn === fn);

describe('render job failure and refund', () => {
  it('never records a job as failed-and-refunded when the refund did not happen', async () => {
    h.rpcError = { fail_storyboard_render_job: 'database unavailable' };
    const res = await tick();

    // Retried in-request, then reported: the job is left claimed, so the
    // stalled-job sweep retries the whole fail+refund. Nothing else is written.
    expect(res.status).toBe(500);
    expect((await res.json()).status).toBe('fail_unrecorded');
    expect(calls('fail_storyboard_render_job')).toHaveLength(3);
    expect(h.jobUpdates).toEqual([]);
    expect(calls('grant_credits')).toEqual([]);
  });

  it('fails and refunds in one call, fenced by the claim, never passing an amount', async () => {
    h.rpcResult = { fail_storyboard_render_job: 50 };
    const res = await tick();

    expect(await res.json()).toMatchObject({ status: 'failed', refunded: 50 });
    expect(calls('fail_storyboard_render_job').map((c) => c.args)).toEqual([
      {
        p_job_id: 'job',
        p_claimed_at: '2026-11-25T10:00:00.123456+00:00',
        p_error: 'bad request',
      },
    ]);
    expect(h.jobUpdates).toEqual([]);
    expect(calls('grant_credits')).toEqual([]);
  });

  it('reports a stale claim without claiming the job failed', async () => {
    h.rpcResult = { fail_storyboard_render_job: null };
    expect((await (await tick()).json()).status).toBe('stale');
  });

  it('saves a shot and advances the job in one fenced call', async () => {
    h.animate = 'ok';
    h.rpcResult = { record_storyboard_render_shot: 'progress' };
    const body = await (await tick()).json();

    expect(body.status).toBe('processing');
    const [record] = calls('record_storyboard_render_shot');
    expect(record?.args).toMatchObject({
      p_job_id: 'job',
      p_claimed_at: '2026-11-25T10:00:00.123456+00:00',
    });
    expect((record?.args.p_shots as { videoUrl?: string }[])[0]?.videoUrl).toBe(
      'https://cdn.example/new.mp4',
    );
    expect(h.jobUpdates).toEqual([]);
  });

  it('writes nothing more when the claim went stale before the save', async () => {
    h.animate = 'ok';
    h.rpcResult = { record_storyboard_render_shot: 'stale' };
    expect((await (await tick()).json()).status).toBe('stale');
    expect(calls('fail_storyboard_render_job')).toEqual([]);
    expect(h.jobUpdates).toEqual([]);
  });

  it('settles the job when its storyboard vanished before the save', async () => {
    h.animate = 'ok';
    h.rpcResult = { record_storyboard_render_shot: 'missing', fail_storyboard_render_job: 50 };
    expect((await (await tick()).json()).status).toBe('failed');
    expect(calls('fail_storyboard_render_job')).toHaveLength(1);
  });

  it('releases only its own claim when the save errors', async () => {
    h.animate = 'ok';
    h.rpcError = { record_storyboard_render_shot: 'database unavailable' };
    const res = await tick();

    expect(res.status).toBe(500);
    expect(h.jobUpdates).toEqual([
      {
        row: { claimed_at: null },
        filters: { id: 'job', claimed_at: '2026-11-25T10:00:00.123456+00:00' },
      },
    ]);
  });

  it('completes an all-delivered job only under its own claim and active status', async () => {
    h.shots = [{ index: 0, prompt: 'p', videoUrl: 'https://cdn.example/v.mp4' }];
    expect((await (await tick()).json()).status).toBe('completed');
    expect(h.jobUpdates[0]?.filters).toEqual({
      id: 'job',
      claimed_at: '2026-11-25T10:00:00.123456+00:00',
      status: ['pending', 'processing'],
    });
  });

  it('reports stale, not completed, when the completion matched no row', async () => {
    h.shots = [{ index: 0, prompt: 'p', videoUrl: 'https://cdn.example/v.mp4' }];
    h.updatedRows = []; // the claim was reclaimed by another worker
    expect((await (await tick()).json()).status).toBe('stale');
  });

  it('fails and refunds a job whose shots are not a list of objects', async () => {
    h.shots = { not: 'an array' } as unknown as Record<string, unknown>[];
    h.rpcResult = { fail_storyboard_render_job: 50 };
    expect((await (await tick()).json()).status).toBe('failed');
    expect(calls('fail_storyboard_render_job')[0]?.args.p_error).toMatch(/malformed/);
  });
});
