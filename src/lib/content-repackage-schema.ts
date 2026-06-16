import { z } from 'zod';
import type { ChannelKey } from '@/lib/content-sources-schema';

// ---------------------------------------------------------------------------
// Content OS — repackage output schema (the 10 channel-native bodies).
// ---------------------------------------------------------------------------
// Client- and server-safe (no 'server-only'). The repackage engine validates
// the OpenAI response against packResponseSchema; the UI parses an individual
// pack item's stored `body` jsonb with the matching per-channel schema.
// ---------------------------------------------------------------------------

const tags = z.array(z.string()).default([]);

export const linkedinBodySchema = z.object({
  body: z.string().trim().min(1),
  hashtags: tags,
});

export const xThreadBodySchema = z.object({
  tweets: z.array(z.string().trim().min(1)).min(1),
});

export const carouselBodySchema = z.object({
  caption: z.string().trim().min(1),
  slides: z
    .array(z.object({ title: z.string().trim().min(1), body: z.string().trim().min(1) }))
    .min(1),
  hashtags: tags,
});

export const videoScriptBodySchema = z.object({
  hook: z.string().trim().min(1),
  beats: z.array(z.string().trim().min(1)).min(1),
  cta: z.string().trim().min(1),
});

export const newsletterBodySchema = z.object({
  subject: z.string().trim().min(1),
  preview: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

export const articleBodySchema = z.object({
  title: z.string().trim().min(1),
  metaDescription: z.string().trim().min(1),
  outline: z.array(z.string().trim().min(1)).min(1),
  body: z.string().trim().min(1),
});

export const emailSequenceBodySchema = z.object({
  emails: z
    .array(z.object({ subject: z.string().trim().min(1), body: z.string().trim().min(1) }))
    .min(1),
});

export const captionsBodySchema = z.object({
  variants: z.array(z.string().trim().min(1)).min(1),
});

export const snippetsBodySchema = z.object({
  snippets: z.array(z.string().trim().min(1)).min(1),
});

/** The full repurpose engine response — one body per channel key. */
export const packResponseSchema = z.object({
  linkedin: linkedinBodySchema,
  x_thread: xThreadBodySchema,
  instagram_carousel: carouselBodySchema,
  tiktok_reels: videoScriptBodySchema,
  youtube_short: videoScriptBodySchema,
  newsletter: newsletterBodySchema,
  blog_aeo: articleBodySchema,
  email_sequence: emailSequenceBodySchema,
  captions: captionsBodySchema,
  sales_snippets: snippetsBodySchema,
});

export type PackResponse = z.infer<typeof packResponseSchema>;

/** Per-channel body schema lookup, used by the UI to parse stored item bodies. */
export const CHANNEL_BODY_SCHEMA: Record<ChannelKey, z.ZodTypeAny> = {
  linkedin: linkedinBodySchema,
  x_thread: xThreadBodySchema,
  instagram_carousel: carouselBodySchema,
  tiktok_reels: videoScriptBodySchema,
  youtube_short: videoScriptBodySchema,
  newsletter: newsletterBodySchema,
  blog_aeo: articleBodySchema,
  email_sequence: emailSequenceBodySchema,
  captions: captionsBodySchema,
  sales_snippets: snippetsBodySchema,
};

/**
 * Flatten a single pack item body into plain text for the publish path
 * (draft caption, Zernio content). Channel-aware so each surface reads well.
 */
export function packItemToPlainText(channel: string, body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

  switch (channel) {
    case 'linkedin':
      return [str(b.body), list(b.hashtags).map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n');
    case 'x_thread':
      return list(b.tweets).join('\n\n');
    case 'instagram_carousel':
      return [
        str(b.caption),
        list(b.hashtags).map((h) => `#${h}`).join(' '),
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'tiktok_reels':
    case 'youtube_short':
      return [str(b.hook), list(b.beats).join('\n'), str(b.cta)].filter(Boolean).join('\n\n');
    case 'newsletter':
      return [str(b.subject), str(b.body)].filter(Boolean).join('\n\n');
    case 'blog_aeo':
      return [str(b.title), str(b.body)].filter(Boolean).join('\n\n');
    case 'email_sequence': {
      const emails = Array.isArray(b.emails) ? b.emails : [];
      return emails
        .map((e) => {
          const eo = (e ?? {}) as Record<string, unknown>;
          return [str(eo.subject), str(eo.body)].filter(Boolean).join('\n');
        })
        .join('\n\n---\n\n');
    }
    case 'captions':
      return list(b.variants).join('\n\n');
    case 'sales_snippets':
      return list(b.snippets).join('\n\n');
    default:
      return str(b.body) || JSON.stringify(b);
  }
}
