import { z } from 'zod';
import { BRAND_TONES, CTAS } from '@/types/post';

export const WEBHOOK_EVENTS = [
  'post.scheduled',
  'post.published',
  'review.approved',
  'comment.created',
] as const;

export const TEAM_ROLES = ['viewer', 'editor', 'admin'] as const;

export const DEFAULT_BRAND_DEFAULTS = {
  brand_tone: 'casual',
  brand_vibe: 'Cinematic creator-led content',
  brand_palette: 'ThePlus blue, signal green, studio black',
  default_cta: 'no_cta',
} as const;

export const BrandDefaultsFormSchema = z.object({
  brandTone: z.enum(BRAND_TONES),
  brandVibe: z.string().trim().min(2, 'Brand vibe required').max(160),
  brandPalette: z.string().trim().min(2, 'Brand palette required').max(160),
  defaultCta: z.enum(CTAS),
});

export const TeamInviteFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(254).toLowerCase(),
  role: z.enum(TEAM_ROLES),
});

export const WebhookFormSchema = z.object({
  name: z.string().trim().min(2, 'Webhook name required').max(80),
  url: z
    .string()
    .trim()
    .url('Enter a valid HTTPS webhook URL')
    .refine((value) => {
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Webhook URL must use HTTPS'),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Select at least one event'),
});

export const RowIdSchema = z.string().uuid();

export type BrandDefaultsInput = z.infer<typeof BrandDefaultsFormSchema>;
export type TeamInviteInput = z.infer<typeof TeamInviteFormSchema>;
export type WebhookInput = z.infer<typeof WebhookFormSchema>;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
