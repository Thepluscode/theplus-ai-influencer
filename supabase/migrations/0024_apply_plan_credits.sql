-- =============================================================================
-- 0024 — Subscription credit changes must leave a ledger entry.
--
-- PROBLEM (found by a live test checkout, 2026-08-01)
-- The Stripe webhook writes workspaces.credits DIRECTLY on every
-- subscription-driven change (route.ts 237/256/283/328), bypassing
-- grant_credits. A real Pro checkout moved a workspace from 360 to 2500
-- credits and credit_transactions stayed EMPTY. The ledger is therefore not a
-- complete record of credit movement: it reconciles for top-ups and refunds
-- and silently does not for subscriptions. "Where did these 2,500 come from?"
-- has no answer in the data.
--
-- WHY THE OBVIOUS FIX IS WRONG
-- Switching those call sites to grant_credits would reintroduce the bug 0020
-- fixed: grant_credits is ADDITIVE, so a redelivered subscription event would
-- grant the monthly allowance twice. The absolute write ("set credits to the
-- plan's monthly grant") is what makes replays safe, and that property must
-- survive this change.
--
-- FIX
-- Keep the absolute write; record the movement it caused. This function sets
-- credits to an exact value AND writes a credit_transactions row for the
-- difference, in one statement, so the balance and its explanation cannot
-- diverge. Because the write is absolute, a replay computes a delta of zero
-- and no second row is written — replay-safety is preserved rather than traded
-- away.
--
-- SELECT ... FOR UPDATE serialises concurrent events on the same workspace;
-- without it two events interleaving could each read the same old balance and
-- write deltas that do not sum to the final figure.
--
-- p_plan is optional: invoice.paid refills credits without changing the tier,
-- so it passes null and the plan column is left alone.
--
-- service_role only. Only the webhook and cron workers have any business
-- setting a balance to an arbitrary value — this is deliberately NOT callable
-- by `authenticated`, unlike consume_credits/grant_credits.
-- =============================================================================

create or replace function public.apply_plan_credits(
  p_workspace_id uuid,
  p_credits integer,
  p_reason text,
  p_plan text default null,
  p_ref_kind text default null,
  p_ref_id text default null
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old integer;
begin
  -- Ownership is NOT the right test here. assert_workspace_owner() passes for
  -- a workspace's owner, and an owner setting their own balance to an
  -- arbitrary number is exactly what this function must not permit. Setting an
  -- absolute balance is a trusted-server operation, so require service_role
  -- outright. The REVOKE below already blocks `authenticated`, but a guard
  -- that depends only on a grant is one careless GRANT away from unlimited
  -- self-crediting.
  if auth.role() is distinct from 'service_role' then
    raise exception 'apply_plan_credits requires the service role'
      using errcode = '42501';
  end if;

  if p_credits < 0 then
    raise exception 'credits must not be negative';
  end if;

  -- Lock the row so two concurrent Stripe events cannot both read the same
  -- starting balance and write deltas that fail to sum to the final value.
  select credits into v_old
    from public.workspaces
   where id = p_workspace_id
     for update;

  if v_old is null then
    raise exception 'workspace % not found', p_workspace_id;
  end if;

  update public.workspaces
     set credits    = p_credits,
         plan       = coalesce(p_plan, plan),
         updated_at = now()
   where id = p_workspace_id;

  -- A replay of an absolute write moves nothing, so it records nothing. This
  -- is what keeps the operation idempotent while still being audited.
  if p_credits <> v_old then
    insert into public.credit_transactions (
      workspace_id, delta, reason, ref_kind, ref_id, balance_after
    ) values (
      p_workspace_id, p_credits - v_old, p_reason, p_ref_kind, p_ref_id, p_credits
    );
  end if;

  return p_credits;
end;
$$;

revoke execute on function
  public.apply_plan_credits(uuid, integer, text, text, text, text)
  from public, anon, authenticated;

grant execute on function
  public.apply_plan_credits(uuid, integer, text, text, text, text)
  to service_role;
