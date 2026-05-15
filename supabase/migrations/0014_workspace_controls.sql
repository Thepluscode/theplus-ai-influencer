-- =============================================================================
-- 0014_workspace_controls.sql
-- =============================================================================
-- Implements Settings workspace controls:
--   - brand defaults used by new campaign briefs
--   - team invite records for collaborators
--   - webhook endpoint records for event routing
-- =============================================================================

create table if not exists public.workspace_brand_defaults (
  workspace_id    uuid        primary key references public.workspaces(id) on delete cascade,
  brand_tone      text        not null default 'casual'
                              check (brand_tone in ('professional', 'casual', 'playful', 'luxe', 'edgy')),
  brand_vibe      text        not null default 'Cinematic creator-led content',
  brand_palette   text        not null default 'ThePlus blue, signal green, studio black',
  default_cta     text        not null default 'no_cta'
                              check (default_cta in ('shop_now', 'learn_more', 'sign_up', 'swipe_up', 'dm_me', 'no_cta')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.workspace_invites (
  id                  uuid        primary key default gen_random_uuid(),
  workspace_id         uuid        not null references public.workspaces(id) on delete cascade,
  email               text        not null,
  role                text        not null default 'editor'
                                      check (role in ('viewer', 'editor', 'admin')),
  status              text        not null default 'pending'
                                      check (status in ('pending', 'accepted', 'revoked')),
  invited_by_user_id  uuid        not null references auth.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists workspace_invites_workspace_id_idx
  on public.workspace_invites(workspace_id, created_at desc);

create unique index if not exists workspace_invites_pending_email_idx
  on public.workspace_invites(workspace_id, lower(email))
  where status = 'pending';

create table if not exists public.workspace_webhooks (
  id                    uuid        primary key default gen_random_uuid(),
  workspace_id           uuid        not null references public.workspaces(id) on delete cascade,
  name                  text        not null,
  url                   text        not null,
  events                text[]      not null default array['post.published']::text[]
                                        check (
                                          cardinality(events) > 0 and
                                          events <@ array[
                                            'post.scheduled',
                                            'post.published',
                                            'review.approved',
                                            'comment.created'
                                          ]::text[]
                                        ),
  active                boolean     not null default true,
  last_delivery_at      timestamptz,
  last_delivery_status  integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists workspace_webhooks_workspace_id_idx
  on public.workspace_webhooks(workspace_id, created_at desc);

drop trigger if exists workspace_brand_defaults_set_updated_at on public.workspace_brand_defaults;
create trigger workspace_brand_defaults_set_updated_at
  before update on public.workspace_brand_defaults
  for each row execute function public.set_updated_at();

drop trigger if exists workspace_invites_set_updated_at on public.workspace_invites;
create trigger workspace_invites_set_updated_at
  before update on public.workspace_invites
  for each row execute function public.set_updated_at();

drop trigger if exists workspace_webhooks_set_updated_at on public.workspace_webhooks;
create trigger workspace_webhooks_set_updated_at
  before update on public.workspace_webhooks
  for each row execute function public.set_updated_at();

alter table public.workspace_brand_defaults enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.workspace_webhooks enable row level security;

drop policy if exists "owners can read brand defaults" on public.workspace_brand_defaults;
drop policy if exists "owners can insert brand defaults" on public.workspace_brand_defaults;
drop policy if exists "owners can update brand defaults" on public.workspace_brand_defaults;
drop policy if exists "owners can delete brand defaults" on public.workspace_brand_defaults;

create policy "owners can read brand defaults"
  on public.workspace_brand_defaults for select
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy "owners can insert brand defaults"
  on public.workspace_brand_defaults for insert
  with check (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy "owners can update brand defaults"
  on public.workspace_brand_defaults for update
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy "owners can delete brand defaults"
  on public.workspace_brand_defaults for delete
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

drop policy if exists "owners can read invites" on public.workspace_invites;
drop policy if exists "owners can insert invites" on public.workspace_invites;
drop policy if exists "owners can update invites" on public.workspace_invites;
drop policy if exists "owners can delete invites" on public.workspace_invites;

create policy "owners can read invites"
  on public.workspace_invites for select
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy "owners can insert invites"
  on public.workspace_invites for insert
  with check (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy "owners can update invites"
  on public.workspace_invites for update
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy "owners can delete invites"
  on public.workspace_invites for delete
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

drop policy if exists "owners can read webhooks" on public.workspace_webhooks;
drop policy if exists "owners can insert webhooks" on public.workspace_webhooks;
drop policy if exists "owners can update webhooks" on public.workspace_webhooks;
drop policy if exists "owners can delete webhooks" on public.workspace_webhooks;

create policy "owners can read webhooks"
  on public.workspace_webhooks for select
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy "owners can insert webhooks"
  on public.workspace_webhooks for insert
  with check (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy "owners can update webhooks"
  on public.workspace_webhooks for update
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));

create policy "owners can delete webhooks"
  on public.workspace_webhooks for delete
  using (workspace_id in (select id from public.workspaces where owner_user_id = (select auth.uid())));
