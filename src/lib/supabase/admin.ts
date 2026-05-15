import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';
import type { Database } from './types';

/**
 * Service-role Supabase client. Bypasses RLS — only use from server
 * code paths that have already authenticated the caller (route handlers
 * gated by CRON_SECRET, Stripe webhooks with signature verification,
 * background workers). Never expose to user input.
 *
 * Mirrors the pattern in src/app/api/stripe/webhook/route.ts; centralized
 * here so every server-only consumer pulls from one place instead of
 * inlining `createClient` with the key.
 */
let cached: SupabaseClient<Database> | null = null;

export function getSupabaseAdminClient(): SupabaseClient<Database> {
  if (cached) return cached;
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase admin client unavailable — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  cached = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return cached;
}
