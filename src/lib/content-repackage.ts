import 'server-only';
import { serverEnv } from '@/lib/env';
import { CHANNELS, type ChannelKey } from '@/lib/content-sources-schema';
import { packResponseSchema, type PackResponse } from '@/lib/content-repackage-schema';
import type { ContentAtomRow } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Content OS — repurpose engine.
// ---------------------------------------------------------------------------
// One OpenAI call turns a source's atoms into all 10 channel-native bodies,
// validated against packResponseSchema. OPENAI_STUB=1 returns deterministic
// bodies derived from the atoms. Persistence + credit handling live in the
// repackage job processor (content-pipeline.ts).
// ---------------------------------------------------------------------------

export interface RepackageBrand {
  tone?: string;
  vibe?: string;
  palette?: string;
  cta?: string;
}

export interface RepackageInput {
  sourceTitle: string;
  atoms: Pick<ContentAtomRow, 'kind' | 'text'>[];
  brand?: RepackageBrand;
}

export interface PackItemDraft {
  channel: ChannelKey;
  format: string;
  body: unknown;
}

/** Map a validated PackResponse into per-channel pack item drafts. */
export function packResponseToItems(response: PackResponse): PackItemDraft[] {
  return CHANNELS.map((channel) => ({
    channel: channel.key,
    format: channel.format,
    body: response[channel.key],
  }));
}

const REPACKAGE_SYSTEM_PROMPT = `You are a multi-channel content repurposing engine. Given a source's extracted atoms, you produce native-quality content for 10 distinct channels at once.

You always respond with ONE valid JSON object matching the requested schema exactly. No prose, no markdown fences, no extra keys.

Rules:
- Stay faithful to the atoms — never invent facts, stats, or quotes the atoms don't support.
- Each channel must read NATIVELY for that platform (length, structure, voice). Do not paste the same text into every channel.
- Match the brand voice provided.
- Keep every required field non-empty.`;

function describeBrand(brand?: RepackageBrand): string {
  if (!brand) return 'Brand voice: confident, clear, helpful.';
  return [
    brand.tone ? `Tone: ${brand.tone}.` : '',
    brand.vibe ? `Vibe: ${brand.vibe}.` : '',
    brand.palette ? `Palette: ${brand.palette}.` : '',
    brand.cta && brand.cta !== 'no_cta' ? `Preferred CTA: ${brand.cta.replace(/_/g, ' ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function buildUserPrompt(input: RepackageInput): string {
  const atomLines = input.atoms
    .slice(0, 40)
    .map((a) => `- [${a.kind}] ${a.text}`)
    .join('\n');

  return `Source: "${input.sourceTitle}".
${describeBrand(input.brand)}

Atoms extracted from the source:
${atomLines}

Produce JSON with EXACTLY these keys and shapes:
{
  "linkedin": { "body": "string", "hashtags": ["..."] },
  "x_thread": { "tweets": ["...", "..."] },
  "instagram_carousel": { "caption": "string", "slides": [{ "title": "string", "body": "string" }], "hashtags": ["..."] },
  "tiktok_reels": { "hook": "string", "beats": ["..."], "cta": "string" },
  "youtube_short": { "hook": "string", "beats": ["..."], "cta": "string" },
  "newsletter": { "subject": "string", "preview": "string", "body": "string" },
  "blog_aeo": { "title": "string", "metaDescription": "string", "outline": ["..."], "body": "string" },
  "email_sequence": { "emails": [{ "subject": "string", "body": "string" }] },
  "captions": { "variants": ["...", "..."] },
  "sales_snippets": { "snippets": ["..."] }
}`;
}

export async function generateContentPack(input: RepackageInput): Promise<PackResponse> {
  if (serverEnv.OPENAI_STUB) {
    return stubPack(input);
  }
  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing — set OPENAI_STUB=1 for a deterministic pack.');
  }

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
        { role: 'system', content: REPACKAGE_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned no pack content.');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON pack: ${raw.slice(0, 200)}`);
  }
  const parsed = packResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(`Pack response failed validation: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Stub pack — deterministic, derived from the atoms.
// ---------------------------------------------------------------------------

function stubPack(input: RepackageInput): PackResponse {
  const texts = input.atoms.map((a) => a.text).filter(Boolean);
  const hook = texts[0] ?? input.sourceTitle;
  const claim = texts[1] ?? hook;
  const proof = texts[2] ?? claim;
  const cta = 'Learn more in the link.';
  const hashtags = ['contentos', 'repurpose', 'creator'];
  const top = texts.slice(0, 5);

  return {
    linkedin: {
      body: `${hook}\n\n${claim}\n\n${proof}\n\nWhat would you add?`,
      hashtags,
    },
    x_thread: {
      tweets: [
        `${hook} 🧵`,
        ...top.slice(1, 5).map((t, i) => `${i + 2}/ ${t}`),
        `That's the thread. ${cta}`,
      ],
    },
    instagram_carousel: {
      caption: `${hook}\n\n${cta}`,
      slides: top.map((t, i) => ({ title: `Slide ${i + 1}`, body: t })),
      hashtags,
    },
    tiktok_reels: {
      hook,
      beats: top.slice(0, 4),
      cta,
    },
    youtube_short: {
      hook,
      beats: top.slice(0, 4),
      cta,
    },
    newsletter: {
      subject: input.sourceTitle,
      preview: hook.slice(0, 100),
      body: `${hook}\n\n${claim}\n\n${proof}\n\n${cta}`,
    },
    blog_aeo: {
      title: input.sourceTitle,
      metaDescription: hook.slice(0, 155),
      outline: top.map((t) => t.slice(0, 60)),
      body: top.join('\n\n'),
    },
    email_sequence: {
      emails: top.slice(0, 3).map((t, i) => ({
        subject: `Part ${i + 1}: ${t.slice(0, 50)}`,
        body: `${t}\n\n${cta}`,
      })),
    },
    captions: {
      variants: top.slice(0, 3).map((t) => `${t} ${cta}`),
    },
    sales_snippets: {
      snippets: top.slice(0, 3),
    },
  };
}
