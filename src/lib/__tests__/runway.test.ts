// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.STORYBOARD_VIDEO_PROVIDER = 'runway';
  process.env.RUNWAYML_API_SECRET = 'test-runway-secret';
  process.env.LUMA_STUB = '';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
});

const uploads: Array<{ bucket: string; path: string; bytes: number; contentType?: string }> = [];
let uploadError: { message: string } | null = null;
vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Buffer, opts: { contentType?: string }) => {
          if (uploadError) return { data: null, error: uploadError };
          uploads.push({ bucket, path, bytes: body.byteLength, contentType: opts.contentType });
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      }),
    },
  }),
}));

vi.mock('@/lib/luma', () => ({
  getLumaClient: () => {
    throw new Error('Luma must not be called when the provider is Runway');
  },
}));

import {
  animateWithRunway,
  isRunwayGenerationId,
  refreshRunwayVideoUrl,
  VideoTaskDeadError,
  VideoTaskUnconfirmedError,
} from '@/lib/runway';
import { animateSingleShot } from '@/lib/storyboard';
import { downloadStoryboardClips, getAllowedStoryboardClipHosts } from '@/lib/storyboard-export';

type Reply = { status?: number; body: unknown };
let replies: Reply[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
/** What the Runway output CDN serves for a clip download. */
let clipResponse: () => Response;
const apiCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://api.dev.runwayml.com'));

beforeEach(() => {
  replies = [];
  uploads.length = 0;
  uploadError = null;
  clipResponse = () => new Response(new Uint8Array(2048), { status: 200 });
  fetchMock = vi.fn(async (input: string | URL) => {
    if (!String(input).startsWith('https://api.dev.runwayml.com')) return clipResponse();
    const next = replies.shift();
    if (!next) throw new Error('Unexpected fetch');
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const STORED = 'https://proj.supabase.co/storage/v1/object/public/storyboard-clips/runway/';

const fast = { timeoutMs: 1_000, pollIntervalMs: 1 };

describe('Runway image-to-video', () => {
  it('creates a task with the documented contract and polls it to a video', async () => {
    replies.push(
      { body: { id: 'task-1' } },
      { body: { id: 'task-1', status: 'RUNNING' } },
      { body: { id: 'task-1', status: 'SUCCEEDED', output: ['https://cdn.example/v.mp4'] } },
    );

    const result = await animateWithRunway({
      imageUrl: 'https://img.example/still.png',
      prompt: 'Slow push-in on the persona',
      format: 'portrait',
      durationSeconds: 5,
      ...fast,
    });

    expect(result).toEqual({
      videoUrl: `${STORED}task-1.mp4`,
      generationId: 'runway:task-1',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.dev.runwayml.com/v1/image_to_video');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-runway-secret',
      'X-Runway-Version': '2024-11-06',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'gen4_turbo',
      promptImage: 'https://img.example/still.png',
      promptText: 'Slow push-in on the persona',
      ratio: '720:1280',
      duration: 5,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.dev.runwayml.com/v1/tasks/task-1');
  });

  it.each([
    ['landscape', '1280:720'],
    ['square', '960:960'],
  ] as const)('maps %s to ratio %s', async (format, ratio) => {
    replies.push(
      { body: { id: 't' } },
      { body: { id: 't', status: 'SUCCEEDED', output: ['https://cdn.example/x.mp4'] } },
    );
    await animateWithRunway({
      imageUrl: 'https://i',
      prompt: 'p',
      format,
      durationSeconds: 5,
      ...fast,
    });
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)).ratio).toBe(
      ratio,
    );
  });

  it('surfaces a failed task with its failure code', async () => {
    replies.push(
      { body: { id: 'task-2' } },
      { body: { id: 'task-2', status: 'FAILED', failureCode: 'SAFETY.INPUT.IMAGE' } },
    );
    await expect(
      animateWithRunway({
        imageUrl: 'https://i',
        prompt: 'p',
        format: 'portrait',
        durationSeconds: 5,
        ...fast,
      }),
    ).rejects.toThrow('Runway task task-2 failed: SAFETY.INPUT.IMAGE');
  });

  it('gives up when the task outlives its time budget', async () => {
    replies.push({ body: { id: 'task-3' } });
    for (let i = 0; i < 50; i += 1) replies.push({ body: { id: 'task-3', status: 'PENDING' } });
    await expect(
      animateWithRunway({
        imageUrl: 'https://i',
        prompt: 'p',
        format: 'portrait',
        durationSeconds: 5,
        timeoutMs: 20,
        pollIntervalMs: 5,
      }),
    ).rejects.toThrow('did not finish within');
  });

  it('rejects a create response without a task id', async () => {
    replies.push({ body: {} });
    await expect(
      animateWithRunway({
        imageUrl: 'https://i',
        prompt: 'p',
        format: 'portrait',
        durationSeconds: 5,
        ...fast,
      }),
    ).rejects.toThrow('returned no task id');
  });

  it('never retries the paid create call, even on a 5xx', async () => {
    replies.push({ status: 503, body: {} }, { body: { id: 'second-task' } });
    await expect(
      animateWithRunway({
        imageUrl: 'https://i',
        prompt: 'p',
        format: 'portrait',
        durationSeconds: 5,
        ...fast,
      }),
    ).rejects.toThrow('failed (503)');
    expect(apiCalls()).toHaveLength(1);
  });

  it('reports an HTTP error without echoing the request', async () => {
    replies.push({ status: 401, body: { error: 'bad key' } });
    await expect(
      animateWithRunway({
        imageUrl: 'https://i',
        prompt: 'p',
        format: 'portrait',
        durationSeconds: 5,
        ...fast,
      }),
    ).rejects.toThrow('Runway POST /v1/image_to_video failed (401).');
  });
});

describe('Runway URL refresh', () => {
  it('recognises only prefixed ids', () => {
    expect(isRunwayGenerationId('runway:abc')).toBe(true);
    expect(isRunwayGenerationId('abc')).toBe(false);
  });

  it('re-reads the task for a fresh output URL', async () => {
    replies.push({
      body: { id: 'abc', status: 'SUCCEEDED', output: ['https://cdn.example/fresh.mp4'] },
    });
    await expect(refreshRunwayVideoUrl('runway:abc')).resolves.toBe(
      'https://cdn.example/fresh.mp4',
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.dev.runwayml.com/v1/tasks/abc');
  });

  it('refuses a Luma id and a task that is no longer available', async () => {
    await expect(refreshRunwayVideoUrl('luma-id')).rejects.toThrow('Not a Runway generation id');
    replies.push({ body: { id: 'gone', status: 'CANCELLED' } });
    await expect(refreshRunwayVideoUrl('runway:gone')).rejects.toThrow('no longer available');
  });
});

describe('Runway clip persistence', () => {
  const animate = () =>
    animateWithRunway({
      imageUrl: 'https://i',
      prompt: 'p',
      format: 'portrait',
      durationSeconds: 5,
      ...fast,
    });
  const succeed = (id: string) =>
    replies.push(
      { body: { id } },
      { body: { id, status: 'SUCCEEDED', output: [`https://cdn.example/${id}.mp4`] } },
    );

  it('copies the finished clip into our bucket and returns the permanent URL', async () => {
    succeed('keep-1');
    const result = await animate();

    expect(uploads).toEqual([
      {
        bucket: 'storyboard-clips',
        path: 'runway/keep-1.mp4',
        bytes: 2048,
        contentType: 'video/mp4',
      },
    ]);
    expect(result.videoUrl).toBe(`${STORED}keep-1.mp4`);
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain(
      'https://cdn.example/keep-1.mp4',
    );
  });

  it('keeps the Runway URL, warns, and never re-creates the paid task when the copy fails', async () => {
    succeed('up-fail');
    uploadError = { message: 'bucket not found' };
    const result = await animate();

    expect(result).toEqual({
      videoUrl: 'https://cdn.example/up-fail.mp4',
      generationId: 'runway:up-fail',
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('runway_clip_persist_failed'),
    );
    const creates = apiCalls().filter(([u]) => String(u).endsWith('/v1/image_to_video'));
    expect(creates).toHaveLength(1);
  });

  it('refuses to store a clip larger than the bucket limit', async () => {
    succeed('huge');
    clipResponse = () =>
      new Response(new Uint8Array(16), {
        status: 200,
        headers: { 'content-length': String(101 * 1024 * 1024) },
      });
    const result = await animate();

    expect(uploads).toEqual([]);
    expect(result.videoUrl).toBe('https://cdn.example/huge.mp4');
  });

  it('stops reading a clip that exceeds the limit without declaring its length', async () => {
    succeed('stream');
    const mb = new Uint8Array(1024 * 1024);
    let sent = 0;
    clipResponse = () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            if (sent++ < 120) controller.enqueue(mb);
            else controller.close();
          },
        }),
        { status: 200 },
      );
    const result = await animate();

    expect(uploads).toEqual([]);
    expect(sent).toBeLessThan(110);
    expect(result.videoUrl).toBe('https://cdn.example/stream.mp4');
  });

  it('falls back when the clip download fails', async () => {
    succeed('gone');
    clipResponse = () => new Response('nope', { status: 403 });
    const result = await animate();

    expect(uploads).toEqual([]);
    expect(result.videoUrl).toBe('https://cdn.example/gone.mp4');
  });

  it('refuses a 206 partial body instead of storing a truncated permanent clip', async () => {
    succeed('partial');
    clipResponse = () =>
      new Response(new Uint8Array(16), {
        status: 206,
        headers: { 'content-range': 'bytes 0-15/4096', 'content-length': '16' },
      });
    const result = await animate();

    expect(uploads).toEqual([]);
    expect(result.videoUrl).toBe('https://cdn.example/partial.mp4');
  });

  it('refuses a body shorter than its declared Content-Length', async () => {
    succeed('short');
    clipResponse = () =>
      new Response(new Uint8Array(16), { status: 200, headers: { 'content-length': '4096' } });
    const result = await animate();

    expect(uploads).toEqual([]);
    expect(result.videoUrl).toBe('https://cdn.example/short.mp4');
  });

  it('asks for an unencoded clip and refuses an encoded one it cannot verify', async () => {
    succeed('gz');
    clipResponse = () =>
      new Response(new Uint8Array(1550), {
        status: 200,
        headers: { 'content-encoding': 'gzip' }, // chunked: no length to check
      });
    const result = await animate();

    expect(uploads).toEqual([]);
    expect(result.videoUrl).toBe('https://cdn.example/gz.mp4');
    const clipCall = fetchMock.mock.calls.find(([u]) => String(u) === 'https://cdn.example/gz.mp4');
    expect(new Headers(clipCall?.[1]?.headers).get('accept-encoding')).toBe('identity');
  });

  it('reports a dead resumed task without creating a replacement', async () => {
    replies.push({ body: { id: 'dead', status: 'FAILED', failureCode: 'INTERNAL' } });
    const error = await animateWithRunway({
      imageUrl: 'https://img.example/a.png',
      prompt: 'p',
      format: 'portrait',
      durationSeconds: 5,
      resumeGenerationId: 'runway:dead',
      ...fast,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(VideoTaskDeadError);
    expect(error).toMatchObject({ generationId: 'runway:dead' });
    expect(apiCalls().filter(([u]) => String(u).endsWith('/v1/image_to_video'))).toHaveLength(0);
  });

  it('marks a create that fails with a 5xx as unconfirmed, and a 429 as an ordinary error', async () => {
    replies.push({ status: 503, body: {} });
    await expect(animate()).rejects.toBeInstanceOf(VideoTaskUnconfirmedError);
    replies.push({ status: 429, body: {} });
    const refused = await animate().catch((e: unknown) => e);
    expect(refused).not.toBeInstanceOf(VideoTaskUnconfirmedError);
    expect(refused).toMatchObject({ status: 429 });
  });

  it('lets the MP4 export download clips from our own storage host', () => {
    expect(getAllowedStoryboardClipHosts(undefined).has('proj.supabase.co')).toBe(true);
    expect(getAllowedStoryboardClipHosts(undefined, '').has('proj.supabase.co')).toBe(false);
  });
});

describe('provider dispatch', () => {
  it('animates storyboard shots through Runway when it is the configured provider', async () => {
    replies.push(
      { body: { id: 'shot-task' } },
      { body: { id: 'shot-task', status: 'SUCCEEDED', output: ['https://cdn.example/shot.mp4'] } },
    );
    const shot = await animateSingleShot({
      shot: {
        index: 0,
        prompt: 'p',
        hookCaption: 'h',
        durationMs: 2000,
        imageUrl: 'https://img.example/0.png',
        generationId: 'still',
        generatedAt: '2026-11-23T00:00:00Z',
      },
      format: 'portrait',
    });
    expect(shot).toMatchObject({
      videoUrl: `${STORED}shot-task.mp4`,
      videoGenerationId: 'runway:shot-task',
      videoDurationMs: 5000,
    });
  });

  it('exports a Runway fallback clip on an undocumented CDN host with the default allow-list', async () => {
    replies.push({
      body: {
        id: 'fb',
        status: 'SUCCEEDED',
        output: ['https://dnznrvs05pmza.cloudfront.net/new.mp4'],
      },
    });
    const workDir = await mkdtemp(path.join(tmpdir(), 'runway-fallback-'));
    try {
      const clipFetch = vi.fn<typeof fetch>(async () => new Response('mp4-bytes', { status: 200 }));
      const [clip] = await downloadStoryboardClips(
        [
          {
            index: 0,
            videoUrl: 'https://dnznrvs05pmza.cloudfront.net/old.mp4',
            videoGenerationId: 'runway:fb',
          },
        ],
        workDir,
        { fetchImpl: clipFetch as unknown as typeof fetch },
      );
      expect(await readFile(clip!, 'utf8')).toBe('mp4-bytes');
      expect(clipFetch.mock.calls.map(([u]) => String(u))).toEqual([
        'https://dnznrvs05pmza.cloudfront.net/new.mp4',
      ]);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('still refuses a disallowed host on a non-Runway shot without refreshing', async () => {
    const refreshClipUrl = vi.fn();
    const clipFetch = vi.fn();
    await expect(
      downloadStoryboardClips(
        [{ index: 0, videoUrl: 'https://evil.example/x.mp4', videoGenerationId: 'luma-gen' }],
        tmpdir(),
        { fetchImpl: clipFetch as unknown as typeof fetch, refreshClipUrl },
      ),
    ).rejects.toThrow(/not allowed/);
    expect(refreshClipUrl).not.toHaveBeenCalled();
    expect(clipFetch).not.toHaveBeenCalled();
  });

  it('refreshes an expired Runway clip URL during export', async () => {
    replies.push({
      body: { id: 'old', status: 'SUCCEEDED', output: ['https://cdn.example/fresh.mp4'] },
    });
    const workDir = await mkdtemp(path.join(tmpdir(), 'runway-export-'));
    try {
      const clipFetch = vi.fn(async (input: string | URL) =>
        String(input).includes('fresh')
          ? new Response('mp4-bytes', { status: 200 })
          : new Response('expired', { status: 403 }),
      );
      const [clip] = await downloadStoryboardClips(
        [{ index: 0, videoUrl: 'https://cdn.example/stale.mp4', videoGenerationId: 'runway:old' }],
        workDir,
        { fetchImpl: clipFetch as unknown as typeof fetch, allowedHosts: new Set(['cdn.example']) },
      );
      expect(await readFile(clip!, 'utf8')).toBe('mp4-bytes');
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.dev.runwayml.com/v1/tasks/old');
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});
