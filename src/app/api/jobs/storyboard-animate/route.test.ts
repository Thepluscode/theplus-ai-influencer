import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// A storyboard can be rendered more than once: a failed render is refunded and
// the creator presses Animate again. Migration 0021's unique index allows ONE
// refund per (workspace_id, ref_kind, ref_id). If every render of a storyboard
// refunds under the storyboard id, the second failed render's refund collides
// with the first and is silently skipped — the creator pays for nothing.
// Each render job must therefore refund under its own id.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[],
  refunds: [] as Record<string, unknown>[],
  failed: [] as string[],
  released: [] as string[],
  animateCalls: 0,
  animateError: { status: 400, message: 'bad request' } as { status: number; message: string },
}));

vi.mock('@/lib/env', () => ({
  serverEnv: { CRON_SECRET: 'cron_x', SUPABASE_SERVICE_ROLE_KEY: 'service_x' },
}));

vi.mock('@/lib/storyboard', () => ({
  animateSingleShot: async () => {
    h.animateCalls++;
    // Default: a concrete 4xx is permanent, so the worker fails and refunds.
    throw Object.assign(new Error(h.animateError.message), { status: h.animateError.status });
  },
}));

vi.mock('@/lib/storyboard-jobs', () => ({
  reclaimStalledJobs: async () => {},
  claimNextRenderJob: async () => h.jobs.shift() ?? null,
  // Fail + refund is one database call (0037); the refund amount is computed
  // there and covered by scripts/sql/database-boundaries.sql.
  failJobWithRefund: async ({ job }: { job: { id: string } }) => {
    h.failed.push(job.id);
    h.refunds.push({ refId: job.id });
    return 0;
  },
  recordRenderShot: async () => 'progress',
  markJobCompleted: async () => {},
  releaseJobClaim: async (id: string) => {
    h.released.push(id);
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'sb_1', format: 'portrait', shots: [{ index: 0, prompt: 'p' }] },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

const { POST } = await import('./route');

function tick() {
  return POST({
    headers: new Headers({ authorization: 'Bearer cron_x' }),
  } as unknown as NextRequest);
}

function job(id: string, over: Partial<Record<string, number>> = {}) {
  // `attempts` is bumped by every claim, including the one that returned this row.
  return {
    id,
    workspace_id: 'ws_1',
    storyboard_id: 'sb_1',
    shots_total: 3,
    shots_completed: 0,
    cost_per_shot: 25,
    attempts: 1,
    ...over,
  };
}

describe('storyboard-animate refunds', () => {
  beforeEach(() => {
    h.jobs = [];
    h.refunds = [];
    h.failed = [];
    h.released = [];
    h.animateCalls = 0;
    h.animateError = { status: 400, message: 'bad request' };
  });

  it('refunds two failed renders of the same storyboard under two distinct refs', async () => {
    h.jobs = [job('job_a'), job('job_b')];
    await tick();
    await tick();

    // Each failure is refunded under its own job id (the SQL keys the refund
    // on (storyboard_render_job, job id)), so the second is not deduplicated.
    expect(h.failed).toEqual(['job_a', 'job_b']);
  });

  it('rejects an unauthenticated tick without touching the queue', async () => {
    h.jobs = [job('job_a')];
    const res = await POST({ headers: new Headers() } as unknown as NextRequest);
    expect(res.status).toBe(401);
    expect(h.jobs).toHaveLength(1);
    expect(h.refunds).toHaveLength(0);
  });

  it('fails and refunds a job that keeps being reclaimed without progress, before calling Luma', async () => {
    // 1 shot done, then 4 claims that never finished a shot (crashes or retries),
    // and this is the 6th claim.
    h.jobs = [job('job_loop', { shots_total: 3, shots_completed: 1, attempts: 6 })];
    const res = await tick();
    const body = await res.json();

    expect(body.status).toBe('failed');
    expect(h.animateCalls).toBe(0);
    expect(h.failed).toEqual(['job_loop']);
  });

  it('still retries a transient error late in a long, healthy job', async () => {
    // 7 shots rendered, each consuming one claim; this is the 8th claim and the
    // first failure. The retry budget must not have been spent by successes.
    h.animateError = { status: 429, message: 'rate limited' };
    h.jobs = [job('job_long', { shots_total: 12, shots_completed: 7, attempts: 8 })];
    const body = await (await tick()).json();

    expect(body.status).toBe('retry');
    expect(h.released).toEqual(['job_long']);
    expect(h.refunds).toHaveLength(0);
  });
});
