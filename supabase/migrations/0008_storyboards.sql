-- =============================================================================
-- 0008_storyboards.sql
-- =============================================================================
-- Stores Video Storyboarder output (v3 of STRATEGY.md). A storyboard is
-- a workspace-scoped sequence of 3–6 shots that share a single persona
-- via character_ref. The /storyboard/[id] preview cycles through the
-- rendered shots as a reel mock.
--
-- shots shape (jsonb array):
--   {
--     index:    integer,
--     prompt:   text,
--     imageUrl: text,
--     hookCaption: text,
--     durationMs: integer
--   }
-- =============================================================================

create table if not exists public.storyboards (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  model_id        uuid        references public.ai_models(id) on delete set null,
  name            text        not null,
  brief           text        not null,
  format          text        not null
                              check (format in ('square', 'portrait', 'landscape')),
  summary         text,
  shots           jsonb       not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists storyboards_workspace_id_idx
  on public.storyboards(workspace_id, created_at desc);

drop trigger if exists storyboards_set_updated_at on public.storyboards;
create trigger storyboards_set_updated_at
  before update on public.storyboards
  for each row execute function public.set_updated_at();

alter table public.storyboards enable row level security;

drop policy if exists "members can read workspace storyboards"   on public.storyboards;
drop policy if exists "members can insert workspace storyboards" on public.storyboards;
drop policy if exists "members can update workspace storyboards" on public.storyboards;
drop policy if exists "members can delete workspace storyboards" on public.storyboards;

create policy "members can read workspace storyboards"
  on public.storyboards for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can insert workspace storyboards"
  on public.storyboards for insert
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can update workspace storyboards"
  on public.storyboards for update
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can delete workspace storyboards"
  on public.storyboards for delete
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Extend credit_transactions.reason for the new storyboard cost codes.
-- -----------------------------------------------------------------------------
alter table public.credit_transactions
  drop constraint if exists credit_transactions_reason_check;

alter table public.credit_transactions
  add constraint credit_transactions_reason_check
  check (reason in (
    'initial_grant',
    'monthly_grant',
    'topup',
    'plan_upgrade',
    'influencer_render',
    'post_variant_render',
    'caption_generation',
    'series_plan_generation',
    'storyboard_generation',
    'storyboard_shot_render',
    'refund',
    'admin_adjustment'
  ));
