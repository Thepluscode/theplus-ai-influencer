import { z } from 'zod';

// ---------------------------------------------------------------------------
// Content OS — shared schemas + constant tables.
// ---------------------------------------------------------------------------
// This module is import-safe from BOTH client and server (no 'server-only',
// no secret access). The upload composer and the repackage engine both pull
// the channel/atom/mime tables from here so there's a single source of truth.
// ---------------------------------------------------------------------------

/** Default 25 MB cap (mirrors serverEnv.CONTENT_SOURCE_MAX_BYTES). The server
 *  re-validates against env; the client uses this to fail fast before upload. */
export const CONTENT_SOURCE_MAX_BYTES = 26_214_400;

export const SOURCE_TYPES = ['paste', 'txt', 'md', 'pdf', 'audio', 'video'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** MIME → source type for uploaded files. Mirrors the content-sources bucket
 *  allowed_mime_types in migration 0017. */
export const UPLOAD_MIME_TO_TYPE: Readonly<Record<string, SourceType>> = {
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/pdf': 'pdf',
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/x-m4a': 'audio',
  'audio/m4a': 'audio',
  'audio/wav': 'audio',
  'audio/x-wav': 'audio',
  'audio/webm': 'audio',
  'video/mp4': 'video',
  'video/mpeg': 'video',
  'video/webm': 'video',
};

/** File-input `accept` string for the upload composer. */
export const UPLOAD_ACCEPT = '.txt,.md,.pdf,.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm';

export const ATOM_KINDS = [
  'hook',
  'claim',
  'story',
  'quote',
  'framework',
  'objection',
  'proof_point',
  'cta',
  'audience_insight',
] as const;
export type AtomKind = (typeof ATOM_KINDS)[number];

/** The 10 channel-native outputs the repurpose engine generates per pack. */
export const CHANNELS = [
  { key: 'linkedin', format: 'post', label: 'LinkedIn post' },
  { key: 'x_thread', format: 'thread', label: 'X thread' },
  { key: 'instagram_carousel', format: 'carousel', label: 'Instagram carousel' },
  { key: 'tiktok_reels', format: 'video_script', label: 'TikTok / Reels script' },
  { key: 'youtube_short', format: 'video_script', label: 'YouTube Short script' },
  { key: 'newsletter', format: 'newsletter', label: 'Newsletter' },
  { key: 'blog_aeo', format: 'article', label: 'Blog / AEO article' },
  { key: 'email_sequence', format: 'email_sequence', label: 'Email sequence' },
  { key: 'captions', format: 'captions', label: 'Captions' },
  { key: 'sales_snippets', format: 'snippets', label: 'Sales snippets' },
] as const;

export type ChannelKey = (typeof CHANNELS)[number]['key'];
export const CHANNEL_KEYS = CHANNELS.map((c) => c.key) as [ChannelKey, ...ChannelKey[]];

/** Channels that warrant generated visuals (carousel slides / short-form scenes). */
export const VISUAL_CHANNELS: readonly ChannelKey[] = [
  'instagram_carousel',
  'tiktok_reels',
  'youtube_short',
];

// ---------------------------------------------------------------------------
// Source ingest input — paste OR an already-uploaded storage object.
// ---------------------------------------------------------------------------
export const createContentSourceSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    mode: z.enum(['paste', 'upload']),
    // paste mode
    text: z.string().optional(),
    // upload mode (file already in the content-sources bucket)
    storagePath: z.string().trim().min(1).optional(),
    mimeType: z.string().trim().min(1).optional(),
    byteSize: z.coerce.number().int().positive().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'paste') {
      const text = (val.text ?? '').trim();
      if (text.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['text'], message: 'Paste some text to extract from.' });
      }
      if (text.length > 500_000) {
        ctx.addIssue({ code: 'custom', path: ['text'], message: 'Source is too long (500k char max).' });
      }
      return;
    }
    // upload mode
    if (!val.storagePath) {
      ctx.addIssue({ code: 'custom', path: ['storagePath'], message: 'Missing uploaded file path.' });
    }
    if (!val.mimeType || !(val.mimeType in UPLOAD_MIME_TO_TYPE)) {
      ctx.addIssue({ code: 'custom', path: ['mimeType'], message: 'Unsupported file type.' });
    }
    if (val.byteSize != null && val.byteSize > CONTENT_SOURCE_MAX_BYTES) {
      ctx.addIssue({ code: 'custom', path: ['byteSize'], message: 'File exceeds the 25 MB limit.' });
    }
  });

export type CreateContentSourceInput = z.infer<typeof createContentSourceSchema>;

/** Resolve the markdown/text vs pdf vs audio/video bucket from a MIME type. */
export function sourceTypeFromMime(mime: string): SourceType | null {
  return UPLOAD_MIME_TO_TYPE[mime] ?? null;
}
