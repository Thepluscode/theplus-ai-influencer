create extension if not exists pgcrypto;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
  )
$$;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
-- Supabase's helper: every path segment except the file name.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;

-- Every migration in numeric order. 0031 is skipped: it needs pg_cron, pg_net and Vault.
\ir ../../supabase/migrations/0001_initial_schema.sql
\ir ../../supabase/migrations/0002_posts.sql
\ir ../../supabase/migrations/0003_zernio_post_id.sql
\ir ../../supabase/migrations/0004_post_share_token.sql
\ir ../../supabase/migrations/0005_post_uploads_bucket.sql
\ir ../../supabase/migrations/0006_credits_and_plan.sql
\ir ../../supabase/migrations/0007_content_plans.sql
\ir ../../supabase/migrations/0008_storyboards.sql
\ir ../../supabase/migrations/0009_v4_engagement.sql
\ir ../../supabase/migrations/0010_storyboard_video.sql
\ir ../../supabase/migrations/0011_storyboard_render_jobs.sql
\ir ../../supabase/migrations/0012_review_comments.sql
\ir ../../supabase/migrations/0013_review_approvals.sql
\ir ../../supabase/migrations/0014_workspace_controls.sql
\ir ../../supabase/migrations/0015_creative_agent_runs.sql
\ir ../../supabase/migrations/0016_zernio_inbox.sql
\ir ../../supabase/migrations/0017_content_os.sql
\ir ../../supabase/migrations/0018_lock_job_rpcs.sql
\ir ../../supabase/migrations/0019_storyboard_reclaim_and_lock.sql
\ir ../../supabase/migrations/0020_processed_webhook_events.sql
\ir ../../supabase/migrations/0021_grant_credits_ref_idempotency.sql
\ir ../../supabase/migrations/0022_revoke_public_credit_rpcs.sql
\ir ../../supabase/migrations/0023_credit_rpc_ownership_guard.sql
\ir ../../supabase/migrations/0024_apply_plan_credits.sql
\ir ../../supabase/migrations/0025_revoke_authenticated_grant_credits.sql
\ir ../../supabase/migrations/0026_revoke_assert_workspace_owner.sql
\ir ../../supabase/migrations/0027_persona_refs_bucket.sql
\ir ../../supabase/migrations/0028_restrict_shared_post_reads.sql
\ir ../../supabase/migrations/0029_storyboard_exports.sql

-- A webhook registered before 0030 has no secret; 0030 must disable it.
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'legacy@example.com');
insert into public.workspace_webhooks (workspace_id, name, url)
select id, 'legacy unsigned', 'https://example.com/legacy'
from public.workspaces
where owner_user_id = '33333333-3333-3333-3333-333333333333';
\ir ../../supabase/migrations/0030_secure_workspace_webhooks.sql
\ir ../../supabase/migrations/0032_creations.sql
\ir ../../supabase/migrations/0033_lock_workspace_columns.sql
\ir ../../supabase/migrations/0034_consume_credits_spend_reasons.sql
\ir ../../supabase/migrations/0037_fail_render_job_with_refund.sql

drop trigger if exists on_auth_user_created on auth.users;

grant usage on schema public, auth to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to service_role;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

insert into public.workspaces (id, owner_user_id, name, credits) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A', 360),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B', 360);

insert into public.posts (
  id, workspace_id, name, format, prompt_inputs, variants, share_token
) values (
  'aaaaaaaa-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'shared fixture',
  'portrait',
  '{}'::jsonb,
  '[]'::jsonb,
  'dddddddd-dddd-dddd-dddd-dddddddddddd'
);

set role anon;
set request.jwt.claims = '{"role":"anon"}';
do $$
begin
  if (select count(*) from public.posts) <> 0 then
    raise exception 'anonymous caller enumerated shared posts';
  end if;
  if (select count(*) from public.get_shared_post_by_token(
    'dddddddd-dddd-dddd-dddd-dddddddddddd'
  )) <> 1 then
    raise exception 'exact share token did not resolve';
  end if;
  if (select count(*) from public.get_shared_post_by_token(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  )) <> 0 then
    raise exception 'wrong share token resolved a row';
  end if;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  begin
    perform public.grant_credits(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1000, 'refund', 'probe', 'self'
    );
    raise exception 'authenticated caller granted itself credits';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.consume_credits(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'dm_triage', 'probe', 'cross'
    );
    raise exception 'cross-workspace credits were consumed';
  exception when insufficient_privilege then
    null;
  end;

  if public.consume_credits(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 'dm_triage', 'probe', 'own'
  ) <> 359 then
    raise exception 'owner could not spend its own credits';
  end if;
end;
$$;
reset role;

insert into public.storyboards (
  id, workspace_id, name, brief, format, shots
) values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'approved animation',
  'test export',
  'portrait',
  '[
    {"index":0,"videoUrl":"https://storage.cdn-luma.com/first.mp4","videoGenerationId":"g1"},
    {"index":1,"videoUrl":"https://storage.cdn-luma.com/second.mp4","videoGenerationId":"g2"}
  ]'::jsonb
);

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.record_storyboard_review_decision(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'approved',
  'Owner A',
  null,
  'Approved for export'
);

do $$
declare
  first_job public.storyboard_export_jobs;
  duplicate_job public.storyboard_export_jobs;
begin
  first_job := public.enqueue_storyboard_export(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );
  duplicate_job := public.enqueue_storyboard_export(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );
  if first_job.id <> duplicate_job.id then
    raise exception 'duplicate clicks created different export jobs';
  end if;
  if (select count(*) from public.storyboard_export_jobs) <> 1 then
    raise exception 'duplicate clicks created more than one export row';
  end if;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  begin
    perform public.enqueue_storyboard_export(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cccccccc-cccc-cccc-cccc-cccccccccccc'
    );
    raise exception 'cross-workspace export was queued';
  exception when insufficient_privilege then
    null;
  end;
  if (select count(*) from public.storyboard_export_jobs) <> 0 then
    raise exception 'cross-workspace export job was visible';
  end if;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update public.storyboards
set shots = jsonb_set(shots, '{0,hookCaption}', '"changed"'::jsonb)
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

do $$
declare
  status text;
  version integer;
begin
  select review_status, review_version into status, version
  from public.storyboards
  where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if status <> 'needs_changes' or version <> 2 then
    raise exception 'shot change did not invalidate approval: %, v%', status, version;
  end if;
  begin
    perform public.enqueue_storyboard_export(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cccccccc-cccc-cccc-cccc-cccccccccccc'
    );
    raise exception 'unapproved changed storyboard was queued';
  exception when raise_exception then
    if sqlerrm not like '%approval is required%' then raise; end if;
  end;
end;
$$;

select public.record_storyboard_review_decision(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'approved',
  'Owner A',
  null,
  'Approved changed version'
);

do $$
begin
  perform public.enqueue_storyboard_export(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );
  if (select count(*) from public.storyboard_export_jobs) <> 2 then
    raise exception 'newly approved version did not create one new export';
  end if;
end;
$$;

select public.record_storyboard_review_decision(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'needs_changes',
  'Owner A',
  null,
  'Approval withdrawn'
);

do $$
declare
  status text;
  version integer;
begin
  select review_status, review_version into status, version
  from public.storyboards
  where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if status <> 'needs_changes' or version <> 3 then
    raise exception 'withdrawal did not invalidate approval: %, v%', status, version;
  end if;
end;
$$;
reset role;

do $$
begin
  if (select public from storage.buckets where id = 'storyboard-exports') is distinct from false then
    raise exception 'storyboard export bucket is not private';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.grant_credits(uuid,integer,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated still has grant_credits execute';
  end if;
end;
$$;

-- 0034: a debit labelled as a refund cannot occupy the 0021 refund slot.
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
begin
  begin
    perform public.consume_credits(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'refund', 'storyboard_render_job', 'squat'
    );
    raise exception 'consume_credits accepted reason refund';
  exception when invalid_parameter_value then
    null;
  end;
end;
$$;
reset role;

-- Render refunds are keyed per job: two failed renders of one storyboard both
-- refund, a retried refund for the same job lands once. The legacy per-storyboard
-- ref is asserted to dedupe, which is the defect the per-job ref removes.
set role service_role;
set request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  ws constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  b0 integer;
  b1 integer;
  b2 integer;
begin
  select credits into b0 from public.workspaces where id = ws;
  perform public.grant_credits(ws, 25, 'refund', 'storyboard_render_job', 'job-1');
  perform public.grant_credits(ws, 25, 'refund', 'storyboard_render_job', 'job-2');
  perform public.grant_credits(ws, 25, 'refund', 'storyboard_render_job', 'job-1');
  select credits into b1 from public.workspaces where id = ws;
  if b1 - b0 <> 50 then
    raise exception 'per-job render refunds credited % instead of 50', b1 - b0;
  end if;
  perform public.grant_credits(ws, 25, 'refund', 'storyboard', 'sb-legacy');
  perform public.grant_credits(ws, 25, 'refund', 'storyboard', 'sb-legacy');
  select credits into b2 from public.workspaces where id = ws;
  if b2 - b1 <> 25 then
    raise exception 'legacy storyboard ref did not dedupe: credited %', b2 - b1;
  end if;
  if (select count(*) from public.credit_transactions
      where workspace_id = ws and reason = 'refund') <> 3 then
    raise exception 'refund ledger rows do not match credited refunds';
  end if;
end;
$$;
reset role;

do $$
declare
  legacy public.workspace_webhooks%rowtype;
  ws uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
begin
  select * into strict legacy from public.workspace_webhooks where name = 'legacy unsigned';
  if legacy.active or char_length(legacy.signing_secret) <> 64 then
    raise exception '0030 left a legacy webhook active or without a generated secret';
  end if;
  begin
    insert into public.workspace_webhooks (workspace_id, name, url)
    values (ws, 'no secret', 'https://example.com/a');
    raise exception 'webhook without a signing secret was accepted';
  exception when not_null_violation then null;
  end;
  begin
    insert into public.workspace_webhooks (workspace_id, name, url, signing_secret)
    values (ws, 'short secret', 'https://example.com/b', 'too-short');
    raise exception 'webhook with a short signing secret was accepted';
  exception when check_violation then null;
  end;
  insert into public.workspace_webhooks (workspace_id, name, url, signing_secret)
  values (ws, 'signed', 'https://example.com/c', repeat('s', 32));
end;
$$;

-- 0037: render progress and failure are each one transaction, fenced by the
-- worker's claim; the refund comes from the job's own counters.
insert into public.storyboards (id, workspace_id, name, brief, format, shots) values
  ('cccccccc-0037-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'render refund', 'refund probe', 'portrait', '[{"index":0},{"index":1}]'::jsonb),
  ('cccccccc-0037-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'deleted mid-render', 'refund probe', 'portrait', '[{"index":0},{"index":1}]'::jsonb);
insert into public.storyboard_render_jobs (
  id, workspace_id, storyboard_id, status, shots_total, shots_completed,
  cost_charged_total, cost_per_shot, claimed_at
) values
  -- j1: progress then failure
  ('dddddddd-0037-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-0037-0000-0000-000000000001', 'processing', 2, 0, 50, 25, '2026-11-25 10:00:00+00'),
  -- j2: ledger blocked with P0001; j3: ledger blocked with 23505
  ('dddddddd-0037-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-0037-0000-0000-000000000001', 'processing', 2, 0, 50, 25, '2026-11-25 10:00:00+00'),
  ('dddddddd-0037-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-0037-0000-0000-000000000001', 'processing', 2, 0, 50, 25, '2026-11-25 10:00:00+00'),
  -- j4: already completed, but still carrying a claim token (a legacy or
  -- hand-edited row): the status guard alone must stop both calls
  ('dddddddd-0037-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-0037-0000-0000-000000000001', 'completed', 2, 0, 50, 25, '2026-11-25 10:00:00+00'),
  -- j5: a refund was already posted for it by the old worker path
  ('dddddddd-0037-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-0037-0000-0000-000000000001', 'processing', 2, 0, 50, 25, '2026-11-25 10:00:00+00'),
  -- j6: claimed; another worker already delivered 1 of 2; then the storyboard is deleted
  ('dddddddd-0037-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-0037-0000-0000-000000000002', 'processing', 2, 1, 50, 25, '2026-11-25 10:00:00+00'),
  -- j7: still pending (never claimed) when the storyboard is deleted
  ('dddddddd-0037-0000-0000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-0037-0000-0000-000000000002', 'pending', 2, 0, 50, 25, null),
  -- j9: already completed on the same storyboard; deletion must not refund it
  ('dddddddd-0037-0000-0000-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-0037-0000-0000-000000000002', 'completed', 2, 0, 50, 25, null);

select public.grant_credits(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 50, 'refund', 'storyboard_render_job',
  'dddddddd-0037-0000-0000-000000000005'
);

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
begin
  begin
    perform public.fail_storyboard_render_job(
      'dddddddd-0037-0000-0000-000000000001', '2026-11-25 10:00:00+00', 'x');
    raise exception 'authenticated could fail and refund a render job';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_storyboard_render_shot(
      'dddddddd-0037-0000-0000-000000000001', '2026-11-25 10:00:00+00', '[]'::jsonb);
    raise exception 'authenticated could record render progress';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.post_storyboard_render_refund(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-0037-0000-0000-000000000001', 999);
    raise exception 'authenticated could post a render refund directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set role service_role;
set request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  ws uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  t timestamptz := '2026-11-25 10:00:00+00';
  j1 uuid := 'dddddddd-0037-0000-0000-000000000001';
  j public.storyboard_render_jobs%rowtype;
  credits_before int;
  r int;
  rec text;
begin
  -- A null token never passes the fence, even against an unclaimed job.
  rec := public.record_storyboard_render_shot('dddddddd-0037-0000-0000-000000000007', null, '[]');
  r := public.fail_storyboard_render_job('dddddddd-0037-0000-0000-000000000007', null, 'x');
  if rec <> 'stale' or r is not null
     or (select shots_completed from public.storyboard_render_jobs
          where id = 'dddddddd-0037-0000-0000-000000000007') <> 0
     or (select status from public.storyboard_render_jobs
          where id = 'dddddddd-0037-0000-0000-000000000007') <> 'pending' then
    raise exception 'a null claim token passed the fence';
  end if;

  -- A stale claim token records nothing.
  if public.record_storyboard_render_shot(j1, t + interval '1 second',
       '[{"index":0,"videoUrl":"https://x/stale.mp4"},{"index":1}]') <> 'stale' then
    raise exception 'stale claim recorded progress';
  end if;
  if (select shots_completed from public.storyboard_render_jobs where id = j1) <> 0
     or (select shots -> 0 ->> 'videoUrl' from public.storyboards
          where id = 'cccccccc-0037-0000-0000-000000000001') is not null then
    raise exception 'stale claim wrote shots or progress';
  end if;

  -- The current claim saves the shot and advances the counter together.
  rec := public.record_storyboard_render_shot(j1, t,
       '[{"index":0,"videoUrl":"https://x/0.mp4"},{"index":1}]');
  if rec <> 'progress' then
    raise exception 'shot progress not recorded';
  end if;
  select * into j from public.storyboard_render_jobs where id = j1;
  if j.shots_completed <> 1 or j.claimed_at is not null
     or (select shots -> 0 ->> 'videoUrl' from public.storyboards
          where id = 'cccccccc-0037-0000-0000-000000000001') <> 'https://x/0.mp4' then
    raise exception 'shot save and counter did not move together';
  end if;

  -- The owner appends a blank shot: the refund must not change (Codex S1).
  update public.storyboards
     set shots = shots || '[{"index":2}]'::jsonb
   where id = 'cccccccc-0037-0000-0000-000000000001';
  update public.storyboard_render_jobs set claimed_at = t where id = j1; -- re-claimed

  select credits into credits_before from public.workspaces where id = ws;
  r := public.fail_storyboard_render_job(j1, t, 'provider rejected the shot');
  if r is distinct from 25 then
    raise exception 'refunded % for one undelivered shot, expected 25', r;
  end if;
  select * into j from public.storyboard_render_jobs where id = j1;
  if j.status <> 'failed' or j.cost_refunded <> 25 or j.claimed_at is not null
     or (select credits from public.workspaces where id = ws) <> credits_before + 25 then
    raise exception 'failure and refund were not recorded together';
  end if;

  -- Repeat: no-op.
  r := public.fail_storyboard_render_job(j1, t, 'again');
  if r is distinct from 25
     or (select count(*) from public.credit_transactions
          where ref_kind = 'storyboard_render_job' and ref_id = j1::text) <> 1
     or (select credits from public.workspaces where id = ws) <> credits_before + 25 then
    raise exception 'repeat call changed the refund';
  end if;

  -- A late worker cannot complete (or progress) a failed job.
  rec := public.record_storyboard_render_shot(j1, null, '[]');
  if rec <> 'stale'
     or (select status from public.storyboard_render_jobs where id = j1) <> 'failed' then
    raise exception 'a failed job was overwritten by a late worker';
  end if;

  -- A completed job is never refunded or progressed, even with a matching token.
  rec := public.record_storyboard_render_shot('dddddddd-0037-0000-0000-000000000004', t, '[]');
  r := public.fail_storyboard_render_job('dddddddd-0037-0000-0000-000000000004', t, 'late');
  if r is distinct from 0
     or rec <> 'stale'
     or (select shots_completed from public.storyboard_render_jobs
          where id = 'dddddddd-0037-0000-0000-000000000004') <> 0
     or (select count(*) from public.credit_transactions
          where ref_id = 'dddddddd-0037-0000-0000-000000000004') <> 0
     or (select status from public.storyboard_render_jobs
          where id = 'dddddddd-0037-0000-0000-000000000004') <> 'completed' then
    raise exception 'a completed job was failed or refunded';
  end if;

  -- Another worker's claim: nothing changes.
  r := public.fail_storyboard_render_job('dddddddd-0037-0000-0000-000000000002',
       t + interval '1 second', 'x');
  if r is not null
     or (select count(*) from public.credit_transactions
          where ref_id = 'dddddddd-0037-0000-0000-000000000002') <> 0
     or (select status from public.storyboard_render_jobs
          where id = 'dddddddd-0037-0000-0000-000000000002') <> 'processing' then
    raise exception 'a stale claim failed the job';
  end if;

  -- An existing refund for the job is reused, never doubled.
  select credits into credits_before from public.workspaces where id = ws;
  r := public.fail_storyboard_render_job('dddddddd-0037-0000-0000-000000000005', t, 'x');
  if r is distinct from 50
     or (select credits from public.workspaces where id = ws) <> credits_before
     or (select count(*) from public.credit_transactions
          where ref_id = 'dddddddd-0037-0000-0000-000000000005') <> 1 then
    raise exception 'an existing refund was posted again';
  end if;
end;
$$;
reset role;

-- Deleting the storyboard cascades away j6 (claimed, 1 of 2 delivered) and j7
-- (never claimed). The delete trigger settles each from the job's own
-- counters in the same transaction: 25 and 50. A stale worker that then
-- fails j6 changes nothing and reports the ledger amount.
do $$
declare
  ws uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  before_credits int;
  after_credits int;
begin
  select credits into before_credits from public.workspaces where id = ws;
  delete from public.storyboards where id = 'cccccccc-0037-0000-0000-000000000002';
  select credits into after_credits from public.workspaces where id = ws;
  if after_credits <> before_credits + 75 then
    raise exception 'deleting the storyboard refunded %, expected 75', after_credits - before_credits;
  end if;
end;
$$;
set role service_role;
set request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  ws uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  j6 uuid := 'dddddddd-0037-0000-0000-000000000006';
  credits_before int;
  r int;
begin
  select credits into credits_before from public.workspaces where id = ws;
  r := public.fail_storyboard_render_job(j6, '2026-11-25 10:00:00+00', 'gone');
  if r is distinct from 25
     or (select credits from public.workspaces where id = ws) <> credits_before
     or (select count(*) from public.credit_transactions where ref_id = j6::text) <> 1 then
    raise exception 'a stale worker changed the settled refund of a deleted job (%)', r;
  end if;
end;
$$;
reset role;

-- Deleting a whole workspace with an unfinished job still succeeds, and posts
-- nothing (there is no workspace left to credit).
insert into public.storyboards (id, workspace_id, name, brief, format, shots)
values ('cccccccc-0037-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'b render', 'probe', 'portrait', '[{"index":0}]'::jsonb);
insert into public.storyboard_render_jobs (
  id, workspace_id, storyboard_id, status, shots_total, shots_completed,
  cost_charged_total, cost_per_shot
) values ('dddddddd-0037-0000-0000-000000000008', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'cccccccc-0037-0000-0000-000000000003', 'processing', 1, 0, 25, 25);
delete from public.workspaces where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
do $$
begin
  if exists (select 1 from public.credit_transactions
              where ref_id = 'dddddddd-0037-0000-0000-000000000008') then
    raise exception 'refund posted for a deleted workspace';
  end if;
end;
$$;

-- Atomicity: if the ledger write fails, for ANY reason, the job is not failed.
-- 23505 is the code grant_credits used to swallow as "already refunded".
create function pg_temp.block_refund() returns trigger language plpgsql as $$
begin
  if new.ref_id = 'dddddddd-0037-0000-0000-000000000002' then
    raise exception 'ledger unavailable';
  elsif new.ref_id = 'dddddddd-0037-0000-0000-000000000003' then
    raise exception 'unrelated key collision' using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger block_refund before insert on public.credit_transactions
  for each row execute function pg_temp.block_refund();

set role service_role;
set request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  job uuid;
  j public.storyboard_render_jobs%rowtype;
begin
  foreach job in array array[
    'dddddddd-0037-0000-0000-000000000002'::uuid,
    'dddddddd-0037-0000-0000-000000000003'::uuid
  ] loop
    begin
      perform public.fail_storyboard_render_job(job, '2026-11-25 10:00:00+00', 'x');
      raise exception 'job % was settled although its refund could not be posted', job;
    exception when others then
      if sqlerrm not in ('ledger unavailable', 'unrelated key collision') then raise; end if;
    end;
    select * into j from public.storyboard_render_jobs where id = job;
    if j.status <> 'processing' or j.cost_refunded <> 0 then
      raise exception 'refund failed but job % recorded as % / %', job, j.status, j.cost_refunded;
    end if;
  end loop;
end;
$$;
reset role;
drop trigger block_refund on public.credit_transactions;

\echo 'database boundary tests passed'
