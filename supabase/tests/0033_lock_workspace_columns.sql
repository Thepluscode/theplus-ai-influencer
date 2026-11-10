-- Regression check for 0033. SYNTHETIC users on a scratch database only.
-- Run after replaying 0001, 0006, 0021, 0022, 0023, 0025, 0026 and 0033 over
-- Supabase role shims: roles anon / authenticated / service_role; auth.uid()
-- and auth.role() read request.jwt.claim.sub / .role; auth.users has
-- raw_user_meta_data; and Supabase's default "grant all on tables" to those
-- roles. Raises on the first open boundary, so `psql -v ON_ERROR_STOP=1 -f`
-- exits non-zero. Judged on outcome (did the row change?), not on which error
-- was raised: a refusal by privilege or by RLS both count as closed.
--
-- Precondition: auth.users holds user A a0000000-0000-4000-8000-0000000000a1;
-- the bootstrap trigger created their workspace. Re-runnable.

do $$
declare
  a uuid := 'a0000000-0000-4000-8000-0000000000a1';
  tag text := 'synthetic-0033-' || gen_random_uuid();
  ws uuid;
  snap record;
  now_row record;
  n integer;
begin
  select id into ws from public.workspaces where owner_user_id = a order by created_at, id limit 1;
  if ws is null then raise exception 'precondition: user A has no workspace'; end if;
  select credits, plan, stripe_customer_id into snap from public.workspaces where id = ws;

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  -- 1-2. Self-crediting / plan escalation, and repointing the Stripe customer —
  -- separate statements, so a grant on one column set cannot be masked by the
  -- other being refused (found by reopening credits/plan alone).
  begin
    update public.workspaces set credits = 999999 where id = ws;
  exception when insufficient_privilege then null;
  end;
  begin
    update public.workspaces set plan = 'agency' where id = ws;
  exception when insufficient_privilege then null;
  end;
  begin
    update public.workspaces set stripe_customer_id = 'cus_someone_else' where id = ws;
  exception when insufficient_privilege then null;
  end;

  -- 3. Inserting a workspace with a chosen balance.
  begin
    insert into public.workspaces (owner_user_id, name, credits, plan) values (a, tag || '-forged', 999999, 'agency');
  exception when insufficient_privilege then null;
  end;

  -- 4. Delete-and-recreate (a fresh 360-credit workspace).
  begin
    delete from public.workspaces where id = ws;
  exception when insufficient_privilege then null;
  end;

  -- 5. Forging ledger history.
  begin
    insert into public.credit_transactions (workspace_id, delta, reason, balance_after, ref_kind, ref_id)
      values (ws, 999999, 'topup', 999999, 'forged', tag);
  exception when insufficient_privilege then null;  -- RLS refusals are 42501 too
  end;

  -- 6. TRUNCATE (bypasses RLS) on the ledger.
  select count(*) into n from public.credit_transactions;
  begin
    truncate public.credit_transactions cascade;
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.credit_transactions) < n then
    raise exception 'FAIL: authenticated could TRUNCATE the ledger';
  end if;

  -- Outcome, read back as the owner.
  select credits, plan, stripe_customer_id into now_row from public.workspaces where id = ws;
  if not found then raise exception 'FAIL: owner could DELETE their workspace'; end if;
  if now_row.credits is distinct from snap.credits or now_row.plan is distinct from snap.plan then
    raise exception 'FAIL: owner could UPDATE credits/plan (% %, was % %)', now_row.credits, now_row.plan, snap.credits, snap.plan;
  end if;
  if now_row.stripe_customer_id is distinct from snap.stripe_customer_id then
    raise exception 'FAIL: owner could UPDATE stripe_customer_id';
  end if;
  select count(*) into n from public.workspaces where name = tag || '-forged';
  if n > 0 then raise exception 'FAIL: owner could INSERT a workspace with credits'; end if;
  select count(*) into n from public.credit_transactions where ref_kind = 'forged' and ref_id = tag;
  if n > 0 then raise exception 'FAIL: owner could INSERT a ledger row'; end if;

  -- Positive twins: the legitimate paths still work.
  insert into public.workspaces (owner_user_id, name) values (a, tag || '-bootstrap');
  if (select credits from public.workspaces where name = tag || '-bootstrap') <> 360 then
    raise exception 'FAIL: bootstrap insert did not take the 360 default';
  end if;
  perform public.consume_credits(ws, 25, 'post_variant_render', 'test', tag);
  if (select credits from public.workspaces where id = ws) <> snap.credits - 25 then
    raise exception 'FAIL: consume_credits did not debit';
  end if;
  if (select count(*) from public.credit_transactions where ref_kind = 'test' and ref_id = tag) <> 1 then
    raise exception 'FAIL: consume_credits did not write its ledger row';
  end if;

  reset role;
  raise notice 'PASS: 0033 — workspace update/insert/delete and ledger insert refused; bootstrap insert, read, RPC debit + ledger row still work';
end $$;
