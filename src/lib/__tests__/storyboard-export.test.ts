import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertAllowedStoryboardClipUrl,
  downloadStoryboardClips,
  getAllowedStoryboardClipHosts,
  parseExportShots,
  renderStoryboardMp4,
} from '@/lib/storyboard-export';

const fixtureDir = path.resolve(process.cwd(), 'src/test/fixtures/videos');
const workDirs: string[] = [];

afterEach(async () => {
  await Promise.all(workDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('storyboard MP4 export', () => {
  it('renders one playable MP4 in frozen shot order with duration, dimensions, and audio', async () => {
    const workDir = await makeWorkDir();
    const outputPath = path.join(workDir, 'ordered.mp4');
    const rendered = await renderStoryboardMp4({
      clipPaths: [
        path.join(fixtureDir, '01-red-audio.mp4'),
        path.join(fixtureDir, '02-green-silent.mp4'),
        path.join(fixtureDir, '03-blue-audio.mp4'),
      ],
      format: 'portrait',
      workDir,
      outputPath,
    });

    expect(rendered.bytes).toBeGreaterThan(1_000);
    expect(rendered.durationMs).toBeGreaterThanOrEqual(1_450);
    expect(rendered.durationMs).toBeLessThanOrEqual(1_650);
    expect(rendered).toMatchObject({
      width: 720,
      height: 1280,
      hasAudio: true,
      sourceAudioShots: 2,
    });

    expect(dominantChannel(samplePixel(outputPath, 0.2))).toBe('red');
    expect(dominantChannel(samplePixel(outputPath, 0.7))).toBe('green');
    expect(dominantChannel(samplePixel(outputPath, 1.2))).toBe('blue');
  }, 30_000);

  it.each([
    ['square', 720, 720],
    ['landscape', 1280, 720],
  ] as const)(
    'renders the requested %s aspect ratio',
    async (format, width, height) => {
      const workDir = await makeWorkDir();
      const rendered = await renderStoryboardMp4({
        clipPaths: [path.join(fixtureDir, '02-green-silent.mp4')],
        format,
        workDir,
        outputPath: path.join(workDir, `${format}.mp4`),
      });
      expect(rendered).toMatchObject({ width, height, hasAudio: true, sourceAudioShots: 0 });
    },
    30_000,
  );

  it('rejects malformed or duplicate frozen shots', () => {
    expect(() => parseExportShots([{ index: 0 }])).toThrow(/invalid or missing video clip/i);
    expect(() =>
      parseExportShots([
        { index: 0, videoUrl: 'https://storage.cdn-luma.com/a.mp4' },
        { index: 0, videoUrl: 'https://storage.cdn-luma.com/b.mp4' },
      ]),
    ).toThrow(/duplicate shot indices/i);
  });

  it('allows only explicit HTTPS provider destinations', () => {
    expect(
      assertAllowedStoryboardClipUrl('https://storage.cdn-luma.com/path/video.mp4').hostname,
    ).toBe('storage.cdn-luma.com');
    expect(() => assertAllowedStoryboardClipUrl('http://storage.cdn-luma.com/video.mp4')).toThrow(
      /not allowed/i,
    );
    expect(() => assertAllowedStoryboardClipUrl('https://127.0.0.1/video.mp4')).toThrow(
      /not allowed/i,
    );
    expect(() =>
      assertAllowedStoryboardClipUrl('https://storage.cdn-luma.com@127.0.0.1/video.mp4'),
    ).toThrow(/not allowed/i);
  });

  it('extends the destination allowlist only with operator-controlled exact hostnames', () => {
    const hosts = getAllowedStoryboardClipHosts(
      'media.example.com, izfwasxgfdisvlxjlvzs.supabase.co',
    );
    expect(hosts).toEqual(
      new Set([
        'storage.cdn-luma.com',
        'commondatastorage.googleapis.com',
        'media.example.com',
        'izfwasxgfdisvlxjlvzs.supabase.co',
      ]),
    );
    expect(() => getAllowedStoryboardClipHosts('127.0.0.1')).toThrow(/invalid/i);
    expect(() => getAllowedStoryboardClipHosts('media.example.com:8443')).toThrow(/invalid/i);
    expect(() => getAllowedStoryboardClipHosts('media.example.com/path')).toThrow(/invalid/i);
  });

  it('refreshes an expired provider URL by generation id before downloading', async () => {
    const workDir = await makeWorkDir();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/expired.mp4')) return new Response(null, { status: 403 });
      return new Response(new Uint8Array([0, 1, 2, 3]), {
        status: 200,
        headers: { 'content-length': '4' },
      });
    }) as unknown as typeof fetch;
    const refreshClipUrl = vi.fn(async () => 'https://fixtures.example/refreshed.mp4');

    const paths = await downloadStoryboardClips(
      [
        {
          index: 0,
          videoUrl: 'https://fixtures.example/expired.mp4',
          videoGenerationId: 'generation-1',
        },
      ],
      workDir,
      { fetchImpl, refreshClipUrl, allowedHosts: new Set(['fixtures.example']) },
    );

    expect(refreshClipUrl).toHaveBeenCalledWith('generation-1');
    expect(await readFile(paths[0])).toEqual(Buffer.from([0, 1, 2, 3]));
  });

  it('validates every redirect destination instead of following an SSRF redirect', async () => {
    const workDir = await makeWorkDir();
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/private' },
        }),
    ) as unknown as typeof fetch;

    await expect(
      downloadStoryboardClips(
        [{ index: 0, videoUrl: 'https://fixtures.example/clip.mp4' }],
        workDir,
        { fetchImpl, allowedHosts: new Set(['fixtures.example']) },
      ),
    ).rejects.toThrow(/not allowed/i);
  });

  it('bounds provider downloads by the worker deadline', async () => {
    const workDir = await makeWorkDir();
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    ) as unknown as typeof fetch;

    await expect(
      downloadStoryboardClips(
        [{ index: 0, videoUrl: 'https://fixtures.example/clip.mp4' }],
        workDir,
        { fetchImpl, allowedHosts: new Set(['fixtures.example']), timeoutMs: 20 },
      ),
    ).rejects.toThrow();
  });
});

async function makeWorkDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'storyboard-export-test-'));
  workDirs.push(dir);
  return dir;
}

function samplePixel(filePath: string, atSeconds: number): [number, number, number] {
  const output = execFileSync('ffmpeg', [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(atSeconds),
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-vf',
    'scale=1:1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ]);
  return [output[0], output[1], output[2]];
}

function dominantChannel([red, green, blue]: [number, number, number]): 'red' | 'green' | 'blue' {
  if (red > green && red > blue) return 'red';
  if (green > red && green > blue) return 'green';
  return 'blue';
}
