-- Real storyboard MP4 exports. A job owns an immutable copy of the approved
-- shot array and format, so later edits cannot change the media being rendered.

create table if not exists public.storyboard_export_jobs (
  id                    uuid        primary key default gen_random_uuid(),
  workspace_id          uuid        not null references public.workspaces(id) on delete cascade,
  storyboard_id         uuid        not null references public.storyboards(id) on delete cascade,
  approval_decision_id  uuid        not null references public.review_decisions(id) on delete restrict,
  review_version        integer     not null check (review_version > 0),
  snapshot_hash         text        not null check (length(snapshot_hash) = 32),
  format                text        not null check (format in ('square', 'portrait', 'landscape')),
  shots_snapshot        jsonb       not null check (jsonb_typeof(shots_snapshot) = 'array'),
  status                text        not null default 'queued'
                                    check (status in ('queued', 'rendering', 'completed', 'failed')),
  output_path           text,
  output_bytes          bigint      check (output_bytes is null or output_bytes > 0),
  output_duration_ms    integer     check (output_duration_ms is null or output_duration_ms > 0),
  output_width          integer     check (output_width is null or output_width > 0),
  output_height         integer     check (output_height is null or output_height > 0),
  has_audio             boolean,
  captions_burned_in    boolean     not null default false,
  attempts              integer     not null default 0 check (attempts >= 0),
  claimed_at            timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (storyboard_id, review_version, snapshot_hash),
  constraint storyboard_export_completed_fields check (
    status <> 'completed'
    or (
      output_path is not null
      and output_bytes is not null
      and output_duration_ms is not null
      and output_width is not null
      and output_height is not null
      and has_audio is not null
    )
  )
);

create index if not exists storyboard_export_jobs_queue_idx
  on public.storyboard_export_jobs(status, claimed_at, created_at)
  where status in ('queued', 'rendering');

create index if not exists storyboard_export_jobs_storyboard_idx
  on public.storyboard_export_jobs(storyboard_id, created_at desc);

drop trigger if exists storyboard_export_jobs_set_updated_at on public.storyboard_export_jobs;
create trigger storyboard_export_jobs_set_updated_at
  before update on public.storyboard_export_jobs
  for each row execute function public.set_updated_at();

alter table public.storyboard_export_jobs enable row level security;

drop policy if exists "members can read workspace export jobs" on public.storyboard_export_jobs;
create policy "members can read workspace export jobs"
  on public.storyboard_export_jobs for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- A changed shot sequence or format is a new review version. Only the first
-- change after approval advances the version; subsequent draft edits remain in
-- that version until it is approved again.
create or replace function public.invalidate_storyboard_approval_on_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.shots is distinct from old.shots or new.format is distinct from old.format)
     and old.review_status in ('approved', 'final') then
    new.review_status := 'needs_changes';
    new.review_version := old.review_version + 1;
    new.approved_at := null;
    new.finalized_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists storyboards_invalidate_approval on public.storyboards;
create trigger storyboards_invalidate_approval
  before update of shots, format on public.storyboards
  for each row execute function public.invalidate_storyboard_approval_on_change();

-- Withdrawing an approval is also a new version. The row lock keeps two review
-- decisions from racing over the same version number.
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
set search_path = public, pg_temp
as $$
declare
  current_version integer;
  current_status text;
  recorded public.review_decisions;
begin
  if p_decision not in ('needs_changes', 'approved', 'final') then
    raise exception 'Invalid review decision: %', p_decision;
  end if;

  select review_version, review_status
    into current_version, current_status
  from public.storyboards
  where id = p_storyboard_id
    and workspace_id = p_workspace_id
  for update;

  if current_version is null then
    raise exception 'Storyboard not found.';
  end if;

  if p_decision = 'needs_changes' and current_status in ('approved', 'final') then
    current_version := current_version + 1;
  end if;

  update public.storyboards
  set review_status = p_decision,
      review_version = current_version,
      approved_at = case
        when p_decision in ('approved', 'final') then now()
        else null
      end,
      finalized_at = case when p_decision = 'final' then now() else null end
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
  ) values (
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

-- Enqueue and deduplicate inside one database transaction. The function locks
-- the storyboard before validating approval and copying the shot array.
create or replace function public.enqueue_storyboard_export(
  p_workspace_id uuid,
  p_storyboard_id uuid
)
returns public.storyboard_export_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  storyboard public.storyboards;
  decision_id uuid;
  digest text;
  job public.storyboard_export_jobs;
begin
  perform public.assert_workspace_owner(p_workspace_id);

  select * into storyboard
  from public.storyboards
  where id = p_storyboard_id
    and workspace_id = p_workspace_id
  for update;

  if storyboard.id is null then
    raise exception 'Storyboard not found.' using errcode = '42501';
  end if;
  if storyboard.review_status not in ('approved', 'final') then
    raise exception 'Storyboard approval is required.';
  end if;
  if jsonb_typeof(storyboard.shots) <> 'array' or jsonb_array_length(storyboard.shots) = 0 then
    raise exception 'Storyboard has no shots.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(storyboard.shots) with ordinality shot(value, position)
    where jsonb_typeof(shot.value) <> 'object'
       or nullif(trim(shot.value->>'videoUrl'), '') is null
       or (shot.value->>'index') is null
  ) then
    raise exception 'Every storyboard shot must be successfully animated.';
  end if;
  if (
    select count(distinct shot.value->>'index')
    from jsonb_array_elements(storyboard.shots) shot(value)
  ) <> jsonb_array_length(storyboard.shots) then
    raise exception 'Storyboard shot indices must be unique.';
  end if;

  select id into decision_id
  from public.review_decisions
  where workspace_id = p_workspace_id
    and storyboard_id = p_storyboard_id
    and version_number = storyboard.review_version
    and decision in ('approved', 'final')
  order by created_at desc
  limit 1;

  if decision_id is null then
    raise exception 'The current storyboard version has no approval decision.';
  end if;

  digest := md5(storyboard.format || ':' || storyboard.shots::text);

  insert into public.storyboard_export_jobs (
    workspace_id,
    storyboard_id,
    approval_decision_id,
    review_version,
    snapshot_hash,
    format,
    shots_snapshot
  ) values (
    p_workspace_id,
    p_storyboard_id,
    decision_id,
    storyboard.review_version,
    digest,
    storyboard.format,
    storyboard.shots
  )
  on conflict (storyboard_id, review_version, snapshot_hash) do nothing
  returning * into job;

  if job.id is null then
    select * into job
    from public.storyboard_export_jobs
    where storyboard_id = p_storyboard_id
      and review_version = storyboard.review_version
      and snapshot_hash = digest
    for update;

    if job.status = 'failed' then
      update public.storyboard_export_jobs
      set status = 'queued',
          attempts = 0,
          claimed_at = null,
          started_at = null,
          completed_at = null,
          last_error = null,
          output_path = null,
          output_bytes = null,
          output_duration_ms = null,
          output_width = null,
          output_height = null,
          has_audio = null
      where id = job.id
      returning * into job;
    end if;
  end if;

  return job;
end;
$$;

create or replace function public.claim_storyboard_export_job()
returns public.storyboard_export_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  picked public.storyboard_export_jobs;
begin
  with candidate as (
    select id
    from public.storyboard_export_jobs
    where status = 'queued'
      and claimed_at is null
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.storyboard_export_jobs job
  set status = 'rendering',
      claimed_at = now(),
      started_at = coalesce(job.started_at, now()),
      attempts = job.attempts + 1
  from candidate
  where job.id = candidate.id
  returning job.* into picked;

  return picked;
end;
$$;

create or replace function public.reclaim_stalled_storyboard_export_jobs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  freed integer;
begin
  update public.storyboard_export_jobs
  set status = 'queued', claimed_at = null
  where status = 'rendering'
    and claimed_at is not null
    and claimed_at < now() - interval '5 minutes';
  get diagnostics freed = row_count;
  return freed;
end;
$$;

create or replace function public.complete_storyboard_export(
  p_job_id uuid,
  p_output_path text,
  p_output_bytes bigint,
  p_output_duration_ms integer,
  p_output_width integer,
  p_output_height integer,
  p_has_audio boolean
)
returns public.storyboard_export_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.storyboard_export_jobs;
  storyboard public.storyboards;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'complete_storyboard_export requires the service role'
      using errcode = '42501';
  end if;

  select * into job
  from public.storyboard_export_jobs
  where id = p_job_id
  for update;

  if job.id is null or job.status <> 'rendering' then
    raise exception 'Export job is not rendering.';
  end if;

  select * into storyboard
  from public.storyboards
  where id = job.storyboard_id
    and workspace_id = job.workspace_id
  for update;

  if storyboard.id is null
     or storyboard.review_version <> job.review_version
     or storyboard.review_status not in ('approved', 'final') then
    raise exception 'Storyboard approval changed during export.';
  end if;

  update public.storyboard_export_jobs
  set status = 'completed',
      output_path = p_output_path,
      output_bytes = p_output_bytes,
      output_duration_ms = p_output_duration_ms,
      output_width = p_output_width,
      output_height = p_output_height,
      has_audio = p_has_audio,
      captions_burned_in = false,
      claimed_at = null,
      completed_at = now(),
      last_error = null
  where id = p_job_id
  returning * into job;

  return job;
end;
$$;

revoke execute on function public.enqueue_storyboard_export(uuid, uuid)
  from public, anon;
grant execute on function public.enqueue_storyboard_export(uuid, uuid)
  to authenticated, service_role;

revoke execute on function public.claim_storyboard_export_job()
  from public, anon, authenticated;
revoke execute on function public.reclaim_stalled_storyboard_export_jobs()
  from public, anon, authenticated;
grant execute on function public.claim_storyboard_export_job()
  to service_role;
grant execute on function public.reclaim_stalled_storyboard_export_jobs()
  to service_role;
revoke execute on function public.complete_storyboard_export(uuid, text, bigint, integer, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_storyboard_export(uuid, text, bigint, integer, integer, integer, boolean)
  to service_role;

-- Output files are private. Only the service role writes or signs them; there
-- is deliberately no storage.objects policy for browser reads or listing.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'storyboard-exports',
  'storyboard-exports',
  false,
  524288000,
  array['video/mp4']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
