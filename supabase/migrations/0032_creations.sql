-- =============================================================================
-- 0032_creations.sql — results of the Create hub (/create)
-- =============================================================================
-- One row per rendered picture or edit. A row is written by the server after
-- it has charged credits and Luma has returned an asset, so it is the record
-- of a paid result: authenticated users may read and delete their own rows but
-- may NOT insert or update them. Without that, a signed-in user could insert a
-- row pointing at any URL and then ask Edit to feed it to Luma as the source.
--
-- Credits reuse the existing 'post_variant_render' reason with
-- ref_kind = 'creation', ref_id = creations.id, so this migration leaves the
-- credit_transactions_reason_check constraint untouched.
--
-- Numbered after 0028–0031, which are applied in production from another
-- branch. Rollback: drop table public.creations (no other object depends on it).
-- =============================================================================

create table if not exists public.creations (
  id                  uuid        primary key default gen_random_uuid(),
  workspace_id        uuid        not null references public.workspaces(id) on delete cascade,
  mode                text        not null check (mode in ('picture', 'edit')),
  prompt              text        not null check (char_length(prompt) between 1 and 2000),
  -- Persona whose portrait locked the face via character_ref. NULL = no @mention.
  persona_id          uuid        references public.ai_models(id) on delete set null,
  -- For an edit: the creation it modified.
  source_creation_id  uuid        references public.creations(id) on delete set null,
  aspect_ratio        text        not null check (aspect_ratio in ('1:1', '3:4', '4:3', '9:16', '16:9')),
  asset_url           text        not null check (asset_url ~ '^https://'),
  generation_id       text,
  credits_spent       integer     not null default 0 check (credits_spent >= 0),
  created_at          timestamptz not null default now()
);

create index if not exists creations_workspace_created_idx
  on public.creations(workspace_id, created_at desc);

alter table public.creations enable row level security;

drop policy if exists "members can read workspace creations"   on public.creations;
drop policy if exists "members can delete workspace creations" on public.creations;

create policy "members can read workspace creations"
  on public.creations for select
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can delete workspace creations"
  on public.creations for delete
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

-- No insert/update policy on purpose: only the service role writes rows.
revoke insert, update on public.creations from anon, authenticated;
