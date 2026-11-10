'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkBrandSafety, type SafetyResult } from '@/lib/brand-safety';
import { consumeCredits, COSTS, refundCredits } from '@/lib/credits';
import { PLATFORMS } from '@/types/post';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';

export type SafetyState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'insufficient_credits'; balance: number; required: number }
  | { status: 'success'; result: SafetyResult };

const CheckSchema = z.object({
  caption: z.string().min(1, 'Paste the caption').max(4000),
  imageUrl: z.string().optional().or(z.literal('')),
  platforms: z.array(z.enum(PLATFORMS)).optional().default([]),
  personaVibe: z.string().max(40).optional().or(z.literal('')),
});

export async function runSafetyCheckAction(
  _prev: SafetyState | null,
  formData: FormData,
): Promise<SafetyState> {
  const parsed = CheckSchema.safeParse({
    caption: formData.get('caption'),
    imageUrl: formData.get('imageUrl') ?? '',
    platforms: formData.getAll('platforms'),
    personaVibe: formData.get('personaVibe') ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
    };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);

    // One id per attempt, threaded through the debit AND its refund. It is what
    // pairs them in credit_transactions, and what lets migration 0021's unique
    // index reject a second refund for the SAME attempt while still allowing a
    // genuine retry (new attempt, new id) to be refunded on its own merits.
    const attemptId = crypto.randomUUID();
    const consume = await consumeCredits({
      workspaceId: ws.id,
      amount: COSTS.BRAND_SAFETY_CHECK,
      reason: 'brand_safety_check',
      refKind: 'safety',
      refId: attemptId,
    });
    if (!consume.ok) {
      return {
        status: 'insufficient_credits',
        balance: consume.balance,
        required: consume.required,
      };
    }

    let result;
    try {
      result = await checkBrandSafety({
        caption: parsed.data.caption,
        imageUrl: parsed.data.imageUrl || null,
        platforms: parsed.data.platforms,
        personaVibe: parsed.data.personaVibe || undefined,
      });
    } catch (err) {
      await refundCredits({
        workspaceId: ws.id,
        amount: COSTS.BRAND_SAFETY_CHECK,
        refKind: 'safety',
        refId: attemptId,
      });
      throw err;
    }

    // Log the audit for the operator's history.
    await supabase.from('safety_audits').insert({
      workspace_id: ws.id,
      caption: parsed.data.caption,
      image_url: parsed.data.imageUrl || null,
      verdict: result.verdict,
      issues: result.issues,
    });
    revalidatePath('/safety');
    return { status: 'success', result };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Safety check failed.',
    };
  }
}
