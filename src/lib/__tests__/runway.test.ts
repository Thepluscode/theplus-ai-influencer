// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.STORYBOARD_VIDEO_PROVIDER = 'runway';
  process.env.RUNWAYML_API_SECRET = 'test-runway-secret';
  process.env.LUMA_STUB = '';
});

vi.mock('@/lib/luma', () => ({
  getLumaClient: () => {
    throw new Error('Luma must not be called when the provider is Runway');
  },
}));

import { animateWithRunway, isRunwayGenerationId, refreshRunwayVideoUrl } from '@/lib/runway';
import { animateSingleShot } from '@/lib/storyboard';
import { downloadStoryboardClips } from '@/lib/storyboard-export';

type Reply = { status?: number; body: unknown };
let replies: Reply[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  replies = [];
  fetchMock = vi.fn(async () => {
    const next = replies.shift();
    if (!next) throw new Error('Unexpected fetch');
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

    expect(result).toEqual({ videoUrl: 'https://cdn.example/v.mp4', generationId: 'runway:task-1' });
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
    await animateWithRunway({ imageUrl: 'https://i', prompt: 'p', format, durationSeconds: 5, ...fast });
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)).ratio).toBe(ratio);
  });

  it('surfaces a failed task with its failure code', async () => {
    replies.push(
      { body: { id: 'task-2' } },
      { body: { id: 'task-2', status: 'FAILED', failureCode: 'SAFETY.INPUT.IMAGE' } },
    );
    await expect(
      animateWithRunway({ imageUrl: 'https://i', prompt: 'p', format: 'portrait', durationSeconds: 5, ...fast }),
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
      animateWithRunway({ imageUrl: 'https://i', prompt: 'p', format: 'portrait', durationSeconds: 5, ...fast }),
    ).rejects.toThrow('returned no task id');
  });

  it('reports an HTTP error without echoing the request', async () => {
    replies.push({ status: 401, body: { error: 'bad key' } });
    await expect(
      animateWithRunway({ imageUrl: 'https://i', prompt: 'p', format: 'portrait', durationSeconds: 5, ...fast }),
    ).rejects.toThrow('Runway POST /v1/image_to_video failed (401).');
  });
});

describe('Runway URL refresh', () => {
  it('recognises only prefixed ids', () => {
    expect(isRunwayGenerationId('runway:abc')).toBe(true);
    expect(isRunwayGenerationId('abc')).toBe(false);
  });

  it('re-reads the task for a fresh output URL', async () => {
    replies.push({ body: { id: 'abc', status: 'SUCCEEDED', output: ['https://cdn.example/fresh.mp4'] } });
    await expect(refreshRunwayVideoUrl('runway:abc')).resolves.toBe('https://cdn.example/fresh.mp4');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.dev.runwayml.com/v1/tasks/abc');
  });

  it('refuses a Luma id and a task that is no longer available', async () => {
    await expect(refreshRunwayVideoUrl('luma-id')).rejects.toThrow('Not a Runway generation id');
    replies.push({ body: { id: 'gone', status: 'CANCELLED' } });
    await expect(refreshRunwayVideoUrl('runway:gone')).rejects.toThrow('no longer available');
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
      videoUrl: 'https://cdn.example/shot.mp4',
      videoGenerationId: 'runway:shot-task',
      videoDurationMs: 5000,
    });
  });

  it('refreshes an expired Runway clip URL during export', async () => {
    replies.push({ body: { id: 'old', status: 'SUCCEEDED', output: ['https://cdn.example/fresh.mp4'] } });
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
