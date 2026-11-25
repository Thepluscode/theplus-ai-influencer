-- =============================================================================
-- 0036 — Tokens issued to OAuth clients (remote MCP) are read-only, and read
-- only what the MCP tools read.
--
-- A Supabase OAuth access token is an ordinary `authenticated` JWT for the
-- consenting user, plus a `client_id` claim. OAuth scopes do NOT limit database
-- access (Supabase OAuth server docs, "token security"), and every RLS policy
-- here checks only ownership. So a client the user approved for "read-only MCP
-- access" could call PostgREST directly with that token and delete the user's
-- posts, read webhook signing secrets, spend credits or enqueue exports.
-- Reproduced on a local Postgres 17 with every migration applied (2026-11-25).
--
-- This migration, for any request whose JWT carries `client_id`:
--   * denies INSERT / UPDATE / DELETE on every RLS table in public;
--   * denies SELECT on every public table except the four the MCP tools read
--     (ai_models, creations, posts, workspaces);
--   * denies all access to storage.objects;
--   * makes assert_workspace_owner() refuse, which every credit and export
--     SECURITY DEFINER RPC calls first (they bypass RLS, so policies alone
--     would not cover them).
-- App session tokens carry no client_id and are unaffected.
--
-- Safe to re-run (policies are dropped and recreated by name).
-- Must be applied BEFORE the Supabase OAuth server is enabled. A new table
-- needs the same policies; scripts/sql/database-boundaries.sql fails when one
-- is missing.
-- =============================================================================

create or replace function public.is_oauth_client_request()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  -- PostgREST sets request.jwt.claims; older releases set one GUC per claim.
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'client_id',
    nullif(current_setting('request.jwt.claim.client_id', true), ''),
    ''
  ) <> ''
$$;

revoke execute on function public.is_oauth_client_request() from public;
grant execute on function public.is_oauth_client_request() to anon, authenticated, service_role;

do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relrowsecurity
  loop
    execute format('drop policy if exists oauth_clients_no_insert on public.%I', t.relname);
    execute format(
      'create policy oauth_clients_no_insert on public.%I as restrictive for insert to authenticated with check (not public.is_oauth_client_request())',
      t.relname
    );
    execute format('drop policy if exists oauth_clients_no_update on public.%I', t.relname);
    execute format(
      'create policy oauth_clients_no_update on public.%I as restrictive for update to authenticated using (not public.is_oauth_client_request())',
      t.relname
    );
    execute format('drop policy if exists oauth_clients_no_delete on public.%I', t.relname);
    execute format(
      'create policy oauth_clients_no_delete on public.%I as restrictive for delete to authenticated using (not public.is_oauth_client_request())',
      t.relname
    );
    if t.relname not in ('ai_models', 'creations', 'posts', 'workspaces') then
      execute format('drop policy if exists oauth_clients_no_select on public.%I', t.relname);
      execute format(
        'create policy oauth_clients_no_select on public.%I as restrictive for select to authenticated using (not public.is_oauth_client_request())',
        t.relname
      );
    end if;
  end loop;
end;
$$;

drop policy if exists oauth_clients_no_storage on storage.objects;
create policy oauth_clients_no_storage on storage.objects
  as restrictive for all to authenticated
  using (not public.is_oauth_client_request())
  with check (not public.is_oauth_client_request());

-- Same body as 0023, plus the OAuth refusal first.
create or replace function public.assert_workspace_owner(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_oauth_client_request() then
    raise exception 'OAuth client tokens are read-only'
      using errcode = '42501';
  end if;

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
