import LumaAI from 'lumaai';
import { serverEnv } from '@/lib/env';

let cached: LumaAI | null = null;

/**
 * Server-only Luma client. Don't import from client components.
 * Throws on first call if LUMA_API_KEY is missing — fail fast.
 */
export function getLumaClient(): LumaAI {
  if (!serverEnv.LUMA_API_KEY) {
    throw new Error('LUMA_API_KEY missing. Add it to .env.local before calling Luma.');
  }
  if (!cached) {
    cached = new LumaAI({ authToken: serverEnv.LUMA_API_KEY });
  }
  return cached;
}
