import 'server-only';
import { z } from 'zod';
import { serverEnv } from '@/lib/env';
import { getLumaClient } from '@/lib/luma';
import { isLumaStubbed } from '@/lib/luma-stub';
import { packItemToPlainText } from '@/lib/content-repackage-schema';

type Aspect = '1:1' | '9:16' | '16:9';

/** Max model-less Luma stills rendered per visual item (bounds cost). */
export const MEDIA_IMAGE_CAP = 3;

// ---------------------------------------------------------------------------
// Content OS — media briefs.
// ---------------------------------------------------------------------------
// Turns a visual pack item (carousel / short-form video) into shot-level
// visual direction the operator can hand to the Storyboard surface or a
// shoot. One OpenAI call (justifies PACK_MEDIA_RENDER); OPENAI_STUB=1 returns
// a deterministic brief. We intentionally do NOT auto-spin Luma renders here:
// that lives in the existing Storyboard flow (per-shot credits) and is a
// manual handoff, so the pipeline never double-charges or leaves half-
// rendered storyboards.
// ---------------------------------------------------------------------------

export interface MediaBrief {
  notes: string;
  scenes: Array<{ shot: string; direction: string }>;
}

const mediaBriefSchema = z.object({
  notes: z.string().trim().min(1),
  scenes: z
    .array(z.object({ shot: z.string().trim().min(1), direction: z.string().trim().min(1) }))
    .min(1),
});

const MEDIA_SYSTEM_PROMPT = `You are a creative director writing concise, shootable visual briefs for short-form social content.

You always respond with ONE valid JSON object: { "notes": "string", "scenes": [{ "shot": "string", "direction": "string" }] }. No prose, no markdown fences.

Rules:
- 3-6 scenes. Each "shot" is a short label; each "direction" is one filmable sentence.
- Stay faithful to the provided copy — visualize it, don't invent a new message.
- "notes" is one line of overall art direction (mood, palette, pacing).`;

export async function generateMediaBrief(channel: string, body: unknown): Promise<MediaBrief> {
  const copy = packItemToPlainText(channel, body).slice(0, 4_000);

  if (serverEnv.OPENAI_STUB) {
    return stubBrief(channel, copy);
  }
  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing — set OPENAI_STUB=1 for a stub media brief.');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_CAPTION_MODEL,
      temperature: 0.6,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: MEDIA_SYSTEM_PROMPT },
        { role: 'user', content: `Channel: ${channel}.\nCopy:\n"""\n${copy}\n"""` },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned no media brief content.');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON media brief: ${raw.slice(0, 200)}`);
  }
  const parsed = mediaBriefSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error('Media brief failed validation.');
  }
  return parsed.data;
}

/** Carousel renders square; short-form video renders 9:16. */
export function aspectForChannel(channel: string): Aspect {
  return channel === 'tiktok_reels' || channel === 'youtube_short' ? '9:16' : '1:1';
}

function stubMediaImage(prompt: string, i: number, aspect: Aspect): string {
  const dims = aspect === '9:16' ? '720/1280' : aspect === '16:9' ? '1280/720' : '900/900';
  const slug = encodeURIComponent(`contentos-media-${i}-${prompt.slice(0, 24)}`);
  return `https://picsum.photos/seed/${slug}/${dims}`;
}

/**
 * Render up to MEDIA_IMAGE_CAP model-less Luma stills from the brief's scene
 * directions. No character_ref — Content OS sources aren't persona-backed, so
 * these are generic on-brand visuals (text-to-image). LUMA_STUB=1 returns
 * deterministic placeholders so the pipeline stays offline-testable.
 */
export async function renderMediaImages(
  scenes: Array<{ direction: string }>,
  aspect: Aspect,
): Promise<string[]> {
  const prompts = scenes.slice(0, MEDIA_IMAGE_CAP).map((s) => s.direction);
  if (prompts.length === 0) return [];

  if (isLumaStubbed()) {
    return prompts.map((p, i) => stubMediaImage(p, i, aspect));
  }

  const client = getLumaClient();
  const results = await Promise.all(
    prompts.map((prompt) =>
      client.generations.image.create({
        model: 'photon-1',
        prompt,
        aspect_ratio: aspect,
        sync: true,
        sync_timeout: 120,
      }),
    ),
  );

  const urls: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const url = results[i].assets?.image;
    if (!url) {
      throw new Error(`Media image ${i} failed: ${results[i].failure_reason ?? 'no image URL'}`);
    }
    urls.push(url);
  }
  return urls;
}

function stubBrief(channel: string, copy: string): MediaBrief {
  const lines = copy
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);
  const scenes = (lines.length ? lines : ['Open on the hook']).map((line, i) => ({
    shot: `Shot ${i + 1}`,
    direction: line.slice(0, 160),
  }));
  return {
    notes: `Stub media brief for ${channel}: cinematic, high-contrast, fast cuts, brand palette.`,
    scenes,
  };
}
