-- =============================================================================
-- 0006_credits_and_plan.sql
-- =============================================================================
-- Adds the credits + plan ledger to workspaces. Credit consumption logic
-- (deducted on generate-influencer / generate-post / generate-captions)
-- lives in src/lib/credits.ts; this migration only sets up the schema.
--
-- Defaults:
--   - new workspaces start on the `free` plan with 360 credits (matches
--     the reference walkthrough)
--   - credit_transactions logs every grant/deduct/topup so we can rebuild
--     balance if it ever drifts
-- =============================================================================

alter table public.workspaces
  add column if not exists credits        integer not null default 360,
  add column if not exists plan           text    not null default 'free'
                                          check (plan in ('free', 'pro', 'studio', 'agency')),
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists plan_renews_at         timestamptz;

-- Per-workspace audit trail. Lets us reconstruct balance from a known
-- starting point if there's ever a billing dispute.
create table if not exists public.credit_transactions (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  -- positive for grants / top-ups, negative for deductions
  delta           integer     not null,
  reason          text        not null
                              check (reason in (
                                'initial_grant',
                                'monthly_grant',
                                'topup',
                                'plan_upgrade',
                                'influencer_render',
                                'post_variant_render',
                                'caption_generation',
                                'refund',
                                'admin_adjustment'
                              )),
  -- optional foreign-key-ish references for tracing back to the artifact
  -- that consumed the credits. Plain text so we can reference any table.
  ref_kind        text,
  ref_id          text,
  -- balance AFTER this transaction. Lets us spot drift visually.
  balance_after   integer     not null,
  created_at      timestamptz not null default now()
);

create index if not exists credit_transactions_workspace_id_idx
  on public.credit_transactions(workspace_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS — owner-scoped reads, writes happen via server actions only
-- -----------------------------------------------------------------------------
alter table public.credit_transactions enable row level security;

drop policy if exists "owners can read credit transactions" on public.credit_transactions;
create policy "owners can read credit transactions"
  on public.credit_transactions for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- Inserts are gated to owners too — server actions use the user's JWT, so
-- this prevents a compromised client from minting credits even with the
-- anon key.
drop policy if exists "owners can insert credit transactions" on public.credit_transactions;
create policy "owners can insert credit transactions"
  on public.credit_transactions for insert
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Atomic decrement RPC — single round-trip, race-safe.
-- Returns the new balance, or -1 if the workspace doesn't have enough credits.
-- -----------------------------------------------------------------------------
create or replace function public.consume_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_reason text,
  p_ref_kind text default null,
  p_ref_id text default null
) returns integer
language plpgsql
security definer
as $$
declare
  v_new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- Atomic check-and-decrement. Returns NULL if the workspace doesn't have
  -- enough credits (the WHERE clause fails and 0 rows update).
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

-- Mirror function for grants / top-ups (positive deltas).
create or replace function public.grant_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_reason text
) returns integer
language plpgsql
security definer
as $$
declare
  v_new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  update public.workspaces
    set credits = credits + p_amount,
        updated_at = now()
    where id = p_workspace_id
    returning credits into v_new_balance;

  if v_new_balance is null then
    raise exception 'workspace % not found', p_workspace_id;
  end if;

  insert into public.credit_transactions (
    workspace_id, delta, reason, balance_after
  ) values (
    p_workspace_id, p_amount, p_reason, v_new_balance
  );

  return v_new_balance;
end;
$$;

grant execute on function public.consume_credits to authenticated;
grant execute on function public.grant_credits   to authenticated;
