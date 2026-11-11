-- Regression check for 0034. SYNTHETIC user on a scratch database only.
-- Same harness as 0033's test: replay 0001, 0006, 0021, 0022, 0023, 0025, 0026,
-- 0033 and 0034 over the Supabase role shims. Raises on the first failure, so
-- `psql -v ON_ERROR_STOP=1 -f` exits non-zero. Re-runnable.
--
-- Precondition: auth.users holds user A a0000000-0000-4000-8000-0000000000a1
-- and the bootstrap trigger created their workspace.

do $$
declare
  a uuid := 'a0000000-0000-4000-8000-0000000000a1';
  ref text := 'synthetic-0034-' || gen_random_uuid();
  ws uuid;
  bal integer;
  r text;
  n integer;
begin
  select id into ws from public.workspaces where owner_user_id = a order by created_at, id limit 1;
  if ws is null then raise exception 'precondition: user A has no workspace'; end if;
  update public.workspaces set credits = 100 where id = ws;  -- superuser setup only

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  -- 1. The attack: a debit labelled as a refund (or any grant-type reason) is refused.
  foreach r in array array['refund', 'topup', 'plan_upgrade', 'admin_adjustment', 'initial_grant', 'monthly_grant'] loop
    begin
      perform public.consume_credits(ws, 1, r, 'creation', ref);
      raise exception 'OPEN: consume_credits accepted reason %', r;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.consume_credits(ws, 1, null, 'creation', ref);
    raise exception 'OPEN: consume_credits accepted a null reason';
  exception when invalid_parameter_value then null;
  end;

  -- 2. A real spend still works and keeps its ref.
  bal := public.consume_credits(ws, 3, 'influencer_render', 'creation', ref);
  if bal <> 97 then raise exception 'spend broken: balance % (want 97)', bal; end if;

  reset role;
  select count(*) into n from public.credit_transactions
    where workspace_id = ws and ref_id = ref and reason = 'refund';
  if n <> 0 then raise exception 'OPEN: % refund-labelled rows exist for the ref', n; end if;

  -- 3. The genuine refund for that ref now lands (the slot was not poisoned), once.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  set local role service_role;
  perform public.grant_credits(ws, 3, 'refund', 'creation', ref);
  perform public.grant_credits(ws, 3, 'refund', 'creation', ref);
  reset role;
  select credits into bal from public.workspaces where id = ws;
  if bal <> 100 then raise exception 'refund wrong: balance % (want 100: refunded once)', bal; end if;

  raise notice '0034 ok: grant-type reasons refused, spend works, refund lands once';
end $$;
