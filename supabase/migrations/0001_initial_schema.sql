-- =============================================================================
-- 0001_initial_schema.sql
-- =============================================================================
-- Bootstraps the workspaces + ai_models tables, RLS policies, and an
-- auth.users trigger that gives every new account a default workspace.
-- Apply once in Supabase SQL editor (or via `supabase db push`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- workspaces
-- -----------------------------------------------------------------------------
create table if not exists public.workspaces (
  id              uuid        primary key default gen_random_uuid(),
  owner_user_id   uuid        not null references auth.users(id) on delete cascade,
  name            text        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists workspaces_owner_user_id_idx
  on public.workspaces(owner_user_id);

-- -----------------------------------------------------------------------------
-- ai_models
-- -----------------------------------------------------------------------------
create table if not exists public.ai_models (
  id                          uuid        primary key default gen_random_uuid(),
  workspace_id                uuid        not null references public.workspaces(id) on delete cascade,
  name                        text        not null,
  -- Full wizard input as supplied to Luma; lets us "regenerate" later
  -- without losing the original brief.
  wizard_input                jsonb       not null,
  portrait_url                text        not null,
  full_body_url               text        not null,
  portrait_generation_id      text,
  full_body_generation_id     text,
  created_at                  timestamptz not null default now()
);

create index if not exists ai_models_workspace_id_idx
  on public.ai_models(workspace_id);

create index if not exists ai_models_created_at_idx
  on public.ai_models(created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.ai_models  enable row level security;

-- workspaces: only the owner reads / writes their rows
drop policy if exists "owners can read own workspaces"   on public.workspaces;
drop policy if exists "owners can insert own workspaces" on public.workspaces;
drop policy if exists "owners can update own workspaces" on public.workspaces;
drop policy if exists "owners can delete own workspaces" on public.workspaces;

create policy "owners can read own workspaces"
  on public.workspaces for select
  using (auth.uid() = owner_user_id);

create policy "owners can insert own workspaces"
  on public.workspaces for insert
  with check (auth.uid() = owner_user_id);

create policy "owners can update own workspaces"
  on public.workspaces for update
  using (auth.uid() = owner_user_id);

create policy "owners can delete own workspaces"
  on public.workspaces for delete
  using (auth.uid() = owner_user_id);

-- ai_models: access derived from workspace ownership
drop policy if exists "members can read workspace models"   on public.ai_models;
drop policy if exists "members can insert workspace models" on public.ai_models;
drop policy if exists "members can update workspace models" on public.ai_models;
drop policy if exists "members can delete workspace models" on public.ai_models;

create policy "members can read workspace models"
  on public.ai_models for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can insert workspace models"
  on public.ai_models for insert
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can update workspace models"
  on public.ai_models for update
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can delete workspace models"
  on public.ai_models for delete
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Auto-create a default workspace on signup
-- -----------------------------------------------------------------------------
create or replace function public.bootstrap_workspace_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_name text;
begin
  ws_name := coalesce(
    new.raw_user_meta_data->>'workspace_name',
    split_part(coalesce(new.email, 'My'), '@', 1) || '''s workspace'
  );

  insert into public.workspaces (owner_user_id, name)
  values (new.id, ws_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.bootstrap_workspace_for_user();
