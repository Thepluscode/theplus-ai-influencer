// @vitest-environment node
// Real worker + real Runway provider; only HTTP, storage, the job queue and the
// database row are faked. Reproduces Codex finding (task-mwvwobr8-iwxtp5): a
// tick that created a paid task and then hit transient poll errors was released,
// and the next tick created (and billed) a second task for the same shot.
import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.RUNWAYML_API_SECRET = 'test';
  process.env.STORYBOARD_VIDEO_PROVIDER = 'runway';
  process.env.LUMA_STUB = '';
  process.env.CRON_SECRET = 'cron_resume_secret_123';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
});

const h = vi.hoisted(() => ({
  attempts: 0,
  shots: [] as Record<string, unknown>[],
  saveError: null as { message: string } | null,
  failed: [] as string[],
  released: [] as string[],
  refunds: [] as unknown[],
}));

vi.mock('@/lib/credits', () => ({
  refundCredits: async (input: unknown) => {
    h.refunds.push(input);
  },
}));
vi.mock('@/lib/storyboard-jobs', () => ({
  reclaimStalledJobs: async () => {},
  claimNextRenderJob: async () => ({
    id: 'job',
    storyboard_id: 'sb',
    workspace_id: 'ws',
    attempts: ++h.attempts,
    shots_completed: 0,
    shots_total: 1,
    cost_per_shot: 25,
  }),
  releaseJobClaim: async (id: string) => {
    h.released.push(id);
  },
  markJobFailed: async (id: string) => {
    h.failed.push(id);
  },
  markJobCompleted: async () => {},
  recordShotProgress: async () => {},
}));
vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'sb', format: 'portrait', shots: structuredClone(h.shots) },
            error: null,
          }),
        }),
      }),
      update: (row: { shots: Record<string, unknown>[] }) => ({
        eq: async () => {
          if (h.saveError) return { error: h.saveError };
          h.shots = structuredClone(row.shots);
          return { error: null };
        },
      }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://proj.supabase.co/${p}` } }),
      }),
    },
  }),
}));

const { POST } = await import('./route');

let creates = 0;
let taskPolls: string[] = [];
let pollStatus = 503;

beforeEach(() => {
  h.attempts = 0;
  h.shots = [
    {
      index: 0,
      prompt: 'p',
      imageUrl: 'https://img.example/a.png',
      generationId: 'g',
      generatedAt: 't',
    },
  ];
  h.saveError = null;
  h.failed = [];
  h.released = [];
  h.refunds = [];
  creates = 0;
  taskPolls = [];
  pollStatus = 503;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') {
        creates++;
        return Response.json({ id: `task-${creates}` });
      }
      if (u.includes('/v1/tasks/')) {
        taskPolls.push(u.split('/v1/tasks/')[1]!);
        return pollStatus === 200
          ? Response.json({ id: 'x', status: 'SUCCEEDED', output: ['https://cdn.example/v.mp4'] })
          : Response.json({}, { status: pollStatus });
      }
      return new Response(new Uint8Array(64), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function tick() {
  vi.useFakeTimers();
  const pending = POST({
    headers: new Headers({ authorization: 'Bearer cron_resume_secret_123' }),
  } as unknown as NextRequest);
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  return (await pending).json();
}

describe('storyboard-animate with Runway', () => {
  it('resumes the saved task on the next tick instead of paying for a second one', async () => {
    const first = await tick();
    expect(first.status).toBe('retry');
    expect(h.shots[0]).toMatchObject({ pendingVideoGenerationId: 'runway:task-1' });

    pollStatus = 200;
    const second = await tick();

    expect(creates).toBe(1);
    expect(taskPolls.at(-1)).toBe('task-1');
    expect(second.status).toBe('completed');
    expect(h.shots[0]).toMatchObject({ videoGenerationId: 'runway:task-1' });
    expect(JSON.parse(JSON.stringify(h.shots[0]))).not.toHaveProperty('pendingVideoGenerationId');
  });

  it('fails the job instead of retrying when the new task id cannot be saved', async () => {
    h.saveError = { message: 'db down' };
    const result = await tick();

    expect(creates).toBe(1);
    expect(taskPolls).toEqual([]);
    expect(result.status).toBe('failed');
    expect(h.released).toEqual([]);
    expect(h.failed).toEqual(['job']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('runway:task-1'));
  });
});
