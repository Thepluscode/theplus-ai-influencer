-- =============================================================================
-- 0009_v4_engagement.sql
-- =============================================================================
-- Three v4 features from STRATEGY.md, all in one migration so a single
-- Run sets up the table chain:
--   1. comments        — Comment Watcher inbox
--   2. dm_threads      — DM Responder inbox
--   3. safety_audits   — Brand-Safety Guardian audit log
-- =============================================================================

-- -----------------------------------------------------------------------------
-- comments — Comment Watcher
-- -----------------------------------------------------------------------------
create table if not exists public.comments (
  id               uuid        primary key default gen_random_uuid(),
  workspace_id     uuid        not null references public.workspaces(id) on delete cascade,
  -- nullable: a comment can outlive the post it was on if we ever delete locally
  post_id          uuid        references public.posts(id) on delete set null,
  platform         text        not null,
  -- raw author handle as it appears on the platform
  author_handle    text        not null,
  author_avatar    text,
  comment_text     text        not null,
  status           text        not null default 'pending'
                                check (status in ('pending', 'replied', 'dismissed', 'hidden')),
  /** LLM-drafted reply the operator can approve or rewrite. */
  draft_reply      text,
  /** Sentiment / intent classification from the LLM. */
  classification   text
                                check (classification in (
                                  'fan', 'question', 'troll', 'spam', 'collab', 'unknown'
                                )),
  external_id      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists comments_workspace_id_idx
  on public.comments(workspace_id, created_at desc);
create index if not exists comments_post_id_idx
  on public.comments(post_id) where post_id is not null;

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

alter table public.comments enable row level security;

drop policy if exists "members can read workspace comments"   on public.comments;
drop policy if exists "members can insert workspace comments" on public.comments;
drop policy if exists "members can update workspace comments" on public.comments;
drop policy if exists "members can delete workspace comments" on public.comments;

create policy "members can read workspace comments"
  on public.comments for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );
create policy "members can insert workspace comments"
  on public.comments for insert
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );
create policy "members can update workspace comments"
  on public.comments for update
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );
create policy "members can delete workspace comments"
  on public.comments for delete
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- dm_threads — DM Responder inbox
-- -----------------------------------------------------------------------------
create table if not exists public.dm_threads (
  id               uuid        primary key default gen_random_uuid(),
  workspace_id     uuid        not null references public.workspaces(id) on delete cascade,
  platform         text        not null,
  author_handle    text        not null,
  author_avatar    text,
  /** Most recent inbound message text (full thread storage is v2). */
  last_message     text        not null,
  /** Triage bucket from the LLM. */
  classification   text        not null
                                check (classification in (
                                  'collab', 'lead', 'fan', 'support', 'spam', 'other'
                                )),
  /** One-line summary of what the sender wants. */
  summary          text,
  /** LLM-drafted reply. */
  suggested_reply  text,
  status           text        not null default 'pending'
                                check (status in ('pending', 'replied', 'archived', 'snoozed')),
  external_id      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists dm_threads_workspace_id_idx
  on public.dm_threads(workspace_id, created_at desc);
create index if not exists dm_threads_classification_idx
  on public.dm_threads(workspace_id, classification);

drop trigger if exists dm_threads_set_updated_at on public.dm_threads;
create trigger dm_threads_set_updated_at
  before update on public.dm_threads
  for each row execute function public.set_updated_at();

alter table public.dm_threads enable row level security;

drop policy if exists "members can read workspace dms"   on public.dm_threads;
drop policy if exists "members can insert workspace dms" on public.dm_threads;
drop policy if exists "members can update workspace dms" on public.dm_threads;
drop policy if exists "members can delete workspace dms" on public.dm_threads;

create policy "members can read workspace dms"
  on public.dm_threads for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );
create policy "members can insert workspace dms"
  on public.dm_threads for insert
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );
create policy "members can update workspace dms"
  on public.dm_threads for update
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );
create policy "members can delete workspace dms"
  on public.dm_threads for delete
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- safety_audits — Brand-Safety Guardian audit log
-- -----------------------------------------------------------------------------
create table if not exists public.safety_audits (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  -- nullable: audit can be pre-save (no post yet) or for a saved post
  post_id         uuid        references public.posts(id) on delete set null,
  caption         text        not null,
  image_url       text,
  verdict         text        not null
                              check (verdict in ('pass', 'warn', 'block')),
  /** Array of { severity, code, message, suggestion }. */
  issues          jsonb       not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists safety_audits_workspace_id_idx
  on public.safety_audits(workspace_id, created_at desc);

alter table public.safety_audits enable row level security;

drop policy if exists "members can read workspace audits"   on public.safety_audits;
drop policy if exists "members can insert workspace audits" on public.safety_audits;

create policy "members can read workspace audits"
  on public.safety_audits for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );
create policy "members can insert workspace audits"
  on public.safety_audits for insert
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Extend credit_transactions.reason for the three new cost codes.
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
    'brand_safety_check',
    'comment_reply_draft',
    'dm_triage',
    'refund',
    'admin_adjustment'
  ));
