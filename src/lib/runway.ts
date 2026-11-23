import 'server-only';

import { serverEnv } from '@/lib/env';
import { fetchWithRetry } from '@/lib/fetch-retry';
import type { PostFormat } from '@/types/post';

// Runway image-to-video as a second shot-animation provider.
//
// Contract taken from the official @runwayml/sdk 4.29.0 types (2026-11-20):
// POST /v1/image_to_video → { id }; GET /v1/tasks/{id} → status PENDING |
// THROTTLED | RUNNING | SUCCEEDED (output: string[]) | FAILED | CANCELLED.
// Output URLs expire within 24–48 h; re-reading the task returns fresh ones,
// which is how the MP4 export refreshes an expired clip.

const API_BASE = 'https://api.dev.runwayml.com';
const API_VERSION = '2024-11-06';
/** Generation ids we store are prefixed so later readers know the provider. */
const ID_PREFIX = 'runway:';

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
      return { videoUrl, generationId: `${ID_PREFIX}${created.id}` };
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
