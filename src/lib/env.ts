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
  // Narrate each shot's hook caption into the exported MP4. Off by default:
  // it calls a paid speech API. When on and speech fails, the export job
  // fails and retries rather than shipping a silently voiceless video.
  STORYBOARD_EXPORT_VOICEOVER: z
    .string()
    .optional()
    .transform((v) => v === '1' || v?.toLowerCase() === 'true'),
  // OpenAI /v1/audio/speech. Its models are scheduled to shut down on
  // 2027-01-06 (OpenAI API reference, checked 2026-11-23).
  OPENAI_TTS_MODEL: z.string().min(1).default('gpt-4o-mini-tts'),
  OPENAI_TTS_VOICE: z.string().min(1).default('alloy'),
  // Which provider animates storyboard shots (image → video). Luma stays the
  // default; stills are always Luma. Runway needs RUNWAYML_API_SECRET; its clips
  // are copied into the `storyboard-clips` bucket (migration 0035).
  STORYBOARD_VIDEO_PROVIDER: z.enum(['luma', 'runway']).default('luma'),
  RUNWAYML_API_SECRET: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  RUNWAY_VIDEO_MODEL: z.string().min(1).default('gen4_turbo'),
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
