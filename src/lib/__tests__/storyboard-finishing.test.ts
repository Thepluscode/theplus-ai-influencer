// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// env.ts parses process.env at import, so the stub flag must be set first.
vi.hoisted(() => {
  process.env.OPENAI_STUB = '1';
});

import { renderStoryboardMp4 } from '@/lib/storyboard-export';
import {
  MAX_CAPTION_CHARS,
  burnableCaption,
  captionTextForShot,
  prepareShotFinishing,
  renderCaptionPng,
} from '@/lib/storyboard-finishing';

const fixtureDir = path.resolve(process.cwd(), 'src/test/fixtures/videos');
const silentClip = path.join(fixtureDir, '02-green-silent.mp4');
const portrait = { width: 720, height: 1280 };
const workDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(workDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('caption text', () => {
  it('normalises whitespace and bounds length', () => {
    expect(captionTextForShot({ hookCaption: '  Stop\n scrolling  ' })).toBe('Stop scrolling');
    expect(captionTextForShot({ hookCaption: '   ' })).toBeNull();
    expect(captionTextForShot({})).toBeNull();
    expect(captionTextForShot({ hookCaption: 42 })).toBeNull();
    const long = captionTextForShot({ hookCaption: 'x'.repeat(500) });
    expect(long).toHaveLength(MAX_CAPTION_CHARS);
    expect(long?.endsWith('…')).toBe(true);
  });
});

describe('caption PNG', () => {
  // The renderer inlines its WASM as a data: URL; anything else is a real
  // network request (Google Fonts with the caption text, or an emoji CDN).
  const networkCalls = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([input]) => !String(input).startsWith('data:'));

  it('renders Latin captions, accents and currency at export size with no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const png = await renderCaptionPng('Café naïve façade — €5 “today”', portrait);

    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(720);
    expect(png.readUInt32BE(20)).toBe(1280);
    expect(networkCalls(fetchSpy)).toEqual([]);
  });

  it('drops emoji from the burned text and refuses scripts the font lacks', async () => {
    expect(burnableCaption('Launch day 🎬🔥')).toBe('Launch day');
    expect(burnableCaption('👍🏽')).toBeNull();
    expect(burnableCaption('日本語 キャプション')).toBeNull();
    expect(burnableCaption('مرحبا')).toBeNull();
    await expect(renderCaptionPng('日本語', portrait)).rejects.toThrow('cannot be rendered offline');
  });

  it('prepares an unburned shot (but keeps narration) for a non-Latin caption', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const workDir = await makeWorkDir();
    const [finish] = await prepareShotFinishing({
      shots: [{ hookCaption: '日本語 キャプション 🎬' }],
      dimensions: portrait,
      workDir,
      voiceover: true,
      remainingMs: () => 60_000,
    });

    expect(finish).toMatchObject({ captionPath: null });
    expect(finish?.voicePath).toMatch(/finish-00\.wav$/);
    expect(networkCalls(fetchSpy)).toEqual([]);
  });
});

describe('finished MP4 (real ffmpeg)', () => {
  it('burns the caption into the caption region and leaves the rest of the frame alone', async () => {
    const plain = await renderOne(null);
    const captioned = await renderOne({ voiceover: false });

    expect(plain.rendered.captionedShots).toBe(0);
    expect(captioned.rendered.captionedShots).toBe(1);
    // Caption sits in the lower part of the frame.
    expect(frameRegion(captioned.output, 'lower').equals(frameRegion(plain.output, 'lower'))).toBe(
      false,
    );
    // Positive twin: the top of the frame is untouched.
    expect(frameRegion(captioned.output, 'top').equals(frameRegion(plain.output, 'top'))).toBe(
      true,
    );
  });

  it('mixes the narration in at full level over a silent clip', async () => {
    const silent = await renderOne(null);
    const voiced = await renderOne({ voiceover: true });

    expect(voiced.rendered.voicedShots).toBe(1);
    const silentDb = meanVolumeDb(silent.output);
    const sourceDb = meanVolumeDb(path.join(path.dirname(voiced.output), 'finish-00.wav'));
    const voicedDb = meanVolumeDb(voiced.output);
    expect(silentDb).toBeLessThan(-80);
    // Measured: source -9.0 dB → output -12.3 dB (mono→stereo upmix costs
    // ~3 dB). amix's default normalisation would cost another ~6 dB.
    expect(voicedDb).toBeGreaterThan(sourceDb - 5);
  });

  it('cuts narration longer than its clip at the clip end', async () => {
    const plain = await renderOne(null);
    const voiced = await renderOne({ voiceover: true, caption: 'x'.repeat(150) });

    expect(Math.abs(voiced.rendered.durationMs - plain.rendered.durationMs)).toBeLessThan(80);
  });

  it('rejects finishing that does not line up with the clips', async () => {
    const workDir = await makeWorkDir();
    await expect(
      renderStoryboardMp4({
        clipPaths: [silentClip],
        format: 'portrait',
        workDir,
        outputPath: path.join(workDir, 'out.mp4'),
        finishing: [],
      }),
    ).rejects.toThrow('Shot finishing does not match');
  });
});

async function renderOne(finish: { voiceover: boolean; caption?: string } | null) {
  const workDir = await makeWorkDir();
  const output = path.join(workDir, 'out.mp4');
  const finishing = finish
    ? await prepareShotFinishing({
        shots: [{ hookCaption: finish.caption ?? 'Wait for the reveal' }],
        dimensions: portrait,
        workDir,
        voiceover: finish.voiceover,
        remainingMs: () => 60_000,
      })
    : undefined;
  const rendered = await renderStoryboardMp4({
    clipPaths: [silentClip],
    format: 'portrait',
    workDir,
    outputPath: output,
    finishing,
  });
  return { output, rendered };
}

function frameRegion(file: string, region: 'top' | 'lower'): Buffer {
  const crop = region === 'top' ? 'crop=720:300:0:0' : 'crop=720:400:0:780';
  return execFileSync('ffmpeg', [
    '-v',
    'error',
    '-ss',
    '0.2',
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    crop,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'gray',
    '-',
  ]);
}

function meanVolumeDb(file: string): number {
  // volumedetect reports on stderr.
  const result = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const match = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(result.stderr);
  if (!match) throw new Error(`volumedetect produced no reading: ${result.stderr.slice(-300)}`);
  return match[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(match[1]);
}

async function makeWorkDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'theplus-finishing-test-'));
  workDirs.push(dir);
  return dir;
}
