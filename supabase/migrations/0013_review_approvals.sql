-- =============================================================================
-- 0013_review_approvals.sql
-- =============================================================================
-- Approval state and append-only decision history for creative review.
-- Review comments capture frame feedback; review decisions capture the
-- production handoff: needs changes, approved, or final.
-- =============================================================================

alter table public.posts
  add column if not exists review_status text not null default 'needs_changes'
    check (review_status in ('needs_changes', 'approved', 'final')),
  add column if not exists review_version integer not null default 1
    check (review_version > 0),
  add column if not exists approved_at timestamptz,
  add column if not exists finalized_at timestamptz;

alter table public.storyboards
  add column if not exists review_status text not null default 'needs_changes'
    check (review_status in ('needs_changes', 'approved', 'final')),
  add column if not exists review_version integer not null default 1
    check (review_version > 0),
  add column if not exists approved_at timestamptz,
  add column if not exists finalized_at timestamptz;

create index if not exists posts_review_status_idx
  on public.posts(workspace_id, review_status);

create index if not exists storyboards_review_status_idx
  on public.storyboards(workspace_id, review_status);

create table if not exists public.review_decisions (
  id             uuid        primary key default gen_random_uuid(),
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  subject_type   text        not null check (subject_type in ('post', 'storyboard')),
  post_id        uuid        references public.posts(id) on delete cascade,
  storyboard_id  uuid        references public.storyboards(id) on delete cascade,
  version_number integer     not null check (version_number > 0),
  decision       text        not null check (decision in ('needs_changes', 'approved', 'final')),
  reviewer_name  text        not null check (length(trim(reviewer_name)) between 1 and 120),
  reviewer_email text,
  summary        text        not null check (length(trim(summary)) between 1 and 1200),
  created_at     timestamptz not null default now(),
  constraint review_decisions_subject_target_chk check (
    (
      subject_type = 'post'
      and post_id is not null
      and storyboard_id is null
    )
    or (
      subject_type = 'storyboard'
      and storyboard_id is not null
      and post_id is null
    )
  )
);

create index if not exists review_decisions_workspace_idx
  on public.review_decisions(workspace_id, created_at desc);

create index if not exists review_decisions_post_idx
  on public.review_decisions(post_id, version_number, created_at desc)
  where post_id is not null;

create index if not exists review_decisions_storyboard_idx
  on public.review_decisions(storyboard_id, version_number, created_at desc)
  where storyboard_id is not null;

alter table public.review_decisions enable row level security;

drop policy if exists "members can read workspace review decisions" on public.review_decisions;
drop policy if exists "members can insert workspace review decisions" on public.review_decisions;
drop policy if exists "members can delete workspace review decisions" on public.review_decisions;

create policy "members can read workspace review decisions"
  on public.review_decisions for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can insert workspace review decisions"
  on public.review_decisions for insert
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can delete workspace review decisions"
  on public.review_decisions for delete
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create or replace function public.record_storyboard_review_decision(
  p_workspace_id uuid,
  p_storyboard_id uuid,
  p_decision text,
  p_reviewer_name text,
  p_reviewer_email text,
  p_summary text
)
returns public.review_decisions
language plpgsql
set search_path = public
as $$
declare
  current_version integer;
  recorded public.review_decisions;
begin
  if p_decision not in ('needs_changes', 'approved', 'final') then
    raise exception 'Invalid review decision: %', p_decision;
  end if;

  select review_version into current_version
  from public.storyboards
  where id = p_storyboard_id
    and workspace_id = p_workspace_id;

  if current_version is null then
    raise exception 'Storyboard not found.';
  end if;

  update public.storyboards
  set review_status = p_decision,
      approved_at = case
        when p_decision in ('approved', 'final') then coalesce(approved_at, now())
        else null
      end,
      finalized_at = case
        when p_decision = 'final' then now()
        else null
      end
  where id = p_storyboard_id
    and workspace_id = p_workspace_id;

  insert into public.review_decisions (
    workspace_id,
    subject_type,
    storyboard_id,
    version_number,
    decision,
    reviewer_name,
    reviewer_email,
    summary
  )
  values (
    p_workspace_id,
    'storyboard',
    p_storyboard_id,
    current_version,
    p_decision,
    p_reviewer_name,
    nullif(trim(coalesce(p_reviewer_email, '')), ''),
    p_summary
  )
  returning * into recorded;

  return recorded;
end;
$$;

create or replace function public.record_post_review_decision(
  p_workspace_id uuid,
  p_post_id uuid,
  p_decision text,
  p_reviewer_name text,
  p_reviewer_email text,
  p_summary text
)
returns public.review_decisions
language plpgsql
set search_path = public
as $$
declare
  current_version integer;
  recorded public.review_decisions;
begin
  if p_decision not in ('needs_changes', 'approved', 'final') then
    raise exception 'Invalid review decision: %', p_decision;
  end if;

  select review_version into current_version
  from public.posts
  where id = p_post_id
    and workspace_id = p_workspace_id;

  if current_version is null then
    raise exception 'Post not found.';
  end if;

  update public.posts
  set review_status = p_decision,
      approved_at = case
        when p_decision in ('approved', 'final') then coalesce(approved_at, now())
        else null
      end,
      finalized_at = case
        when p_decision = 'final' then now()
        else null
      end
  where id = p_post_id
    and workspace_id = p_workspace_id;

  insert into public.review_decisions (
    workspace_id,
    subject_type,
    post_id,
    version_number,
    decision,
    reviewer_name,
    reviewer_email,
    summary
  )
  values (
    p_workspace_id,
    'post',
    p_post_id,
    current_version,
    p_decision,
    p_reviewer_name,
    nullif(trim(coalesce(p_reviewer_email, '')), ''),
    p_summary
  )
  returning * into recorded;

  return recorded;
end;
$$;
