-- =============================================================================
-- 0016_zernio_inbox.sql
-- =============================================================================
-- Closes the engagement gap: comments + DMs now arrive automatically from
-- Zernio webhooks (comment.received / message.received) instead of being
-- pasted in by hand, and approved replies post back to the platform.
--
-- This migration adds the provenance ids each inbound item needs so a reply
-- can be routed back to the right post / conversation / account, plus a
-- social_accounts map so an inbound DM (which only carries an account id) can
-- be attributed to the owning workspace.
--
-- Idempotency: webhook deliveries can repeat, so external_id (the platform's
-- comment/message id) gets a unique index per platform and the ingest path
-- inserts with ON CONFLICT DO NOTHING.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- comments — reply-back provenance
-- -----------------------------------------------------------------------------
alter table public.comments
  add column if not exists zernio_post_id    text,  -- {postId} path param for replies
  add column if not exists zernio_account_id text;  -- accountId body field for replies

-- external_id holds the platform comment id; unique per platform so repeated
-- webhook deliveries don't create duplicate rows. A FULL (non-partial) unique
-- index is used deliberately so it can serve as an ON CONFLICT arbiter for the
-- ingest upsert — PostgREST emits ON CONFLICT (cols) without a predicate, which
-- can't target a partial index. Manually-pasted rows have external_id = NULL,
-- and Postgres treats NULLs as distinct, so they never collide here.
create unique index if not exists comments_platform_external_id_key
  on public.comments(platform, external_id);

-- -----------------------------------------------------------------------------
-- dm_threads — reply-back provenance
-- -----------------------------------------------------------------------------
alter table public.dm_threads
  add column if not exists zernio_conversation_id text,  -- send-message path param
  add column if not exists zernio_account_id      text;  -- accountId body field

-- Full unique index (see comments_platform_external_id_key note above) so the
-- ingest upsert's ON CONFLICT (platform, external_id) can target it. NULL
-- external_id (manually-pasted DMs) stays collision-free.
create unique index if not exists dm_threads_platform_external_id_key
  on public.dm_threads(platform, external_id);

-- -----------------------------------------------------------------------------
-- social_accounts — maps a connected Zernio account to a workspace
-- -----------------------------------------------------------------------------
-- Needed because a message.received webhook only carries account.id (no post),
-- so DM ingest resolves the owning workspace through this table. Synced from
-- zernio.listAccounts() when the /accounts page loads.
create table if not exists public.social_accounts (
  id                uuid        primary key default gen_random_uuid(),
  workspace_id      uuid        not null references public.workspaces(id) on delete cascade,
  zernio_account_id text        not null,
  platform          text        not null,
  username          text,
  display_name      text,
  connected_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- one Zernio account maps to exactly one workspace (last sync wins)
  unique (zernio_account_id)
);

create index if not exists social_accounts_workspace_id_idx
  on public.social_accounts(workspace_id);

drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
  before update on public.social_accounts
  for each row execute function public.set_updated_at();

alter table public.social_accounts enable row level security;

drop policy if exists "members can read workspace social accounts"   on public.social_accounts;
drop policy if exists "members can insert workspace social accounts" on public.social_accounts;
drop policy if exists "members can update workspace social accounts" on public.social_accounts;
drop policy if exists "members can delete workspace social accounts" on public.social_accounts;

create policy "members can read workspace social accounts"
  on public.social_accounts for select
  using (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  );
create policy "members can insert workspace social accounts"
  on public.social_accounts for insert
  with check (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  );
create policy "members can update workspace social accounts"
  on public.social_accounts for update
  using (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  );
create policy "members can delete workspace social accounts"
  on public.social_accounts for delete
  using (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  );
