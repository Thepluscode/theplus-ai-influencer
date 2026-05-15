-- =============================================================================
-- 0012_review_comments.sql
-- =============================================================================
-- Timecoded creative review comments for storyboard review rooms and public
-- post share links. This stays separate from public social comments so inbox
-- moderation and frame-level creative feedback do not share status semantics.
-- =============================================================================

create table if not exists public.review_comments (
  id             uuid        primary key default gen_random_uuid(),
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  subject_type   text        not null check (subject_type in ('post', 'storyboard')),
  post_id        uuid        references public.posts(id) on delete cascade,
  storyboard_id  uuid        references public.storyboards(id) on delete cascade,
  author_name    text        not null check (length(trim(author_name)) between 1 and 120),
  author_email   text,
  body           text        not null check (length(trim(body)) between 1 and 1200),
  status         text        not null default 'open' check (status in ('open', 'resolved')),
  shot_index     integer     check (shot_index is null or shot_index >= 0),
  variant_index  integer     check (variant_index is null or variant_index >= 0),
  time_ms        integer     not null default 0 check (time_ms >= 0),
  anchor_x       numeric(5,2) not null default 50 check (anchor_x >= 0 and anchor_x <= 100),
  anchor_y       numeric(5,2) not null default 50 check (anchor_y >= 0 and anchor_y <= 100),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint review_comments_subject_target_chk check (
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

create index if not exists review_comments_workspace_idx
  on public.review_comments(workspace_id, created_at desc);

create index if not exists review_comments_post_idx
  on public.review_comments(post_id, created_at asc)
  where post_id is not null;

create index if not exists review_comments_storyboard_idx
  on public.review_comments(storyboard_id, created_at asc)
  where storyboard_id is not null;

create index if not exists review_comments_status_idx
  on public.review_comments(workspace_id, status);

drop trigger if exists review_comments_set_updated_at on public.review_comments;
create trigger review_comments_set_updated_at
  before update on public.review_comments
  for each row execute function public.set_updated_at();

alter table public.review_comments enable row level security;

drop policy if exists "members can read workspace review comments" on public.review_comments;
drop policy if exists "members can insert workspace review comments" on public.review_comments;
drop policy if exists "members can update workspace review comments" on public.review_comments;
drop policy if exists "members can delete workspace review comments" on public.review_comments;

create policy "members can read workspace review comments"
  on public.review_comments for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can insert workspace review comments"
  on public.review_comments for insert
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can update workspace review comments"
  on public.review_comments for update
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can delete workspace review comments"
  on public.review_comments for delete
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );
