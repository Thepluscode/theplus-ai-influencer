import { z } from 'zod';

const ServerEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  LUMA_API_KEY: z.string().min(1).optional(),
  // Set to "1" or "true" to skip real Luma calls and return placeholder
  // images. Useful for end-to-end UI/Supabase/Zernio testing without
  // burning credits.
  LUMA_STUB: z
    .string()
    .optional()
    .transform((v) => v === '1' || v?.toLowerCase() === 'true'),
  ZERNIO_API_KEY: z.string().min(1).optional(),
  ZERNIO_API_BASE_URL: z.string().url().default('https://zernio.com/api/v1'),
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
  OPENAI_STUB: z
    .string()
    .optional()
    .transform((v) => v === '1' || v?.toLowerCase() === 'true'),
  // Shared secret used to authenticate cron-driven worker invocations of
  // /api/jobs/storyboard-animate. Required for production; if absent in
  // dev, the route still accepts SUPABASE_SERVICE_ROLE_KEY as a bearer
  // token so you can curl it locally.
  CRON_SECRET: z.string().min(16).optional(),
});

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3002'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
});

export const serverEnv = ServerEnvSchema.parse(process.env);
export const publicEnv = PublicEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
});
