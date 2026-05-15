import 'server-only';
import { serverEnv } from '@/lib/env';
import type { InfluencerWizardInput } from '@/types/influencer';
import type {
  BrandTone,
  CTA,
  LightingStyle,
  Platform,
  PostFormat,
  PostGoal,
} from '@/types/post';

// ---------------------------------------------------------------------------
// Series Planner — v2 of STRATEGY.md
// ---------------------------------------------------------------------------
// Given a model + goal + duration + cadence, generates a content arc of
// per-post briefs the operator can one-click into /create-post. This is
// the "the app does my job FOR me" feature that's supposed to convert
// trial users into subscribers.
//
// OPENAI_STUB=1 returns deterministic placeholders so the UI can be
// developed without burning credits.
// ---------------------------------------------------------------------------

export interface PlanInput {
  model: { name: string; wizard_input: InfluencerWizardInput };
  /** Plan-level brief — campaign frame ("launch citrus drink"). */
  campaign: string;
  goal: PostGoal;
  durationDays: number;
  cadencePerWeek: number;
  /** ISO date YYYY-MM-DD — start of the arc. */
  startDate: string;
  /** Platforms to bias the plan toward. */
  platforms: Platform[];
}

export interface PlanItem {
  /** 0-indexed offset from `startDate`. */
  day: number;
  /** Computed ISO timestamp the post is recommended for. */
  scheduledAt: string;
  /** One-line angle ("Friday morning routine"). */
  theme: string;
  /** Detailed campaign brief for the /create-post wizard. */
  brief: string;
  scene: string;
  outfit: string;
  props: string;
  hook: string;
  postGoal: PostGoal;
  lighting: LightingStyle;
  platforms: Platform[];
  format: PostFormat;
  brandTone: BrandTone;
  cta: CTA;
}

export interface PlanResult {
  items: PlanItem[];
  /** Optional headline / summary the model can return for the plan as a
   *  whole — surfaced above the per-day cards. */
  summary?: string;
}

const SYSTEM_PROMPT = `You are an elite social media strategist for AI influencer accounts. You design content arcs that build awareness, engagement, and conversion across weeks — not one-off posts.

Output rules:
- ALWAYS respond with ONE valid JSON object matching the requested schema. No prose, no markdown fences.
- Every plan item must have: day (0-indexed integer), theme (short label), brief (3-5 sentences a copywriter could shoot from), scene, outfit, props, hook (one-line caption opener), postGoal, lighting, platforms (subset of the briefed set), format (square|portrait|landscape), brandTone, cta.

Voice rules:
- Each post should feel like a real day in the persona's life, not a checklist.
- Vary post format across the arc (don't ship 14 squares in a row).
- Time-of-day matters: morning routines, evening reflections, mid-day product drops.
- Build narrative momentum across the arc: setup days, payoff days, recap days.
- Match the persona's vibe; don't suggest "luxury" routines for a "street" persona.`;

export async function generateSeriesPlan(input: PlanInput): Promise<PlanResult> {
  if (serverEnv.OPENAI_STUB) {
    return stubPlan(input);
  }
  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY missing — set it in .env.local or set OPENAI_STUB=1 for placeholders.',
    );
  }

  const userPrompt = buildUserPrompt(input);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_CAPTION_MODEL,
      temperature: 0.8,
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
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned no plan content.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`);
  }
  return normalize(parsed, input);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describePersona(p: InfluencerWizardInput): string {
  return [
    p.gender,
    p.bodyType,
    `${p.skinTone} skin`,
    p.ageRange,
    p.hair,
    `${p.vibe} aesthetic`,
    p.customPrompt,
  ]
    .filter(Boolean)
    .join(', ');
}

function buildUserPrompt(i: PlanInput): string {
  const postCount = Math.max(
    1,
    Math.round((i.durationDays * i.cadencePerWeek) / 7),
  );
  return `Plan ${postCount} posts across ${i.durationDays} days starting ${i.startDate}.

Persona: "${i.model.name}" — ${describePersona(i.model.wizard_input)}.
Campaign: ${i.campaign}.
Plan goal: ${i.goal} (each post can have its own postGoal field, but the arc should serve this top-level goal).
Cadence: ${i.cadencePerWeek} posts/week.
Target platforms: ${i.platforms.join(', ')}.

Return JSON:
{
  "summary": "one-line narrative of the arc",
  "items": [
    {
      "day": 0,
      "theme": "kickoff · introduce persona",
      "brief": "...",
      "scene": "...",
      "outfit": "...",
      "props": "...",
      "hook": "...",
      "postGoal": "awareness|engagement|launch|sales|community",
      "lighting": "natural|golden_hour|studio|neon|overcast|cinematic",
      "platforms": ["instagram", ...],
      "format": "square|portrait|landscape",
      "brandTone": "professional|casual|playful|luxe|edgy",
      "cta": "shop_now|learn_more|sign_up|swipe_up|dm_me|no_cta"
    },
    ...
  ]
}

Spread days evenly across the duration — don't bunch posts at the start.`;
}

const PLATFORM_SET = new Set<Platform>([
  'instagram',
  'tiktok',
  'twitter',
  'youtube',
  'facebook',
  'linkedin',
  'pinterest',
  'threads',
  'reddit',
]);
const FORMATS = new Set(['square', 'portrait', 'landscape']);
const POST_GOALS = new Set(['awareness', 'engagement', 'launch', 'sales', 'community']);
const LIGHTING = new Set([
  'natural',
  'golden_hour',
  'studio',
  'neon',
  'overcast',
  'cinematic',
]);
const TONES = new Set(['professional', 'casual', 'playful', 'luxe', 'edgy']);
const CTAS = new Set([
  'shop_now',
  'learn_more',
  'sign_up',
  'swipe_up',
  'dm_me',
  'no_cta',
]);

function normalize(parsed: unknown, input: PlanInput): PlanResult {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Plan response was not an object.');
  }
  const obj = parsed as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const summary = typeof obj.summary === 'string' ? obj.summary : undefined;

  const items: PlanItem[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const day = typeof r.day === 'number' ? Math.floor(r.day) : NaN;
    if (!Number.isFinite(day) || day < 0 || day >= input.durationDays) continue;

    // Each platform / enum value comes back from the LLM unsanitized;
    // tighten to our supported sets and drop anything that doesn't fit.
    const platforms = Array.isArray(r.platforms)
      ? (r.platforms as unknown[])
          .filter((p): p is Platform => typeof p === 'string' && PLATFORM_SET.has(p as Platform))
      : [];
    const format = FORMATS.has(r.format as string) ? (r.format as PostFormat) : 'square';
    const postGoal = POST_GOALS.has(r.postGoal as string)
      ? (r.postGoal as PostGoal)
      : input.goal;
    const lighting = LIGHTING.has(r.lighting as string)
      ? (r.lighting as LightingStyle)
      : 'natural';
    const brandTone = TONES.has(r.brandTone as string)
      ? (r.brandTone as BrandTone)
      : 'casual';
    const cta = CTAS.has(r.cta as string) ? (r.cta as CTA) : 'no_cta';

    items.push({
      day,
      scheduledAt: computeScheduledAt(input.startDate, day),
      theme: asString(r.theme, 'Post'),
      brief: asString(r.brief, ''),
      scene: asString(r.scene, ''),
      outfit: asString(r.outfit, ''),
      props: asString(r.props, ''),
      hook: asString(r.hook, ''),
      postGoal,
      lighting,
      platforms: platforms.length > 0 ? platforms : input.platforms,
      format,
      brandTone,
      cta,
    });
  }

  items.sort((a, b) => a.day - b.day);
  if (items.length === 0) {
    throw new Error('Plan response had no usable items.');
  }
  return { items, summary };
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function computeScheduledAt(startDate: string, day: number): string {
  const d = new Date(startDate + 'T18:00:00');
  d.setDate(d.getDate() + day);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Stub plan — deterministic, structurally identical to a real plan.
// ---------------------------------------------------------------------------

function stubPlan({
  model,
  campaign,
  goal,
  durationDays,
  cadencePerWeek,
  startDate,
  platforms,
}: PlanInput): PlanResult {
  const targetCount = Math.max(
    1,
    Math.round((durationDays * cadencePerWeek) / 7),
  );
  const stride = Math.max(1, Math.floor(durationDays / targetCount));
  const items: PlanItem[] = [];
  const themes = [
    'Kickoff · introduce the persona',
    'Lifestyle · morning routine',
    'Product first look',
    'Behind-the-scenes B-roll',
    'Engagement · ask the audience',
    'Story · how we got here',
    'Launch day · the drop',
    'Reaction recap',
    'User-generated showcase',
    'Closing CTA / encore',
  ];
  for (let i = 0; i < targetCount; i++) {
    const day = Math.min(durationDays - 1, i * stride);
    const theme = themes[i % themes.length];
    items.push({
      day,
      scheduledAt: computeScheduledAt(startDate, day),
      theme,
      brief: `${theme} — ${model.name} carries the ${campaign} arc. Frame it as a slice of a real day, not an ad.`,
      scene: i % 2 === 0 ? 'rooftop at golden hour' : 'minimalist studio backdrop',
      outfit: model.wizard_input.vibe === 'luxury' ? 'tailored neutrals' : 'streetwear staples',
      props: i === 2 ? 'the product, held casually in frame' : '',
      hook: `Day ${day + 1}: ${theme}.`,
      postGoal: goal,
      lighting: i % 3 === 0 ? 'golden_hour' : i % 3 === 1 ? 'natural' : 'studio',
      platforms,
      format: i % 3 === 0 ? 'portrait' : 'square',
      brandTone: model.wizard_input.vibe === 'luxury' ? 'luxe' : 'casual',
      cta: i === targetCount - 1 ? 'shop_now' : 'no_cta',
    });
  }
  return {
    summary: `${targetCount}-post arc for "${campaign}" over ${durationDays} days — placeholder content, OPENAI_STUB=1 active.`,
    items,
  };
}
