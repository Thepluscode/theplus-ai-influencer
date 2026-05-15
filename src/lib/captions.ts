import 'server-only';
import { serverEnv } from '@/lib/env';
import type { InfluencerWizardInput } from '@/types/influencer';
import type { PostBriefInput, Platform } from '@/types/post';

// ---------------------------------------------------------------------------
// Caption Writer + Cross-Platform Reformatter
// ---------------------------------------------------------------------------
// v1 wedge from STRATEGY.md. Two roles, one module:
//  1. Generate three on-brand caption candidates for a given post.
//  2. Reformat the chosen caption per-platform (length, hook style,
//     hashtag count, mention conventions) so one approved post ships
//     natively to every connected channel.
//
// We call OpenAI directly via fetch (no SDK dep) and ask the model to
// return JSON. OPENAI_STUB=1 returns deterministic placeholders so the UI
// can be developed without burning credits.
// ---------------------------------------------------------------------------

export interface CaptionCandidate {
  /** Stable id within a single response (`a` / `b` / `c`) for selection. */
  id: string;
  /** The caption body — newlines allowed. */
  caption: string;
  /** Hashtag list without the `#` prefix. UI prepends as needed. */
  hashtags: string[];
  /** One-line angle/voice description for the operator. */
  angle: string;
}

export interface PlatformVariant {
  platform: Platform;
  caption: string;
  hashtags: string[];
  /** Platform-specific hook line (TikTok / Reels openers, X first-line). */
  hook?: string;
}

export interface CaptionsResult {
  candidates: CaptionCandidate[];
  /** Per-platform reformatting of the FIRST candidate (operator can re-run
   *  reformatForPlatforms after picking a different one). */
  perPlatform: PlatformVariant[];
}

interface GenerateInput {
  model: {
    name: string;
    wizard_input: InfluencerWizardInput;
  };
  brief: PostBriefInput;
}

const SYSTEM_PROMPT = `You are an elite social media copywriter for AI influencer personas. You write captions that stop the scroll and match the persona's voice exactly.

You always respond with ONE valid JSON object matching the requested schema. No prose, no markdown fences, no commentary.

Voice rules:
- Match the persona's vibe, age, and brand tone precisely.
- Open with a hook that earns the second line.
- Avoid hashtag spam in the body — put hashtags in the dedicated array.
- Avoid emoji vomit. One or two, deliberate.
- Avoid "in this video", "swipe to", or other lazy social tropes.

Platform conventions (when generating per-platform variants):
- Instagram: 80–200 chars body, 8–15 hashtags, can break with line spacing, niche + branded tags work.
- TikTok: SHORT — punchy hook ≤ 80 chars, 3–6 hashtags, hook IS the caption.
- Twitter / X: ≤ 240 chars total, NO hashtags or 1–2 max, witty single-line preferred.
- YouTube: 100–250 chars, 0–5 hashtags, can include a CTA to subscribe.
- Facebook: friendly + conversational, 1–3 hashtags max, can be longer (200–400 chars).
- Threads: ≤ 200 chars, 0 hashtags, conversational starter.
- LinkedIn: professional reframing, 0–3 hashtags, story arc.
- Pinterest: keyword-dense description, 2–5 hashtags, SEO-style.
- Reddit: no hashtags ever, value-first, subreddit-appropriate voice.`;

export async function generateCaptions(input: GenerateInput): Promise<CaptionsResult> {
  if (serverEnv.OPENAI_STUB) {
    return stubCaptions(input);
  }

  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY missing — set it in .env.local or set OPENAI_STUB=1 for placeholders.',
    );
  }

  const userPrompt = buildUserPrompt(input);
  const body = {
    model: serverEnv.OPENAI_CAPTION_MODEL,
    temperature: 0.85,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI returned no caption content.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON content: ${raw.slice(0, 200)}`);
  }

  return normalizeResult(parsed, input.brief.platforms);
}

export interface ReformatInput {
  caption: string;
  hashtags?: string[];
  model: { name: string; wizard_input: InfluencerWizardInput };
  brief: PostBriefInput;
  platforms: Platform[];
}

export async function reformatForPlatforms(input: ReformatInput): Promise<PlatformVariant[]> {
  if (serverEnv.OPENAI_STUB) {
    return stubReformat(input);
  }

  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing — set OPENAI_STUB=1 for placeholders.');
  }

  const userPrompt = `Reformat this caption natively for each target platform. Same idea, different voice and length per platform.

Persona: ${input.model.name} — ${describePersona(input.model.wizard_input)}.
Brand tone: ${input.brief.brandTone}. CTA intent: ${input.brief.cta}.
${input.brief.brandVibe ? `Brand vibe: ${input.brief.brandVibe}.` : ''}
${input.brief.brandPalette ? `Brand palette: ${input.brief.brandPalette}.` : ''}

Approved caption to reformat:
"""
${input.caption}
"""

${input.hashtags?.length ? `Original hashtag bank: ${input.hashtags.map((h) => `#${h}`).join(' ')}` : ''}

Target platforms: ${input.platforms.join(', ')}.

Return JSON: { "perPlatform": [ { "platform": "<one of ${input.platforms.join('|')}>", "caption": "...", "hashtags": ["..."], "hook": "..." }, ... ] }. The "hook" field is only required for TikTok / YouTube / Reels-style platforms.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_CAPTION_MODEL,
      temperature: 0.7,
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
  if (!raw) throw new Error('OpenAI returned no reformat content.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`);
  }
  return normalizePlatformVariants(parsed, input.platforms);
}

// ---------------------------------------------------------------------------
// Prompt + normalization helpers
// ---------------------------------------------------------------------------

function describePersona(p: InfluencerWizardInput): string {
  return [
    p.gender,
    p.bodyType,
    p.skinTone + ' skin',
    p.ageRange,
    p.hair,
    `${p.vibe} aesthetic`,
    p.customPrompt,
  ]
    .filter(Boolean)
    .join(', ');
}

function buildUserPrompt({ model, brief }: GenerateInput): string {
  return `Generate 3 caption candidates for a new post, plus one platform-native variant for each target platform.

Persona: "${model.name}" — ${describePersona(model.wizard_input)}.
Campaign: "${brief.name}".
Brief: ${brief.brief}.
${brief.scene ? `Scene: ${brief.scene}.\n` : ''}${brief.outfit ? `Outfit: ${brief.outfit}.\n` : ''}${brief.props ? `Props: ${brief.props}.\n` : ''}Brand tone: ${brief.brandTone}.
${brief.brandVibe ? `Brand vibe: ${brief.brandVibe}.\n` : ''}${brief.brandPalette ? `Brand palette: ${brief.brandPalette}.\n` : ''}
CTA intent: ${brief.cta === 'no_cta' ? 'no explicit CTA, let the content carry' : brief.cta.replace(/_/g, ' ')}.
Target platforms: ${brief.platforms.join(', ')}.
Format: ${brief.format}.

Return JSON:
{
  "candidates": [
    { "id": "a", "caption": "...", "hashtags": ["tag1", "tag2"], "angle": "one-line angle description" },
    { "id": "b", ... },
    { "id": "c", ... }
  ],
  "perPlatform": [
    { "platform": "<one of ${brief.platforms.join('|')}>", "caption": "...", "hashtags": ["..."], "hook": "..." }
  ]
}

The three candidates should take genuinely different angles (e.g. story / question hook / declarative). The perPlatform array reformats the FIRST candidate natively per platform.`;
}

function normalizeResult(parsed: unknown, platforms: Platform[]): CaptionsResult {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Caption response was not an object.');
  }
  const obj = parsed as Record<string, unknown>;
  const candidatesRaw = Array.isArray(obj.candidates) ? obj.candidates : [];
  const candidates: CaptionCandidate[] = candidatesRaw
    .slice(0, 3)
    .map((c, i) => normalizeCandidate(c, i));
  if (candidates.length === 0) {
    throw new Error('Caption response had no candidates.');
  }
  const perPlatform = normalizePlatformVariants(obj, platforms);
  return { candidates, perPlatform };
}

function normalizeCandidate(c: unknown, i: number): CaptionCandidate {
  const obj = (c ?? {}) as Record<string, unknown>;
  const fallback = ['a', 'b', 'c'][i] ?? `c${i}`;
  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : fallback,
    caption: typeof obj.caption === 'string' ? obj.caption.trim() : '',
    hashtags: Array.isArray(obj.hashtags)
      ? obj.hashtags
          .map((h) => (typeof h === 'string' ? h.replace(/^#/, '').trim() : ''))
          .filter(Boolean)
      : [],
    angle: typeof obj.angle === 'string' ? obj.angle : '',
  };
}

function normalizePlatformVariants(parsed: unknown, platforms: Platform[]): PlatformVariant[] {
  if (!parsed || typeof parsed !== 'object') return [];
  const arr = (parsed as Record<string, unknown>).perPlatform;
  if (!Array.isArray(arr)) return [];
  const allowed = new Set(platforms);
  const out: PlatformVariant[] = [];
  for (const v of arr) {
    const obj = (v ?? {}) as Record<string, unknown>;
    const platform = obj.platform as Platform;
    if (!allowed.has(platform)) continue;
    const variant: PlatformVariant = {
      platform,
      caption: typeof obj.caption === 'string' ? obj.caption.trim() : '',
      hashtags: Array.isArray(obj.hashtags)
        ? obj.hashtags
            .map((h) => (typeof h === 'string' ? h.replace(/^#/, '').trim() : ''))
            .filter((h): h is string => Boolean(h))
        : [],
    };
    if (typeof obj.hook === 'string' && obj.hook.trim()) {
      variant.hook = obj.hook.trim();
    }
    out.push(variant);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stub mode — used when OPENAI_STUB=1 OR when we want a sane fallback for
// local dev. Outputs are deterministic and reference the actual brief so
// the operator sees their inputs reflected back.
// ---------------------------------------------------------------------------

function stubCaptions({ model, brief }: GenerateInput): CaptionsResult {
  const persona = model.name;
  const subject = brief.brief.length > 80 ? brief.brief.slice(0, 80) + '…' : brief.brief;
  const ctaLine = brief.cta === 'no_cta' ? '' : ` (${brief.cta.replace(/_/g, ' ')})`;
  const hashtagPool = [
    'aicreator',
    'aiinfluencer',
    'aigenerated',
    model.wizard_input.vibe,
    brief.format,
    ...(brief.platforms.includes('instagram') ? ['reels', 'ig'] : []),
    ...(brief.platforms.includes('tiktok') ? ['fyp', 'foryou'] : []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const candidates: CaptionCandidate[] = [
    {
      id: 'a',
      angle: 'Story-first — vulnerable / personal hook',
      caption: `${persona} here. Honestly didn't think I'd post this. ${subject}${ctaLine}`,
      hashtags: hashtagPool,
    },
    {
      id: 'b',
      angle: 'Question hook — invites engagement',
      caption: `Question for you: ${subject}\n\nSwipe through and tell me what you'd pick.${ctaLine}`,
      hashtags: hashtagPool,
    },
    {
      id: 'c',
      angle: 'Declarative — confident brand-voice statement',
      caption: `This is the look. ${subject}${ctaLine}\n\n— ${persona}`,
      hashtags: hashtagPool,
    },
  ];

  const perPlatform = brief.platforms.map<PlatformVariant>((platform) =>
    stubVariantFor(platform, candidates[0], persona, subject),
  );

  return { candidates, perPlatform };
}

function stubReformat({
  caption,
  hashtags = [],
  platforms,
  model,
}: ReformatInput): PlatformVariant[] {
  const subject = caption.length > 80 ? caption.slice(0, 80) + '…' : caption;
  return platforms.map((platform) =>
    stubVariantFor(platform, { id: 'reformat', caption, hashtags, angle: '' }, model.name, subject),
  );
}

function stubVariantFor(
  platform: Platform,
  base: CaptionCandidate,
  persona: string,
  subject: string,
): PlatformVariant {
  switch (platform) {
    case 'instagram':
      return {
        platform,
        caption: `${base.caption}\n\n.\n.\n.\n#${base.hashtags.slice(0, 12).join(' #')}`,
        hashtags: base.hashtags.slice(0, 15),
      };
    case 'tiktok':
      return {
        platform,
        caption: subject,
        hook: `wait til you see what ${persona} did →`,
        hashtags: ['fyp', 'foryou', ...base.hashtags.slice(0, 4)],
      };
    case 'twitter':
      return {
        platform,
        caption: subject.length > 240 ? subject.slice(0, 237) + '…' : subject,
        hashtags: [],
      };
    case 'youtube':
      return {
        platform,
        caption: `${base.caption}\n\nSubscribe for more from ${persona}. New drops every week.`,
        hook: `${persona}: ${subject}`,
        hashtags: base.hashtags.slice(0, 5),
      };
    case 'facebook':
      return {
        platform,
        caption: `${base.caption}\n\nWhat do you think? Let me know in the comments.`,
        hashtags: base.hashtags.slice(0, 3),
      };
    case 'linkedin':
      return {
        platform,
        caption: `${base.caption}\n\nA quick story from ${persona} on what we're shipping next.\n\nWhat would you change?`,
        hashtags: base.hashtags.slice(0, 3),
      };
    case 'pinterest':
      return {
        platform,
        caption: `${subject} — saved to ${persona}'s mood board.`,
        hashtags: base.hashtags.slice(0, 5),
      };
    case 'threads':
      return {
        platform,
        caption: subject.length > 200 ? subject.slice(0, 197) + '…' : subject,
        hashtags: [],
      };
    case 'reddit':
      return {
        platform,
        caption: `${base.caption}\n\n— ${persona}\n\n(no hashtags, this is reddit)`,
        hashtags: [],
      };
  }
}
