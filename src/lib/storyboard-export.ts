import 'server-only';

import { spawn } from 'node:child_process';
import { open, readFile, stat, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { z } from 'zod';
import { serverEnv } from '@/lib/env';
import { getLumaClient } from '@/lib/luma';
import { isRunwayGenerationId, refreshRunwayVideoUrl } from '@/lib/runway';
import type { ShotFinishing } from '@/lib/storyboard-finishing';
import type { PostFormat } from '@/types/post';

const ExportShotSchema = z
  .object({
    index: z.number().int().nonnegative(),
    videoUrl: z.string().url(),
    videoGenerationId: z.string().min(1).optional(),
    // Feeds the burned caption and the paid speech call, so it is bounded.
    hookCaption: z.string().max(2000).optional(),
  })
  .passthrough();

export type ExportShot = z.infer<typeof ExportShotSchema>;

export const STORYBOARD_EXPORT_BUCKET = 'storyboard-exports';

const DEFAULT_ALLOWED_CLIP_HOSTS = new Set([
  'storage.cdn-luma.com',
  'commondatastorage.googleapis.com',
]);
const MAX_REDIRECTS = 3;

const DIMENSIONS: Record<PostFormat, { width: number; height: number }> = {
  portrait: { width: 720, height: 1280 },
  square: { width: 720, height: 720 },
  landscape: { width: 1280, height: 720 },
};

export interface RenderedMp4 {
  path: string;
  bytes: number;
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
  sourceAudioShots: number;
  captionedShots: number;
  voicedShots: number;
}

export function getAllowedStoryboardClipHosts(
  configured = serverEnv.STORYBOARD_EXPORT_ALLOWED_CLIP_HOSTS,
): ReadonlySet<string> {
  const hosts = new Set(DEFAULT_ALLOWED_CLIP_HOSTS);
  if (!configured) return hosts;

  for (const entry of configured.split(',')) {
    const host = entry.trim().toLowerCase();
    if (!host) continue;
    const parsed = new URL(`https://${host}`);
    if (
      parsed.hostname !== host ||
      parsed.port ||
      parsed.pathname !== '/' ||
      isIP(host) !== 0 ||
      !host.includes('.')
    ) {
      throw new Error(`Invalid storyboard export clip host: ${entry.trim()}.`);
    }
    hosts.add(host);
  }
  return hosts;
}

interface ProbeResult {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
  }>;
  format?: { duration?: string };
}

interface DownloadDependencies {
  fetchImpl?: typeof fetch;
  refreshClipUrl?: (generationId: string) => Promise<string>;
  allowedHosts?: ReadonlySet<string>;
  timeoutMs?: number;
}

export function parseExportShots(value: unknown): ExportShot[] {
  const parsed = z.array(ExportShotSchema).min(1).safeParse(value);
  if (!parsed.success) {
    throw new Error('The approved storyboard snapshot contains an invalid or missing video clip.');
  }
  const indices = new Set(parsed.data.map((shot) => shot.index));
  if (indices.size !== parsed.data.length) {
    throw new Error('The approved storyboard snapshot contains duplicate shot indices.');
  }
  return parsed.data;
}

export function assertAllowedStoryboardClipUrl(
  value: string,
  allowedHosts: ReadonlySet<string> = DEFAULT_ALLOWED_CLIP_HOSTS,
): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !allowedHosts.has(url.hostname)
  ) {
    throw new Error(`Storyboard clip host is not allowed: ${url.hostname || 'unknown'}.`);
  }
  return url;
}

export async function downloadStoryboardClips(
  shots: ExportShot[],
  workDir: string,
  dependencies: DownloadDependencies = {},
): Promise<string[]> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const refreshClipUrl = dependencies.refreshClipUrl ?? refreshProviderClipUrl;
  const allowedHosts = dependencies.allowedHosts ?? getAllowedStoryboardClipHosts();
  const deadline = Date.now() + (dependencies.timeoutMs ?? 90_000);
  const paths: string[] = [];

  for (const [position, shot] of shots.entries()) {
    const destination = path.join(workDir, `source-${position.toString().padStart(2, '0')}.mp4`);
    try {
      await downloadClip(shot.videoUrl, destination, fetchImpl, allowedHosts, deadline);
    } catch (error) {
      if (!isExpiredProviderUrl(error) || !shot.videoGenerationId) throw error;
      const refreshedUrl = await withTimeout(
        refreshClipUrl(shot.videoGenerationId),
        remainingMs(deadline),
      );
      await downloadClip(refreshedUrl, destination, fetchImpl, allowedHosts, deadline);
    }
    paths.push(destination);
  }

  return paths;
}

export function storyboardExportDimensions(format: PostFormat): { width: number; height: number } {
  return DIMENSIONS[format];
}

export async function renderStoryboardMp4(input: {
  clipPaths: string[];
  format: PostFormat;
  /** Per-shot caption PNG / voiceover audio, aligned with clipPaths. */
  finishing?: ShotFinishing[];
  workDir: string;
  outputPath: string;
  timeoutMs?: number;
  ffmpegPath?: string;
  ffprobePath?: string;
}): Promise<RenderedMp4> {
  if (input.clipPaths.length === 0) throw new Error('At least one clip is required for export.');

  const ffmpegPath = input.ffmpegPath ?? serverEnv.FFMPEG_PATH ?? 'ffmpeg';
  const ffprobePath = input.ffprobePath ?? serverEnv.FFPROBE_PATH ?? 'ffprobe';
  const timeoutMs = input.timeoutMs ?? 90_000;
  const dimensions = DIMENSIONS[input.format];
  const deadline = Date.now() + timeoutMs;
  const normalized: string[] = [];
  let sourceAudioShots = 0;
  let captionedShots = 0;
  let voicedShots = 0;
  if (input.finishing && input.finishing.length !== input.clipPaths.length) {
    throw new Error('Shot finishing does not match the clips being exported.');
  }

  for (const [position, clipPath] of input.clipPaths.entries()) {
    const probe = await probeMedia(ffprobePath, clipPath, remainingMs(deadline));
    const video = probe.streams?.find((stream) => stream.codec_type === 'video');
    if (!video) throw new Error(`Shot ${position + 1} is not a playable video.`);
    const duration = mediaDurationSeconds(probe, video.duration);
    const hasSourceAudio = Boolean(probe.streams?.some((stream) => stream.codec_type === 'audio'));
    if (hasSourceAudio) sourceAudioShots += 1;

    const normalizedPath = path.join(
      input.workDir,
      `normalized-${position.toString().padStart(2, '0')}.mp4`,
    );
    const videoFilter = `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=increase,crop=${dimensions.width}:${dimensions.height},fps=30,format=yuv420p`;
    const finish = input.finishing?.[position];
    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', clipPath];
    let nextInput = 1;
    let baseAudio: string;
    if (hasSourceAudio) {
      baseAudio = `[0:a:0]aresample=async=1:first_pts=0,apad`;
    } else {
      args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
      baseAudio = `[${nextInput}:a:0]asetpts=N/SR/TB`;
      nextInput += 1;
    }
    const filters = [`[0:v:0]${videoFilter}[base]`];
    if (finish?.captionPath) {
      args.push('-loop', '1', '-i', finish.captionPath);
      filters.push(`[base][${nextInput}:v:0]overlay=0:0:shortest=1,format=yuv420p[v]`);
      nextInput += 1;
      captionedShots += 1;
    } else {
      filters.push('[base]null[v]');
    }
    if (finish?.voicePath) {
      args.push('-i', finish.voicePath);
      // Duck the clip's own audio under the narration. normalize=0 keeps the
      // voice at full level (amix otherwise halves every input). A line longer
      // than its clip is cut at the clip's end by -t below.
      filters.push(
        `${baseAudio},volume=0.35[bg]`,
        `[${nextInput}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad[vo]`,
        '[bg][vo]amix=inputs=2:duration=first:normalize=0[a]',
      );
      nextInput += 1;
      voicedShots += 1;
    } else {
      filters.push(`${baseAudio}[a]`);
    }
    args.push('-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]');

    args.push(
      '-t',
      duration.toFixed(3),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      normalizedPath,
    );
    await runProcess(ffmpegPath, args, remainingMs(deadline));
    normalized.push(normalizedPath);
  }

  const concatPath = path.join(input.workDir, 'concat.txt');
  await writeFile(
    concatPath,
    normalized.map((item) => `file '${path.basename(item)}'`).join('\n') + '\n',
    'utf8',
  );
  await runProcess(
    ffmpegPath,
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      path.basename(concatPath),
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      input.outputPath,
    ],
    remainingMs(deadline),
    input.workDir,
  );

  const outputProbe = await probeMedia(ffprobePath, input.outputPath, remainingMs(deadline));
  const outputVideo = outputProbe.streams?.find((stream) => stream.codec_type === 'video');
  const hasAudio = Boolean(outputProbe.streams?.some((stream) => stream.codec_type === 'audio'));
  if (
    !outputVideo ||
    outputVideo.width !== dimensions.width ||
    outputVideo.height !== dimensions.height ||
    !hasAudio
  ) {
    throw new Error('Rendered MP4 failed video, dimension, or audio-track validation.');
  }
  const outputStat = await stat(input.outputPath);
  const durationMs = Math.round(mediaDurationSeconds(outputProbe, outputVideo.duration) * 1000);
  if (outputStat.size <= 0 || durationMs <= 0) {
    throw new Error('Rendered MP4 is empty or has no playable duration.');
  }

  return {
    path: input.outputPath,
    bytes: outputStat.size,
    durationMs,
    width: dimensions.width,
    height: dimensions.height,
    hasAudio,
    sourceAudioShots,
    captionedShots,
    voicedShots,
  };
}

export async function readRenderedMp4(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

async function downloadClip(
  source: string,
  destination: string,
  fetchImpl: typeof fetch,
  allowedHosts: ReadonlySet<string>,
  deadline: number,
): Promise<void> {
  const response = await fetchAllowed(source, fetchImpl, allowedHosts, deadline);
  if (!response.ok) {
    throw new ClipDownloadError(response.status, `Clip download failed (${response.status}).`);
  }
  if (!response.body) throw new Error('Clip download returned an empty body.');
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > serverEnv.STORYBOARD_EXPORT_MAX_CLIP_BYTES) {
    throw new Error('Storyboard clip exceeds the export size limit.');
  }

  const file = await open(destination, 'w');
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      remainingMs(deadline);
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > serverEnv.STORYBOARD_EXPORT_MAX_CLIP_BYTES) {
        throw new Error('Storyboard clip exceeds the export size limit.');
      }
      await file.write(value);
    }
  } finally {
    await file.close();
  }
  if (bytes === 0) throw new Error('Storyboard clip download was empty.');
}

async function fetchAllowed(
  source: string,
  fetchImpl: typeof fetch,
  allowedHosts: ReadonlySet<string>,
  deadline: number,
): Promise<Response> {
  let current = assertAllowedStoryboardClipUrl(source, allowedHosts);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetchImpl(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(30_000, remainingMs(deadline))),
      headers: { Accept: 'video/mp4,video/*;q=0.9,application/octet-stream;q=0.8' },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error('Clip provider returned a redirect without a destination.');
    current = assertAllowedStoryboardClipUrl(new URL(location, current).toString(), allowedHosts);
  }
  throw new Error('Clip provider returned too many redirects.');
}

async function refreshProviderClipUrl(generationId: string): Promise<string> {
  return isRunwayGenerationId(generationId)
    ? refreshRunwayVideoUrl(generationId)
    : refreshLumaClipUrl(generationId);
}

async function refreshLumaClipUrl(generationId: string): Promise<string> {
  const generation = await getLumaClient().generations.get(generationId);
  const videoUrl = generation.assets?.video;
  if (generation.state !== 'completed' || !videoUrl) {
    throw new Error(`Luma clip ${generationId} is no longer available for export.`);
  }
  return videoUrl;
}

async function probeMedia(
  ffprobePath: string,
  filePath: string,
  timeoutMs: number,
): Promise<ProbeResult> {
  const output = await runProcess(
    ffprobePath,
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath],
    timeoutMs,
  );
  try {
    return JSON.parse(output.stdout) as ProbeResult;
  } catch {
    throw new Error('ffprobe returned invalid media metadata.');
  }
}

function mediaDurationSeconds(probe: ProbeResult, streamDuration?: string): number {
  const duration = Number(probe.format?.duration ?? streamDuration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Video clip has no usable duration.');
  }
  return duration;
}

function remainingMs(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Storyboard export exceeded its worker timeout.');
  return remaining;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Storyboard export exceeded its worker timeout.')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function runProcess(
  binary: string,
  args: string[],
  timeoutMs: number,
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 16_000) stderr += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Unable to start ${path.basename(binary)}: ${error.message}`));
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const reason = signal ? `terminated by ${signal}` : `exited with code ${code ?? 'unknown'}`;
      reject(new Error(`${path.basename(binary)} ${reason}: ${stderr.trim() || 'no diagnostics'}`));
    });
  });
}

class ClipDownloadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isExpiredProviderUrl(error: unknown): boolean {
  return error instanceof ClipDownloadError && [401, 403, 404, 410].includes(error.status);
}
