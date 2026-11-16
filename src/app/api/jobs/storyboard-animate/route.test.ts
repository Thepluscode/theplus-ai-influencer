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
}));

vi.mock('@/lib/env', () => ({
  serverEnv: { CRON_SECRET: 'cron_x', SUPABASE_SERVICE_ROLE_KEY: 'service_x' },
}));

vi.mock('@/lib/credits', () => ({
  refundCredits: async (input: Record<string, unknown>) => {
    h.refunds.push(input);
  },
}));

vi.mock('@/lib/storyboard', () => ({
  animateSingleShot: async () => {
    // A concrete 4xx is permanent, so the worker fails and refunds.
    throw Object.assign(new Error('bad request'), { status: 400 });
  },
}));

vi.mock('@/lib/storyboard-jobs', () => ({
  reclaimStalledJobs: async () => {},
  claimNextRenderJob: async () => h.jobs.shift() ?? null,
  markJobFailed: async (id: string) => {
    h.failed.push(id);
  },
  markJobCompleted: async () => {},
  recordShotProgress: async () => {},
  releaseJobClaim: async () => {},
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

function job(id: string) {
  return {
    id,
    workspace_id: 'ws_1',
    storyboard_id: 'sb_1',
    shots_total: 3,
    shots_completed: 0,
    cost_per_shot: 25,
    attempts: 1,
  };
}

describe('storyboard-animate refunds', () => {
  beforeEach(() => {
    h.jobs = [];
    h.refunds = [];
    h.failed = [];
  });

  it('refunds two failed renders of the same storyboard under two distinct refs', async () => {
    h.jobs = [job('job_a'), job('job_b')];
    await tick();
    await tick();

    expect(h.failed).toEqual(['job_a', 'job_b']);
    expect(h.refunds).toHaveLength(2);
    expect(h.refunds.map((r) => r.refId)).toEqual(['job_a', 'job_b']);
    expect(h.refunds.every((r) => r.refKind === 'storyboard_render_job')).toBe(true);
    expect(h.refunds.every((r) => r.amount === 75)).toBe(true);
  });

  it('rejects an unauthenticated tick without touching the queue', async () => {
    h.jobs = [job('job_a')];
    const res = await POST({ headers: new Headers() } as unknown as NextRequest);
    expect(res.status).toBe(401);
    expect(h.jobs).toHaveLength(1);
    expect(h.refunds).toHaveLength(0);
  });
});
