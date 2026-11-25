import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// The slice's media claim, checked on the artifact rather than in arithmetic:
// a stub script of N shots, each animated to a 5s clip (what the storyboard
// worker asks Luma for), exported by the real renderer, must yield an MP4 of
// 30-60s. Clips are SYNTHETIC lavfi fixtures, not provider output. The output
// is measured with a separate ffprobe call, not the renderer's own report.
// ---------------------------------------------------------------------------

vi.mock('@/lib/env', () => ({ serverEnv: { OPENAI_STUB: '1' } }));
vi.mock('@/lib/luma', () => ({ getLumaClient: () => ({}) }));

const { generateStoryboardScript } = await import('@/lib/storyboard');
const { renderStoryboardMp4 } = await import('@/lib/storyboard-export');

const CLIP_SECONDS = 5; // storyboard-animate calls animateSingleShot without a duration → 5s
const COLORS = ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan'];
let workDir = '';

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

function fixtureClip(dir: string, i: number): string {
  const file = path.join(dir, `clip-${i}.mp4`);
  execFileSync('ffmpeg', [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${COLORS[i % COLORS.length]}:s=360x640:r=24:d=${CLIP_SECONDS}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${220 + i * 40}:sample_rate=48000:duration=${CLIP_SECONDS}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    file,
  ]);
  return file;
}

function probe(file: string) {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration,format_name:stream=codec_type,codec_name,width,height',
    '-of',
    'json',
    file,
  ]).toString();
  return JSON.parse(out) as {
    format: { duration: string; format_name: string };
    streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
  };
}

describe('storyboard reel duration (fixture clips, real ffmpeg)', () => {
  it.each([6, 11])(
    'a %i-shot storyboard exports a 30-60s portrait MP4',
    async (shotCount) => {
      workDir ||= await mkdtemp(path.join(tmpdir(), 'reel-duration-'));
      const script = await generateStoryboardScript({
        brief: 'fixture reel',
        format: 'portrait',
        model: { name: 'Ada', wizard_input: {} } as never,
        shotCount,
      });
      expect(script.shots).toHaveLength(shotCount);

      const clips = script.shots.map((s) => fixtureClip(workDir, s.index));
      const outputPath = path.join(workDir, `reel-${shotCount}.mp4`);
      const rendered = await renderStoryboardMp4({
        clipPaths: clips,
        format: 'portrait',
        workDir,
        outputPath,
        timeoutMs: 240_000,
      });

      const p = probe(outputPath);
      const seconds = Number(p.format.duration);
      const video = p.streams.find((s) => s.codec_type === 'video');
      const audio = p.streams.find((s) => s.codec_type === 'audio');
      expect(seconds).toBeGreaterThanOrEqual(30);
      expect(seconds).toBeLessThanOrEqual(60);
      expect(Math.abs(seconds - shotCount * CLIP_SECONDS)).toBeLessThan(0.5);
      expect(p.format.format_name).toContain('mp4');
      expect(video).toMatchObject({ codec_name: 'h264', width: 720, height: 1280 });
      expect(audio?.codec_name).toBe('aac');
      // The renderer's own report agrees with the independent probe.
      expect(Math.abs(rendered.durationMs / 1000 - seconds)).toBeLessThan(0.1);

      if (process.env.REEL_EVIDENCE_DIR) {
        await copyFile(
          outputPath,
          path.join(process.env.REEL_EVIDENCE_DIR, `reel-${shotCount}.mp4`),
        );
      }
    },
    300_000,
  );
});
