import { z } from 'zod';

export const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'youtube', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const FORMATS = ['square', 'portrait', 'landscape'] as const;
export type PostFormat = (typeof FORMATS)[number];

export const BRAND_TONES = ['professional', 'casual', 'playful', 'luxe', 'edgy'] as const;
export type BrandTone = (typeof BRAND_TONES)[number];

export const CTAS = [
  'shop_now',
  'learn_more',
  'sign_up',
  'swipe_up',
  'dm_me',
  'no_cta',
] as const;
export type CTA = (typeof CTAS)[number];

export const PostBriefInput = z.object({
  modelId: z.string().uuid('Pick a saved AI model'),
  name: z.string().min(1, 'Campaign name required').max(120),
  platforms: z
    .array(z.enum(PLATFORMS))
    .min(1, 'Select at least one platform'),
  format: z.enum(FORMATS),
  brief: z.string().min(1, 'Tell Luma what the post is about').max(800),
  scene: z.string().max(200).default(''),
  outfit: z.string().max(200).default(''),
  props: z.string().max(200).default(''),
  brandTone: z.enum(BRAND_TONES),
  cta: z.enum(CTAS),
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
