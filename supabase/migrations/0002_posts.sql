-- =============================================================================
-- 0002_posts.sql
-- =============================================================================
-- Adds the posts table — campaign-scoped pieces of content generated from a
-- saved AI model + a creative brief, with one or more visual variants.
-- =============================================================================

create table if not exists public.posts (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  -- nullable: keep the post around even if its source model is deleted
  model_id        uuid        references public.ai_models(id) on delete set null,
  name            text        not null,
  status          text        not null default 'draft'
                              check (status in ('draft', 'scheduled', 'published')),
  platforms       text[]      not null default array[]::text[],
  format          text        not null
                              check (format in ('square', 'portrait', 'landscape')),
  -- Full creative brief (scene, outfit, props, brand tone, CTA, …) so we can
  -- regenerate variants later without losing the original direction.
  prompt_inputs   jsonb       not null,
  -- [{ url, generationId, generatedAt }] — one entry per variant.
  variants        jsonb       not null default '[]'::jsonb,
  caption         text,
  scheduled_for   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists posts_workspace_id_idx
  on public.posts(workspace_id);

create index if not exists posts_status_idx
  on public.posts(status);

create index if not exists posts_scheduled_for_idx
  on public.posts(scheduled_for) where scheduled_for is not null;

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — workspace-scoped, same pattern as ai_models
-- -----------------------------------------------------------------------------
alter table public.posts enable row level security;

drop policy if exists "members can read workspace posts"   on public.posts;
drop policy if exists "members can insert workspace posts" on public.posts;
drop policy if exists "members can update workspace posts" on public.posts;
drop policy if exists "members can delete workspace posts" on public.posts;

create policy "members can read workspace posts"
  on public.posts for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can insert workspace posts"
  on public.posts for insert
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can update workspace posts"
  on public.posts for update
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can delete workspace posts"
  on public.posts for delete
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );
