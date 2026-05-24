import 'server-only';
import { checkBrandSafety, type SafetyIssue, type SafetyResult } from '@/lib/brand-safety';
import { consumeCredits, COSTS, refundCredits } from '@/lib/credits';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Publish-time brand-safety gate
// ---------------------------------------------------------------------------
// Single chokepoint every publish path funnels through before content reaches
// a platform (create-post, calendar reschedule, content-engine schedule).
// Charges + logs like the standalone /safety check, and is fail-closed: a
// "block" verdict OR a check error stops the publish. A "warn" passes through
// and returns a note the caller can surface on an otherwise-clean publish.
// ---------------------------------------------------------------------------

export type PublishSafetyGate =
  | { ok: true; note: string | null }
  | { ok: false; reason: 'insufficient_credits'; balance: number; required: number }
  | { ok: false; reason: 'blocked'; summary: string; issues: SafetyIssue[] }
  | { ok: false; reason: 'error'; error: string };

export async function runPublishBrandSafetyGate(input: {
  workspaceId: string;
  /** Post row the audit is logged against. */
  postId: string;
  caption: string | null;
  imageUrl?: string | null;
  platforms?: string[];
  personaVibe?: string;
}): Promise<PublishSafetyGate> {
  const consume = await consumeCredits({
    workspaceId: input.workspaceId,
    amount: COSTS.BRAND_SAFETY_CHECK,
    reason: 'brand_safety_check',
    refKind: 'safety',
    refId: input.postId,
  });
  if (!consume.ok) {
    return {
      ok: false,
      reason: 'insufficient_credits',
      balance: consume.balance,
      required: consume.required,
    };
  }

  let result: SafetyResult;
  try {
    result = await checkBrandSafety({
      caption: input.caption ?? '',
      imageUrl: input.imageUrl ?? null,
      platforms: input.platforms,
      personaVibe: input.personaVibe,
    });
  } catch (err) {
    // Refund — the check never produced a verdict, so the operator shouldn't pay.
    await refundCredits({
      workspaceId: input.workspaceId,
      amount: COSTS.BRAND_SAFETY_CHECK,
      refKind: 'safety',
      refId: input.postId,
    });
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : String(err) };
  }
  const { verdict, summary, issues } = result;

  // Record every publish-time audit against the post for /safety history.
  const supabase = await getSupabaseServerClient();
  await supabase.from('safety_audits').insert({
    workspace_id: input.workspaceId,
    post_id: input.postId,
    caption: input.caption ?? '',
    image_url: input.imageUrl ?? null,
    verdict,
    issues,
  });

  if (verdict === 'block') {
    return { ok: false, reason: 'blocked', summary: summary || 'Brand safety blocked this post.', issues };
  }
  return {
    ok: true,
    note:
      verdict === 'warn'
        ? summary || 'Published with brand-safety warnings — review the post on /safety.'
        : null,
  };
}

/**
 * Flatten a blocked gate into a one-line message for callers whose UI only has
 * a plain error string channel (calendar reschedule, content-engine schedule).
 */
export function describeSafetyBlock(summary: string, issues: SafetyIssue[]): string {
  if (issues.length === 0) return summary;
  const top = issues
    .slice(0, 3)
    .map((i) => `${i.severity}: ${i.message}`)
    .join(' · ');
  return `${summary} (${top})`;
}
