-- =============================================================================
-- 0023 — Credit RPCs must check who is asking, not just that someone is.
--
-- PROBLEM (remaining after 0022)
-- 0022 stopped anonymous callers, but `authenticated` still has EXECUTE and
-- neither function looks at WHO is calling. Both are SECURITY DEFINER, so RLS
-- on public.workspaces does not apply inside them. Any signed-in user can
-- therefore call:
--
--   POST /rest/v1/rpc/grant_credits
--   Authorization: Bearer <their own valid session JWT>
--   {"p_workspace_id": "<somebody else's workspace>", "p_amount": 1000000, ...}
--
-- and credit a workspace they do not own — or drain one via consume_credits.
-- Signing up is free, so the barrier is one email address.
--
-- FIX
-- A shared guard that mirrors the predicate every RLS policy on this schema
-- already uses (workspaces.owner_user_id = auth.uid()). One helper rather than
-- two inline copies: this is a security check, and two copies are two things
-- that can drift apart.
--
-- SERVICE ROLE
-- The Stripe webhook (api/stripe/webhook/route.ts) and the cron workers use
-- SUPABASE_SERVICE_ROLE_KEY and legitimately act on workspaces nobody is
-- signed in to. They are exempted by auth.role() = 'service_role'.
--
-- FAIL CLOSED
-- Any other context — anon, a direct postgres/psql connection, a role we have
-- not thought of — has auth.role() null or unrecognised and is DENIED. That
-- includes admin SQL run through the Supabase MCP: to call these functions
-- by hand you must set request.jwt.claims first. Denying by default is the
-- point; the alternative is a new caller silently inheriting full access.
--
-- Raised as 42501 (insufficient_privilege) so PostgREST maps it to HTTP 403
-- and it is distinguishable in logs from the P0001 validation errors.
-- =============================================================================

create or replace function public.assert_workspace_owner(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Trusted server-side callers act without a session.
  if auth.role() = 'service_role' then
    return;
  end if;

  -- Everyone else must own the workspace. auth.uid() is null for anon, so the
  -- EXISTS fails and the caller is denied without a special case.
  if not exists (
    select 1
      from public.workspaces
     where id = p_workspace_id
       and owner_user_id = auth.uid()
  ) then
    raise exception 'not authorized for workspace %', p_workspace_id
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.assert_workspace_owner(uuid) from public, anon;
grant  execute on function public.assert_workspace_owner(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Re-declare both RPCs with the guard as the first thing they do — before the
-- amount validation, so an unauthorised caller cannot use the difference
-- between 'amount must be positive' and 'not authorized' to probe which
-- workspace ids exist.
-- -----------------------------------------------------------------------------

create or replace function public.grant_credits(
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

  -- Credit + ledger row are one unit of work (see 0021): a unique_violation
  -- rolls the UPDATE back with it, so a duplicate reversal cannot leave a
  -- workspace credited without a matching entry.
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
    select credits into v_new_balance
      from public.workspaces
      where id = p_workspace_id;
    return v_new_balance;
  end;

  return v_new_balance;
end;
$$;

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

  -- Atomic check-and-decrement (unchanged from 0006). Returns -1 when the
  -- workspace cannot cover the cost; the caller surfaces that as a paywall.
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

-- CREATE OR REPLACE preserves existing grants, but re-assert them so this
-- migration does not depend on what 0006/0021/0022 left behind.
revoke execute on function public.grant_credits(uuid, integer, text, text, text)
  from public, anon;
revoke execute on function public.consume_credits(uuid, integer, text, text, text)
  from public, anon;
grant execute on function public.grant_credits(uuid, integer, text, text, text)
  to authenticated, service_role;
grant execute on function public.consume_credits(uuid, integer, text, text, text)
  to authenticated, service_role;
