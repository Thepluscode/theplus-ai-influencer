-- =============================================================================
-- 0021 — Make credit reversals idempotent.
--
-- PROBLEM
-- grant_credits (0006:125) takes only (workspace_id, amount, reason). Its
-- INSERT into credit_transactions omits ref_kind and ref_id, so every refund
-- row lands with a null ref. refundCredits() in src/lib/credits.ts accepts a
-- refKind/refId and its doc comment claims the unique ref makes duplicate
-- refunds catchable in the audit log — it never sent them. A workspace
-- refunded twice for the same failed render is indistinguishable in the
-- ledger from one refunded twice for two different failures, and nothing
-- prevents the second credit from being issued at all.
--
-- FIX
-- 1. Carry the audit ref through grant_credits, matching consume_credits.
-- 2. A partial unique index makes a second refund for the same ref impossible
--    rather than merely detectable after the fact.
-- 3. The function absorbs that collision and returns the unchanged balance, so
--    a retried refund is a no-op instead of an error the caller must handle.
--
-- SAFETY
-- The signature changes, so the old 3-arg function must be DROPped first —
-- CREATE OR REPLACE cannot change a parameter list, and leaving both in place
-- makes a 3-arg call ambiguous. Both existing callers (credits.ts:147 and
-- api/stripe/webhook/route.ts:192) pass the three original arguments by name
-- and bind to the new function via the defaults, so they keep working
-- unchanged. The index is scoped to reason = 'refund', so the Stripe topup
-- grant is untouched.
--
-- Backfill is deliberately not attempted: existing refund rows have a null ref
-- and there is no way to reconstruct which operation each belonged to. They
-- are excluded from the index by the NOT NULL predicate.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Duplicate reversals become impossible, not just visible.
--    Nulls are excluded explicitly: pre-0021 refund rows all have a null ref
--    and must not collide with each other or block this index from building.
-- -----------------------------------------------------------------------------
create unique index if not exists credit_transactions_refund_ref_uniq
  on public.credit_transactions (workspace_id, ref_kind, ref_id)
  where reason = 'refund' and ref_kind is not null and ref_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Carry the audit ref, and make a duplicate refund a no-op.
-- -----------------------------------------------------------------------------
drop function if exists public.grant_credits(uuid, integer, text);

create or replace function public.grant_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_reason text,
  p_ref_kind text default null,
  p_ref_id text default null
) returns integer
language plpgsql
security definer
-- SECURITY DEFINER without a pinned search_path lets a caller-controlled path
-- resolve `public.` lookups elsewhere. Every reference below is already
-- schema-qualified, so pinning it costs nothing.
set search_path = public, pg_temp
as $$
declare
  v_new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- The credit and its ledger entry are one unit of work. The nested block is
  -- a subtransaction: if the INSERT trips the uniqueness constraint, the
  -- UPDATE above it rolls back too, so a duplicate reversal cannot leave the
  -- workspace credited without a matching ledger row.
  begin
    update public.workspaces
      set credits = credits + p_amount,
          updated_at = now()
      where id = p_workspace_id
      returning credits into v_new_balance;

    if v_new_balance is null then
      raise exception 'workspace % not found', p_workspace_id;
    end if;

    insert into public.credit_transactions (
      workspace_id, delta, reason, ref_kind, ref_id, balance_after
    ) values (
      p_workspace_id, p_amount, p_reason, p_ref_kind, p_ref_id, v_new_balance
    );
  exception when unique_violation then
    -- This exact reversal was already posted. The first one credited the
    -- workspace; this attempt has just been rolled back. Report the balance
    -- as it actually stands so a retry is indistinguishable from a success.
    select credits into v_new_balance
      from public.workspaces
      where id = p_workspace_id;
    return v_new_balance;
  end;

  return v_new_balance;
end;
$$;

-- 0006 granted EXECUTE to authenticated on purpose (server actions call this
-- with the user's session client) and 0018 explicitly left it that way. The
-- DROP above took the grant with it, so restore it.
grant execute on function public.grant_credits(uuid, integer, text, text, text)
  to authenticated;
