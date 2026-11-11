-- =============================================================================
-- 0034_consume_credits_spend_reasons.sql — a debit can only be labelled a spend
-- =============================================================================
-- Found by the independent Codex review of main (2026-11-11). consume_credits is
-- callable by any signed-in owner over PostgREST (it must be: the app debits
-- through the user's session) and it wrote the caller's p_reason verbatim. An
-- owner could therefore insert a debit labelled 'refund' with a ref of their
-- choosing:
--
--   POST /rest/v1/rpc/consume_credits
--   {"p_workspace_id":"<own>","p_amount":1,"p_reason":"refund",
--    "p_ref_kind":"creation","p_ref_id":"<a ref the app will later refund>"}
--
-- That row occupies credit_transactions_refund_ref_uniq (0021), which is
-- partial on reason = 'refund', so the app's genuine refund for that ref later
-- hits unique_violation and is skipped. It also let a debit masquerade as
-- 'topup', 'plan_upgrade' or 'admin_adjustment' in the ledger.
--
-- Fix: consume_credits accepts only spend reasons. Every app caller already
-- passes one (checked: src/**/consumeCredits callers). Grants are unchanged.
-- Rollback: re-run the consume_credits definition from 0023.
-- =============================================================================

create or replace function public.consume_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_reason text,
  p_ref_kind text default null,
  p_ref_id text default null
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_balance integer;
begin
  perform public.assert_workspace_owner(p_workspace_id);

  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- Grants, refunds and adjustments are written by grant_credits /
  -- apply_plan_credits under the service role, never by a debit.
  if p_reason is null or p_reason not in (
    'influencer_render',
    'post_variant_render',
    'caption_generation',
    'series_plan_generation',
    'storyboard_generation',
    'storyboard_shot_render',
    'storyboard_video_render',
    'brand_safety_check',
    'comment_reply_draft',
    'dm_triage',
    'source_extraction_text',
    'source_transcription',
    'content_repackage',
    'pack_media_render'
  ) then
    raise exception 'consume_credits: % is not a spend reason', coalesce(p_reason, 'null')
      using errcode = '22023';
  end if;

  update public.workspaces
    set credits = credits - p_amount,
        updated_at = now()
    where id = p_workspace_id
      and credits >= p_amount
    returning credits into v_new_balance;

  if v_new_balance is null then
    return -1;
  end if;

  insert into public.credit_transactions (
    workspace_id, delta, reason, ref_kind, ref_id, balance_after
  ) values (
    p_workspace_id, -p_amount, p_reason, p_ref_kind, p_ref_id, v_new_balance
  );

  return v_new_balance;
end;
$$;

revoke execute on function public.consume_credits(uuid, integer, text, text, text)
  from public, anon;
grant execute on function public.consume_credits(uuid, integer, text, text, text)
  to authenticated, service_role;
