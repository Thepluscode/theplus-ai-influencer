-- =============================================================================
-- 0007_content_plans.sql
-- =============================================================================
-- Stores LLM-generated content arcs (Series Planner — v2 of STRATEGY.md).
-- A plan is a workspace-scoped list of post ideas across N days, each
-- with a brief that can be one-clicked into the Create Post wizard.
--
-- items shape (jsonb array):
--   {
--     day:        integer,   -- 0-indexed offset from start
--     theme:      text,      -- one-line angle ("morning routine")
--     brief:      text,      -- detailed campaign brief
--     scene:      text,
--     outfit:     text,
--     props:      text,
--     hook:       text,
--     postGoal:   'awareness'|'engagement'|'launch'|'sales'|'community',
--     platforms:  text[],
--     format:     'square'|'portrait'|'landscape',
--     brandTone:  ..., cta: ...,
--     scheduledAt: iso timestamp (computed from start + day + time)
--   }
-- =============================================================================

create table if not exists public.content_plans (
  id                 uuid        primary key default gen_random_uuid(),
  workspace_id       uuid        not null references public.workspaces(id) on delete cascade,
  -- nullable: keep the plan if the source persona is deleted
  model_id           uuid        references public.ai_models(id) on delete set null,
  name               text        not null,
  goal               text        not null
                                 check (goal in ('awareness', 'engagement', 'launch', 'sales', 'community')),
  duration_days      integer     not null check (duration_days between 1 and 60),
  cadence_per_week   integer     not null check (cadence_per_week between 1 and 14),
  start_date         date        not null default current_date,
  -- Full creative brief that was used to seed the plan; lets us
  -- regenerate against the same inputs later.
  seed_inputs        jsonb       not null,
  items              jsonb       not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists content_plans_workspace_id_idx
  on public.content_plans(workspace_id, created_at desc);

drop trigger if exists content_plans_set_updated_at on public.content_plans;
create trigger content_plans_set_updated_at
  before update on public.content_plans
  for each row execute function public.set_updated_at();

alter table public.content_plans enable row level security;

drop policy if exists "members can read workspace plans"   on public.content_plans;
drop policy if exists "members can insert workspace plans" on public.content_plans;
drop policy if exists "members can update workspace plans" on public.content_plans;
drop policy if exists "members can delete workspace plans" on public.content_plans;

create policy "members can read workspace plans"
  on public.content_plans for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can insert workspace plans"
  on public.content_plans for insert
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can update workspace plans"
  on public.content_plans for update
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can delete workspace plans"
  on public.content_plans for delete
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Extend credit_transactions.reason to include the new Series Planner cost.
-- Done in the same migration so a single Run gives us both the table and
-- the working ledger entry.
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
    'refund',
    'admin_adjustment'
  ));
