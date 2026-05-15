import { z } from 'zod';

// All platforms Zernio can publish to. Add a value here and you must
// update PLATFORM_GRADIENT in create-post-form + the stub switch in
// src/lib/captions.ts.
export const PLATFORMS = [
  'instagram',
  'tiktok',
  'twitter',
  'youtube',
  'facebook',
  'linkedin',
  'pinterest',
  'threads',
  'reddit',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const FORMATS = ['square', 'portrait', 'landscape'] as const;
export type PostFormat = (typeof FORMATS)[number];

export const BRAND_TONES = ['professional', 'casual', 'playful', 'luxe', 'edgy'] as const;
export type BrandTone = (typeof BRAND_TONES)[number];

export const CTAS = ['shop_now', 'learn_more', 'sign_up', 'swipe_up', 'dm_me', 'no_cta'] as const;
export type CTA = (typeof CTAS)[number];

// Post-level intent, fed to both Luma (scene direction) and the caption
// writer (voice / framing). Reference walkthrough §Create Post asks for
// "Post Goal" as a discrete field.
export const POST_GOALS = ['awareness', 'engagement', 'launch', 'sales', 'community'] as const;
export type PostGoal = (typeof POST_GOALS)[number];

// Lighting bias for the render. Mostly affects Luma; captions see the
// label so they can lean into the mood (e.g. golden hour → warm).
export const LIGHTING_STYLES = [
  'natural',
  'golden_hour',
  'studio',
  'neon',
  'overcast',
  'cinematic',
] as const;
export type LightingStyle = (typeof LIGHTING_STYLES)[number];

// Empty-string-tolerant optional URL field. Form submissions hand us '' for
// unset hidden inputs; zod's .url() rejects that, so we coerce to undefined.
const OptionalUrl = z
  .string()
  .transform((v) => (v.trim() === '' ? undefined : v))
  .optional()
  .refine((v) => v === undefined || /^https?:\/\//i.test(v), {
    message: 'Must be an http(s) URL',
  });

const OptionalTrimmedString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
  z.string().max(160).optional(),
);

export const PostBriefInput = z.object({
  modelId: z.string().uuid('Pick a saved AI model'),
  name: z.string().min(1, 'Campaign name required').max(120),
  platforms: z.array(z.enum(PLATFORMS)).min(1, 'Select at least one platform'),
  format: z.enum(FORMATS),
  brief: z.string().min(1, 'Tell Luma what the post is about').max(800),
  scene: z.string().max(200).default(''),
  outfit: z.string().max(200).default(''),
  props: z.string().max(200).default(''),
  brandTone: z.enum(BRAND_TONES),
  brandVibe: OptionalTrimmedString,
  brandPalette: OptionalTrimmedString,
  cta: z.enum(CTAS),
  // Operator-uploaded final image. When set, the variant pipeline skips
  // Luma entirely and uses this URL as the variant.
  uploadedImageUrl: OptionalUrl,
  // Up to 3 product / scene reference URLs. Each gets passed to Luma as a
  // separate image_ref so the persona composes them into the render.
  // The reference walkthrough mentions Luma supports up to 9 — we cap at
  // 3 for v1 to keep the UI compact and stay well within rate limits.
  productRefUrls: z
    .array(
      z
        .string()
        .transform((v) => (v.trim() === '' ? '' : v))
        .refine((v) => v === '' || /^https?:\/\//i.test(v), 'Must be an http(s) URL'),
    )
    .max(3)
    .default([])
    .transform((arr) => arr.filter((v) => v !== '')),
  postGoal: z.enum(POST_GOALS).default('engagement'),
  lighting: z.enum(LIGHTING_STYLES).default('natural'),
});

export type PostBriefInput = z.infer<typeof PostBriefInput>;

export interface PostVariant {
  url: string;
  generationId: string;
  generatedAt: string;
}

export const FORMAT_TO_ASPECT: Record<PostFormat, '1:1' | '9:16' | '16:9'> = {
  square: '1:1',
  portrait: '9:16',
  landscape: '16:9',
};
