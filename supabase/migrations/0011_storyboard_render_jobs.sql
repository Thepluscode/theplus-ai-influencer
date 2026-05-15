-- =============================================================================
-- 0011_storyboard_render_jobs.sql
-- =============================================================================
-- Postgres-backed job queue for animate-to-video renders. The user
-- clicks "Animate" → server action charges credits + enqueues a job →
-- returns immediately. A cron-driven worker hits
-- /api/jobs/storyboard-animate every ~30s, claims the oldest pending
-- job, animates ONE shot, then releases. Status polled by the UI.
--
-- Why per-shot (not per-job)?
--   Each Luma video render is 60-90s. Vercel hobby = 60s function cap.
--   Even on platforms without that cap, processing 4-6 shots in a single
--   long-running HTTP handler is a poor pattern: any crash mid-job
--   loses progress, and the UI can't show incremental advancement.
--   One-shot-per-tick keeps each invocation small and lets the UI
--   poll progress smoothly.
--
-- Concurrency model:
--   claim_storyboard_render_job() uses SELECT FOR UPDATE SKIP LOCKED so
--   simultaneous cron firings can't grab the same row. claimed_at is set
--   each time a worker picks up the job; reclaim_stalled flips
--   claimed_at back to NULL on any row stuck > 6 minutes (the per-shot
--   timeout in storyboard.ts is 4 min, so 6 min is a safe stall cutoff).
-- =============================================================================

create table if not exists public.storyboard_render_jobs (
  id                  uuid         primary key default gen_random_uuid(),
  workspace_id        uuid         not null references public.workspaces(id) on delete cascade,
  storyboard_id       uuid         not null references public.storyboards(id) on delete cascade,
  status              text         not null default 'pending'
                                   check (status in ('pending', 'processing', 'completed', 'failed')),
  shots_total         integer      not null check (shots_total > 0),
  shots_completed     integer      not null default 0 check (shots_completed >= 0),
  cost_charged_total  integer      not null check (cost_charged_total >= 0),
  cost_per_shot       integer      not null check (cost_per_shot >= 0),
  cost_refunded       integer      not null default 0 check (cost_refunded >= 0),
  last_error          text,
  attempts            integer      not null default 0,
  claimed_at          timestamptz,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now()
);

-- Dequeue index: cron worker pulls oldest unclaimed pending/processing row.
create index if not exists storyboard_render_jobs_queue_idx
  on public.storyboard_render_jobs(status, claimed_at, created_at)
  where status in ('pending', 'processing');

-- Status-polling index: UI looks up latest job for a storyboard.
create index if not exists storyboard_render_jobs_storyboard_idx
  on public.storyboard_render_jobs(storyboard_id, created_at desc);

drop trigger if exists storyboard_render_jobs_set_updated_at on public.storyboard_render_jobs;
create trigger storyboard_render_jobs_set_updated_at
  before update on public.storyboard_render_jobs
  for each row execute function public.set_updated_at();

alter table public.storyboard_render_jobs enable row level security;

drop policy if exists "members can read workspace render jobs" on public.storyboard_render_jobs;

-- Read-only RLS for app users. Inserts/updates are service-role only;
-- the queue must not be mutable from client cookies.
create policy "members can read workspace render jobs"
  on public.storyboard_render_jobs for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- claim_storyboard_render_job
-- -----------------------------------------------------------------------------
-- Atomically picks the oldest pending or processing job with no active
-- claim and flips it to processing/claimed. Returns the claimed row, or
-- nothing if the queue is empty.
--
-- SECURITY DEFINER so the route handler (running with service role) can
-- call it. The function is locked-down: it only operates on the queue
-- table and never reads anything else.
-- -----------------------------------------------------------------------------

create or replace function public.claim_storyboard_render_job()
returns public.storyboard_render_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  picked public.storyboard_render_jobs;
begin
  with candidate as (
    select id
    from public.storyboard_render_jobs
    where status in ('pending', 'processing')
      and claimed_at is null
      and shots_completed < shots_total
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.storyboard_render_jobs job
  set status = 'processing',
      claimed_at = now(),
      started_at = coalesce(job.started_at, now()),
      attempts = job.attempts + 1
  from candidate
  where job.id = candidate.id
  returning job.* into picked;

  return picked;
end;
$$;

-- -----------------------------------------------------------------------------
-- reclaim_stalled_storyboard_render_jobs
-- -----------------------------------------------------------------------------
-- A worker that crashes mid-shot leaves claimed_at set. This frees any
-- row stuck more than 6 minutes so the next cron tick can re-pick it.
-- Returns the number of jobs reclaimed (for observability).
-- -----------------------------------------------------------------------------

create or replace function public.reclaim_stalled_storyboard_render_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  freed integer;
begin
  update public.storyboard_render_jobs
  set claimed_at = null
  where status = 'processing'
    and claimed_at is not null
    and claimed_at < now() - interval '6 minutes';

  get diagnostics freed = row_count;
  return freed;
end;
$$;
