import 'server-only';
import { serverEnv } from '@/lib/env';
import { getLumaClient } from '@/lib/luma';
import { stubStoryboardImage, stubStoryboardVideo } from '@/lib/luma-stub';
import type { AiModelRow } from '@/lib/supabase/types';
import { FORMAT_TO_ASPECT, type PostFormat } from '@/types/post';

// ---------------------------------------------------------------------------
// Video Storyboarder — v3 of STRATEGY.md
// ---------------------------------------------------------------------------
// Given a model + brief, produces a 3-6 shot reel in three phases:
//   1. generateStoryboardScript — OpenAI breaks the brief into shot prompts.
//   2. renderShots             — Luma (photon-1) renders a face-locked still
//                                per shot via character_ref.
//   3. animateSingleShot       — Luma (ray-flash-2) animates each still to a
//                                short clip, driven async by the cron worker
//                                (api/jobs/storyboard-animate), one shot per
//                                invocation so no request is held open across
//                                the whole reel.
//
// OPENAI_STUB / LUMA_STUB both bypass external calls for dev.
// ---------------------------------------------------------------------------

export interface ShotPrompt {
  index: number;
  prompt: string;
  hookCaption: string;
  /** Optional per-shot duration suggestion in ms. */
  durationMs: number;
}

export interface RenderedShot extends ShotPrompt {
  imageUrl: string;
  generationId: string;
  generatedAt: string;
  /** Set when the shot has been animated to video via Dream Machine. */
  videoUrl?: string;
  videoGenerationId?: string;
  /** Source duration of the video clip itself (Luma returns 5s or 9s). */
  videoDurationMs?: number;
}

export interface StoryboardScript {
  summary: string;
  shots: ShotPrompt[];
}

const SYSTEM_PROMPT = `You are an elite reel/short-form video director for AI influencer personas. You break a single campaign brief into a 3–6 shot reel where every shot ladders into the next.

Output rules:
- ALWAYS respond with ONE valid JSON object. No prose, no markdown fences.
- summary: one sentence framing the arc of the reel.
- shots: array of 3 to 6 shots. Each shot:
  { index (0-based), prompt (vivid Luma prompt 1-2 sentences, do NOT describe the persona — character_ref handles identity), hookCaption (text-overlay copy for that shot), durationMs (1500-4000) }

Direction rules:
- Open with a hook that stops the scroll.
- Build a beat: setup → tension → payoff → tag.
- Every shot must give Luma a concrete, render-ready scene (not "establishing shot of mood").
- Vary camera framing (close, mid, wide) across shots.
- Last shot lands the CTA implicitly via composition, not on-screen text.`;

/**
 * Phase 1 — generate the script (LLM call).
 */
export async function generateStoryboardScript(input: {
  brief: string;
  format: PostFormat;
  model: AiModelRow;
  shotCount?: number;
}): Promise<StoryboardScript> {
  const target = clampShotCount(input.shotCount ?? 4);

  if (serverEnv.OPENAI_STUB) {
    return stubScript(input.brief, target);
  }
  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing — set OPENAI_STUB=1 for placeholder scripts.');
  }

  const personaDesc = describePersona(input.model);
  const userPrompt = `Reel brief: ${input.brief}

Persona: ${personaDesc} (face is locked via character_ref — do NOT describe their appearance in shot prompts).
Aspect / format: ${input.format} (${FORMAT_TO_ASPECT[input.format]}).
Target shot count: ${target}.

Return JSON:
{
  "summary": "...",
  "shots": [
    { "index": 0, "prompt": "...", "hookCaption": "...", "durationMs": 2500 },
    ...
  ]
}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_CAPTION_MODEL,
      temperature: 0.85,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned no script content.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`);
  }
  return normalizeScript(parsed, target);
}

/**
 * Phase 2 — render every shot in parallel against the persona's
 * character_ref so the face stays locked across the reel.
 */
export async function renderShots(input: {
  script: StoryboardScript;
  model: AiModelRow;
  format: PostFormat;
}): Promise<RenderedShot[]> {
  if (serverEnv.LUMA_STUB) {
    return input.script.shots.map((s, i) => ({
      ...s,
      imageUrl: stubStoryboardImage(input.model.name, i, input.script.shots.length),
      generationId: `stub-${i}`,
      generatedAt: new Date().toISOString(),
    }));
  }

  const client = getLumaClient();
  const aspect = FORMAT_TO_ASPECT[input.format];
  const calls = input.script.shots.map((shot) =>
    client.generations.image.create({
      model: 'photon-1',
      prompt: shot.prompt,
      aspect_ratio: aspect,
      sync: true,
      sync_timeout: 120,
      character_ref: { identity0: { images: [input.model.portrait_url] } },
    }),
  );
  const results = await Promise.all(calls);

  const rendered: RenderedShot[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const shot = input.script.shots[i];
    const url = r.assets?.image;
    if (!url) {
      throw new Error(
        `Storyboard shot ${i} failed: ${r.failure_reason ?? 'no image URL returned'}`,
      );
    }
    rendered.push({
      ...shot,
      imageUrl: url,
      generationId: r.id ?? '',
      generatedAt: new Date().toISOString(),
    });
  }
  return rendered;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clampShotCount(n: number): number {
  if (!Number.isFinite(n)) return 4;
  return Math.max(3, Math.min(6, Math.round(n)));
}

function describePersona(m: AiModelRow): string {
  const w = m.wizard_input;
  return [w.gender, w.bodyType, `${w.skinTone} skin`, w.ageRange, `${w.vibe} aesthetic`].join(', ');
}

function normalizeScript(parsed: unknown, target: number): StoryboardScript {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Storyboard script was not an object.');
  }
  const obj = parsed as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' ? obj.summary : '';
  const rawShots = Array.isArray(obj.shots) ? obj.shots : [];
  const shots: ShotPrompt[] = [];
  for (let i = 0; i < rawShots.length && shots.length < target; i++) {
    const r = (rawShots[i] ?? {}) as Record<string, unknown>;
    const prompt = typeof r.prompt === 'string' ? r.prompt.trim() : '';
    if (!prompt) continue;
    shots.push({
      index: shots.length,
      prompt,
      hookCaption: typeof r.hookCaption === 'string' ? r.hookCaption.trim() : '',
      durationMs: clampDuration(r.durationMs),
    });
  }
  if (shots.length < 3) {
    throw new Error('Storyboard script needs at least 3 shots.');
  }
  return { summary, shots };
}

function clampDuration(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 2500;
  return Math.max(1500, Math.min(4000, Math.round(v)));
}

function stubScript(brief: string, target: number): StoryboardScript {
  const beats = [
    {
      prompt:
        'Wide cinematic establishing shot at golden hour, soft warm rim light, persona walking in.',
      hookCaption: 'this changed everything',
      durationMs: 2500,
    },
    {
      prompt:
        'Tight close-up on hands holding the product, shallow depth of field, neutral color grade.',
      hookCaption: 'so I tried this',
      durationMs: 2000,
    },
    {
      prompt:
        'Medium shot, persona reacting to using/wearing the product, natural smile, hard rim light.',
      hookCaption: 'and then →',
      durationMs: 2500,
    },
    {
      prompt:
        'Cinematic over-the-shoulder shot, persona looking out a window, soft blur in background.',
      hookCaption: "i'm never going back",
      durationMs: 2500,
    },
    {
      prompt: 'Final hero shot, persona center frame, confident pose, vivid cinematic color grade.',
      hookCaption: 'link in bio',
      durationMs: 3000,
    },
    {
      prompt:
        'Product detail still life on a clean surface, lifestyle props, magazine-cover finish.',
      hookCaption: '',
      durationMs: 2000,
    },
  ];
  return {
    summary: `Stub reel for "${brief.slice(0, 60)}…" — ${target} shots, OPENAI_STUB=1 active.`,
    shots: beats.slice(0, target).map((b, i) => ({ index: i, ...b })),
  };
}

// ---------------------------------------------------------------------------
// Animate-to-video — Luma Dream Machine
// ---------------------------------------------------------------------------
// Takes already-rendered shots (each with imageUrl) and animates each one
// to a short clip using Luma's video API. The image is used as `frame0`
// so the animation starts exactly from the still we already approved.
//
// Video generation is async on Luma's end — we poll until each completes
// or the per-shot timeout fires. All shots fire in parallel.
//
// Cost is charged separately by the caller (server action). This function
// is pure I/O.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000;
const PER_SHOT_TIMEOUT_MS = 4 * 60_000; // 4 min — Luma video typically 60-120s

type LumaAspect = '9:16' | '1:1' | '16:9';

function aspectForFormat(format: PostFormat): LumaAspect {
  if (format === 'portrait') return '9:16';
  if (format === 'landscape') return '16:9';
  return '1:1';
}

/**
 * Animate exactly one shot. Used by the cron worker so each invocation
 * processes a single shot (60-90s) and returns, instead of holding an
 * HTTP request open across the whole reel. Returns the shot with
 * videoUrl populated.
 */
export async function animateSingleShot(input: {
  shot: RenderedShot;
  format: PostFormat;
  durationSeconds?: 5 | 9;
}): Promise<RenderedShot> {
  const duration = input.durationSeconds ?? 5;

  if (serverEnv.LUMA_STUB) {
    return {
      ...input.shot,
      videoUrl: stubStoryboardVideo(input.shot.index, 1),
      videoGenerationId: `stub-video-${input.shot.index}`,
      videoDurationMs: duration * 1000,
    };
  }

  const client = getLumaClient();
  const aspect = aspectForFormat(input.format);

  const created = await client.generations.video.create({
    model: 'ray-flash-2',
    aspect_ratio: aspect,
    duration: `${duration}s`,
    prompt: input.shot.prompt,
    keyframes: {
      frame0: { type: 'image', url: input.shot.imageUrl },
    },
  });
  if (!created.id) {
    throw new Error('Luma video generation returned no id.');
  }
  const finished = await pollUntilComplete(client, created.id);
  const videoUrl = (finished as { assets?: { video?: string } }).assets?.video;
  if (!videoUrl) {
    throw new Error(
      `Shot ${input.shot.index} video generation did not produce a URL (state=${finished.state ?? 'unknown'}).`,
    );
  }
  return {
    ...input.shot,
    videoUrl,
    videoGenerationId: finished.id ?? '',
    videoDurationMs: duration * 1000,
  };
}

async function pollUntilComplete(
  client: ReturnType<typeof getLumaClient>,
  generationId: string,
): Promise<{ state?: string; assets?: { video?: string }; id?: string; failure_reason?: string }> {
  const deadline = Date.now() + PER_SHOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const g = await client.generations.get(generationId);
    if (g.state === 'completed') return g;
    if (g.state === 'failed') {
      throw new Error(`Luma video ${generationId} failed: ${g.failure_reason ?? 'unknown reason'}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Luma video ${generationId} did not complete within ${PER_SHOT_TIMEOUT_MS / 1000}s.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
