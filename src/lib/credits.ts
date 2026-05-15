import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Credits — Phase 1 of BUILD_PLAN.md
// ---------------------------------------------------------------------------
// Single source of truth for credit pricing and consumption. Server-only:
// the cost constants must never be readable by the client (someone in
// devtools editing the price to 0 should not be a thing).
//
// Cost decisions live in COSTS below. Every action that calls Luma or
// OpenAI MUST call consumeCredits() first and refuse if the call returns
// `insufficient: true`. We use a Postgres RPC `consume_credits` for the
// atomic check-and-decrement to avoid race conditions when two tabs
// hit Generate simultaneously.
// ---------------------------------------------------------------------------

export const COSTS = {
  INFLUENCER_RENDER: 50,
  POST_VARIANT_RENDER: 25,
  CAPTION_GENERATION: 5,
  CAPTION_REFORMAT: 0,
  SERIES_PLAN_GENERATION: 10,
  STORYBOARD_GENERATION: 15,
  /** Per-shot Luma still-image render inside a storyboard. */
  STORYBOARD_SHOT_RENDER: 20,
  /** Per-shot Luma Dream Machine video render (animate-to-video). */
  STORYBOARD_VIDEO_RENDER: 60,
  BRAND_SAFETY_CHECK: 2,
  COMMENT_REPLY_DRAFT: 1,
  DM_TRIAGE: 2,
} as const;

export type CreditReason =
  | 'initial_grant'
  | 'monthly_grant'
  | 'topup'
  | 'plan_upgrade'
  | 'influencer_render'
  | 'post_variant_render'
  | 'caption_generation'
  | 'series_plan_generation'
  | 'storyboard_generation'
  | 'storyboard_shot_render'
  | 'storyboard_video_render'
  | 'brand_safety_check'
  | 'comment_reply_draft'
  | 'dm_triage'
  | 'refund'
  | 'admin_adjustment';

export type ConsumeResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; insufficient: true; balance: number; required: number };

export async function getWorkspaceCredits(workspaceId: string): Promise<number> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('workspaces')
    .select('credits')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read credits: ${error.message}`);
  }
  return data?.credits ?? 0;
}

/**
 * Atomic check-and-decrement via the `consume_credits` RPC. If the
 * workspace doesn't have enough credits, returns `insufficient` instead
 * of throwing — server actions surface that as a friendly paywall error.
 */
export async function consumeCredits(input: {
  workspaceId: string;
  amount: number;
  reason: CreditReason;
  refKind?: string;
  refId?: string;
}): Promise<ConsumeResult> {
  if (input.amount === 0) {
    // Free actions (caption reformat) don't touch the ledger.
    const balance = await getWorkspaceCredits(input.workspaceId);
    return { ok: true, balanceAfter: balance };
  }

  const supabase = await getSupabaseServerClient();
  // The Database types don't declare custom Postgres functions; cast to
  // any here rather than maintaining a hand-written Functions block. Real
  // type safety lives in the function's return shape below.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: number | null; error: { message: string } | null }>)(
    'consume_credits',
    {
      p_workspace_id: input.workspaceId,
      p_amount: input.amount,
      p_reason: input.reason,
      p_ref_kind: input.refKind ?? null,
      p_ref_id: input.refId ?? null,
    },
  );
  if (error) {
    throw new Error(`Credit consume failed: ${error.message}`);
  }
  const balanceAfter = typeof data === 'number' ? data : -1;
  if (balanceAfter < 0) {
    const current = await getWorkspaceCredits(input.workspaceId);
    return { ok: false, insufficient: true, balance: current, required: input.amount };
  }
  return { ok: true, balanceAfter };
}

/**
 * Refund credits when a post-consume step fails (Luma errors out, OpenAI
 * returns invalid JSON, etc). Idempotent enough — issuing a refund_reason
 * with a unique ref_id in the audit log lets us catch duplicates manually.
 */
export async function refundCredits(input: {
  workspaceId: string;
  amount: number;
  refKind?: string;
  refId?: string;
}): Promise<void> {
  if (input.amount === 0) return;
  const supabase = await getSupabaseServerClient();
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: number | null; error: { message: string } | null }>)(
    'grant_credits',
    {
      p_workspace_id: input.workspaceId,
      p_amount: input.amount,
      p_reason: 'refund' as CreditReason,
    },
  );
  if (error) {
    // Log loudly — refund failures shouldn't poison the caller's UX but
    // we want them visible for manual reconciliation.
    console.error(
      '[credits] refund failed',
      { workspaceId: input.workspaceId, amount: input.amount, refKind: input.refKind, refId: input.refId },
      error,
    );
  }
}

/** Format helper for UI. `1740` → `"1,740"`. */
export function formatCredits(n: number): string {
  return n.toLocaleString('en-US');
}
