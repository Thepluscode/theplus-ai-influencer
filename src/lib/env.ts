import { z } from 'zod';

const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);

const ServerEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  THEPLUS_DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v === '1' || v?.toLowerCase() === 'true'),
  LUMA_API_KEY: z.string().min(1).optional(),
  // Set to "1" or "true" to skip real Luma calls and return placeholder
  // images. Useful for end-to-end UI/Supabase/Zernio testing without
  // burning credits.
  LUMA_STUB: z
    .string()
    .optional()
    .transform((v) => v === '1' || v?.toLowerCase() === 'true'),
  ZERNIO_API_KEY: z
    .string()
    .min(1)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  ZERNIO_API_BASE_URL: z.string().url().default('https://zernio.com/api/v1'),
  // HMAC-SHA256 secret Zernio signs inbound webhooks with (X-Zernio-Signature).
  // Required for the /api/webhooks/zernio receiver to accept comment/DM events.
  ZERNIO_WEBHOOK_SECRET: z
    .string()
    .min(1)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Stripe Price IDs — one per paid plan + the credit topup SKU.
  // Create these in Stripe dashboard and paste the price_xxx ids here.
  STRIPE_PRICE_PRO: z.string().min(1).optional(),
  STRIPE_PRICE_STUDIO: z.string().min(1).optional(),
  STRIPE_PRICE_AGENCY: z.string().min(1).optional(),
  STRIPE_PRICE_TOPUP: z.string().min(1).optional(),
  // Caption Writer / Cross-Platform Reformatter — uses OpenAI Chat
  // Completions. OPENAI_STUB=1 returns canned outputs so dev can iterate on
  // the UI without burning credits.
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_CAPTION_MODEL: z.string().default('gpt-4o-mini'),
  // Speech-to-text model for Content OS audio/video source transcription
  // (OpenAI /v1/audio/transcriptions). OPENAI_STUB=1 returns a canned
  // transcript so dev can exercise the pipeline without paid calls.
  OPENAI_TRANSCRIBE_MODEL: z.string().default('gpt-4o-transcribe'),
  OPENAI_STUB: z
    .string()
    .optional()
    .transform((v) => v === '1' || v?.toLowerCase() === 'true'),
  // Hard ceiling on a Content OS source file (paste/upload). Matches the
  // OpenAI speech-to-text 25 MB limit by default. Enforced before upload
  // and re-checked server-side at extraction time.
  CONTENT_SOURCE_MAX_BYTES: z.coerce.number().int().positive().default(26214400),
  FFMPEG_PATH: z.string().min(1).optional(),
  FFPROBE_PATH: z.string().min(1).optional(),
  STORYBOARD_EXPORT_MAX_CLIP_BYTES: z.coerce.number().int().positive().default(209715200),
  // Comma-separated exact HTTPS hostnames controlled by the operator. The
  // built-in Luma hosts remain allowed; this is for trusted media mirrors.
  STORYBOARD_EXPORT_ALLOWED_CLIP_HOSTS: z.string().min(1).optional(),
  // Dedicated secret for cron-driven workers. Never reuse the Supabase
  // service-role key as an HTTP bearer credential.
  CRON_SECRET: z.string().min(16).optional(),
});

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3002'),
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional(),
  ),
});

export const serverEnv = ServerEnvSchema.parse(process.env);
export const publicEnv = PublicEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
});
