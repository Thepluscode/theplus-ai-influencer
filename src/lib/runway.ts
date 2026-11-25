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

/**
 * The worker must fail the job, not retry it: a retry could create (and bill)
 * a second paid task for the same shot.
 */
export class UnretryableVideoTaskError extends Error {
  constructor(
    message: string,
    readonly generationId?: string,
  ) {
    super(message);
    this.name = 'UnretryableVideoTaskError';
  }
}

/** The task was created but its id could not be saved for the next tick. */
export class VideoTaskUnsavedError extends UnretryableVideoTaskError {
  constructor(generationId: string, cause: unknown) {
    super(
      `Video task ${generationId} was created but its id could not be saved: ${toMessage(cause)}`,
      generationId,
    );
    this.name = 'VideoTaskUnsavedError';
  }
}

/** The create call failed in a way that may still have started a paid task. */
export class VideoTaskUnconfirmedError extends UnretryableVideoTaskError {
  constructor(cause: unknown) {
    super(`Runway may have started a task whose id we never received: ${toMessage(cause)}`);
    this.name = 'VideoTaskUnconfirmedError';
  }
}

/**
 * The task ended FAILED or CANCELLED. The worker fails the job and clears the
 * saved id, so a later (separately paid) job starts a fresh task instead of
 * re-polling a dead one; nothing inside this job creates a replacement.
 */
export class VideoTaskDeadError extends Error {
  constructor(
    readonly generationId: string,
    message: string,
  ) {
    super(message);
    this.name = 'VideoTaskDeadError';
  }
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
  /** `runway:<id>` of a task an earlier attempt already created: poll it, do not create. */
  resumeGenerationId?: string;
  /** Persist the new task's id before polling, so a retry resumes it. */
  onTaskCreated?: (generationId: string) => Promise<void>;
}): Promise<{ videoUrl: string; generationId: string }> {
  const taskId = input.resumeGenerationId?.startsWith(ID_PREFIX)
    ? input.resumeGenerationId.slice(ID_PREFIX.length)
    : await createTask(input);
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const task = await getTask(taskId);
    if (task.status === 'SUCCEEDED') {
      const videoUrl = task.output[0];
      if (!videoUrl) throw new Error(`Runway task ${taskId} succeeded with no output.`);
      return {
        videoUrl: await persistRunwayClip(taskId, videoUrl),
        generationId: `${ID_PREFIX}${taskId}`,
      };
    }
    if (task.status === 'FAILED' || task.status === 'CANCELLED') {
      const reason = task.status === 'FAILED' ? (task.failureCode ?? task.failure) : 'cancelled';
      throw new VideoTaskDeadError(
        `${ID_PREFIX}${taskId}`,
        `Runway task ${taskId} ${task.status.toLowerCase()}: ${reason ?? 'unknown'}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
  }
  throw new Error(`Runway task ${taskId} did not finish within ${input.timeoutMs / 1000}s.`);
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
    // Ask for the bytes as stored: an encoded body's Content-Length counts the
    // encoded form, and a truncated gzip can decode "successfully" to fewer
    // bytes, so only an unencoded body can be checked for completeness.
    const response = await fetch(source, {
      headers: { 'accept-encoding': 'identity' },
      signal: AbortSignal.timeout(CLIP_DOWNLOAD_TIMEOUT_MS),
    });
    // Exactly 200: a 206 partial body would otherwise be stored as a permanent,
    // truncated clip and reported as success.
    if (response.status !== 200 || !response.body) {
      throw new Error(`Runway clip download failed (${response.status}).`);
    }
    const encoding = response.headers.get('content-encoding');
    if (encoding && encoding.toLowerCase() !== 'identity') {
      throw new Error(
        `Runway clip arrived ${encoding}-encoded; its completeness cannot be checked.`,
      );
    }
    const declaredBytes = response.headers.get('content-length');
    if (Number(declaredBytes ?? 0) > MAX_CLIP_BYTES) {
      throw new Error('Runway clip exceeds the storage size limit.');
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_CLIP_BYTES) {
        await reader.cancel();
        throw new Error('Runway clip exceeds the storage size limit.');
      }
      chunks.push(value);
    }
    if (bytes === 0) throw new Error('Runway clip download was empty.');
    if (declaredBytes !== null && bytes !== Number(declaredBytes)) {
      throw new Error(`Runway clip was truncated (${bytes} of ${declaredBytes} bytes).`);
    }

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

async function createTask(input: {
  imageUrl: string;
  prompt: string;
  format: PostFormat;
  durationSeconds: number;
  onTaskCreated?: (generationId: string) => Promise<void>;
}): Promise<string> {
  let created: { id?: string };
  try {
    created = await runwayRequest<{ id?: string }>(
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
  } catch (err) {
    // A 4xx is Runway refusing the request: nothing started, so the worker may
    // retry a 429 or fail a 400 as usual. A 5xx, timeout or dropped connection
    // may have started a task we have no id for; the worker must not retry.
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number' && status < 500) throw err;
    throw new VideoTaskUnconfirmedError(err);
  }
  if (!created.id)
    throw new VideoTaskUnconfirmedError('Runway image-to-video returned no task id.');
  try {
    await input.onTaskCreated?.(`${ID_PREFIX}${created.id}`);
  } catch (err) {
    throw new VideoTaskUnsavedError(`${ID_PREFIX}${created.id}`, err);
  }
  return created.id;
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
    throw Object.assign(
      new Error(
        `Runway ${init.method} ${pathname.split('/').slice(0, 3).join('/')} failed (${response.status}).`,
      ),
      { status: response.status },
    );
  }
  return (await response.json()) as T;
}
