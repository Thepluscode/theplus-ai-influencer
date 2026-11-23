import 'server-only';

import { serverEnv } from '@/lib/env';
import { fetchWithRetry } from '@/lib/fetch-retry';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { PostFormat } from '@/types/post';

// Runway image-to-video as a second shot-animation provider.
//
// Contract taken from the official @runwayml/sdk 4.29.0 types (2026-11-20):
// POST /v1/image_to_video → { id }; GET /v1/tasks/{id} → status PENDING |
// THROTTLED | RUNNING | SUCCEEDED (output: string[]) | FAILED | CANCELLED.
// Output URLs expire within 24–48 h, so each finished clip is copied into our
// `storyboard-clips` bucket (migration 0035) and that URL is stored instead.
// If the copy fails the Runway URL is kept; re-reading the task returns a fresh
// one, which is how the MP4 export still recovers an expired clip.

const API_BASE = 'https://api.dev.runwayml.com';
const API_VERSION = '2024-11-06';
/** Generation ids we store are prefixed so later readers know the provider. */
const ID_PREFIX = 'runway:';
const CLIP_BUCKET = 'storyboard-clips';
/** Matches the bucket's file_size_limit (0035). */
const MAX_CLIP_BYTES = 100 * 1024 * 1024;
const CLIP_DOWNLOAD_TIMEOUT_MS = 60_000;

const RATIO: Record<PostFormat, '720:1280' | '1280:720' | '960:960'> = {
  portrait: '720:1280',
  landscape: '1280:720',
  square: '960:960',
};

type RunwayTask =
  | { id: string; status: 'PENDING' | 'THROTTLED' | 'RUNNING' | 'CANCELLED' }
  | { id: string; status: 'SUCCEEDED'; output: string[] }
  | { id: string; status: 'FAILED'; failure?: string; failureCode?: string };

export function isRunwayGenerationId(id: string): boolean {
  return id.startsWith(ID_PREFIX);
}

export async function animateWithRunway(input: {
  imageUrl: string;
  prompt: string;
  format: PostFormat;
  durationSeconds: number;
  timeoutMs: number;
  pollIntervalMs: number;
}): Promise<{ videoUrl: string; generationId: string }> {
  const created = await runwayRequest<{ id?: string }>(
    '/v1/image_to_video',
    {
      method: 'POST',
      body: JSON.stringify({
        model: serverEnv.RUNWAY_VIDEO_MODEL,
        promptImage: input.imageUrl,
        promptText: input.prompt.slice(0, 1000),
        ratio: RATIO[input.format],
        duration: input.durationSeconds,
      }),
    },
    // Never retry the create: a dropped response or 5xx may still have started
    // a paid task, and a retry would start (and bill) a second one.
    0,
  );
  if (!created.id) throw new Error('Runway image-to-video returned no task id.');

  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const task = await getTask(created.id);
    if (task.status === 'SUCCEEDED') {
      const videoUrl = task.output[0];
      if (!videoUrl) throw new Error(`Runway task ${created.id} succeeded with no output.`);
      return {
        videoUrl: await persistRunwayClip(created.id, videoUrl),
        generationId: `${ID_PREFIX}${created.id}`,
      };
    }
    if (task.status === 'FAILED' || task.status === 'CANCELLED') {
      const reason = task.status === 'FAILED' ? (task.failureCode ?? task.failure) : 'cancelled';
      throw new Error(
        `Runway task ${created.id} ${task.status.toLowerCase()}: ${reason ?? 'unknown'}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
  }
  throw new Error(`Runway task ${created.id} did not finish within ${input.timeoutMs / 1000}s.`);
}

/**
 * Copies a finished Runway clip into our storage and returns its permanent
 * public URL. Never throws: the paid task already succeeded, and failing here
 * would send the worker into a retry that creates (and bills) a second task.
 * On failure it logs and returns the Runway URL, which the export can refresh.
 */
async function persistRunwayClip(taskId: string, runwayUrl: string): Promise<string> {
  const objectPath = `runway/${taskId}.mp4`;
  try {
    const source = new URL(runwayUrl);
    if (source.protocol !== 'https:') throw new Error('Runway output URL is not https.');
    const response = await fetch(source, {
      signal: AbortSignal.timeout(CLIP_DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Runway clip download failed (${response.status}).`);
    }
    if (Number(response.headers.get('content-length') ?? 0) > MAX_CLIP_BYTES) {
      throw new Error('Runway clip exceeds the storage size limit.');
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > MAX_CLIP_BYTES) throw new Error('Runway clip exceeds the storage size limit.');
      chunks.push(chunk);
    }
    if (bytes === 0) throw new Error('Runway clip download was empty.');

    const storage = getSupabaseAdminClient().storage.from(CLIP_BUCKET);
    const { error } = await storage.upload(objectPath, Buffer.concat(chunks), {
      contentType: 'video/mp4',
      cacheControl: '31536000',
      upsert: true,
    });
    if (error) throw new Error(`Clip upload failed: ${error.message}`);
    return storage.getPublicUrl(objectPath).data.publicUrl;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: 'runway_clip_persist_failed',
        taskId,
        error: err instanceof Error ? err.message : String(err),
        fallback: 'runway_url_expires_24_48h',
      }),
    );
    return runwayUrl;
  }
}

/** Fresh output URL for a stored `runway:<taskId>` generation id. */
export async function refreshRunwayVideoUrl(generationId: string): Promise<string> {
  if (!isRunwayGenerationId(generationId)) {
    throw new Error('Not a Runway generation id.');
  }
  const task = await getTask(generationId.slice(ID_PREFIX.length));
  if (task.status !== 'SUCCEEDED' || !task.output[0]) {
    throw new Error(`Runway clip ${generationId} is no longer available for export.`);
  }
  return task.output[0];
}

async function getTask(id: string): Promise<RunwayTask> {
  const task = await runwayRequest<RunwayTask>(`/v1/tasks/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
  if (!task || typeof task.status !== 'string') {
    throw new Error(`Runway task ${id} returned an unreadable status.`);
  }
  return task;
}

async function runwayRequest<T>(pathname: string, init: RequestInit, retries = 2): Promise<T> {
  if (!serverEnv.RUNWAYML_API_SECRET) {
    throw new Error('STORYBOARD_VIDEO_PROVIDER=runway but RUNWAYML_API_SECRET is not set.');
  }
  const response = await fetchWithRetry(
    `${API_BASE}${pathname}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${serverEnv.RUNWAYML_API_SECRET}`,
        'X-Runway-Version': API_VERSION,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    },
    { retries },
  );
  if (!response.ok) {
    throw new Error(
      `Runway ${init.method} ${pathname.split('/').slice(0, 3).join('/')} failed (${response.status}).`,
    );
  }
  return (await response.json()) as T;
}
