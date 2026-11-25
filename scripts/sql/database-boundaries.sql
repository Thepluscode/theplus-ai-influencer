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
\ir ../../supabase/migrations/0035_storyboard_clips_bucket.sql
\ir ../../supabase/migrations/0036_oauth_clients_read_only.sql

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
  -- Provider clips: public by URL, but no storage.objects policy may name the
  -- bucket, so users can neither list nor write it (service role only).
  if (select public from storage.buckets where id = 'storyboard-clips') is distinct from true then
    raise exception 'storyboard clips bucket is missing or not public';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and coalesce(qual, '') || coalesce(with_check, '') like '%storyboard-clips%'
  ) then
    raise exception 'storyboard clips bucket has a storage.objects policy';
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

-- 0036 must be safe to re-run (policies exist from the first application).
\ir ../../supabase/migrations/0036_oauth_clients_read_only.sql

-- 0036: a token issued to an OAuth client (claim client_id) is read-only and
-- reads only what the MCP tools read. Every RLS table must carry the policies.
do $$
declare
  rls_tables int;
  covered int;
begin
  select count(*) into rls_tables
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity;
  select count(distinct tablename) into covered
    from pg_policies
   where schemaname = 'public'
     and policyname in ('oauth_clients_no_insert', 'oauth_clients_no_update', 'oauth_clients_no_delete')
   group by schemaname;
  if rls_tables < 27 then
    raise exception 'expected at least 27 RLS tables, found %', rls_tables;
  end if;
  if covered <> rls_tables then
    raise exception 'OAuth write-deny policies cover % of % RLS tables', covered, rls_tables;
  end if;
end;
$$;

insert into public.workspace_webhooks (workspace_id, name, url, signing_secret)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'oauth probe', 'https://example.com/o', repeat('o', 32));
insert into storage.objects (bucket_id, name)
values ('post-uploads', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/oauth-probe.png');
-- Hosted Supabase grants these; the harness bootstrap does not.
grant usage on schema storage to authenticated;
grant select on storage.objects to authenticated;

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","client_id":"mcp-client"}';
do $$
declare
  n int;
begin
  if (select count(*) from public.posts) < 1 or (select count(*) from public.workspaces) <> 1 then
    raise exception 'OAuth client lost the reads the MCP tools need';
  end if;
  if (select count(*) from public.workspace_webhooks) <> 0 then
    raise exception 'OAuth client read webhook signing secrets';
  end if;
  if (select count(*) from storage.objects) <> 0 then
    raise exception 'OAuth client read storage objects';
  end if;
  update public.posts set name = 'oauth wrote' where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'OAuth client updated % posts', n; end if;
  delete from public.posts where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'OAuth client deleted % posts', n; end if;
  begin
    perform public.consume_credits('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'caption_generation', 'probe', 'oauth');
    raise exception 'OAuth client spent credits';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Older PostgREST sets one GUC per claim; that form is classified too.
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set request.jwt.claim.client_id = 'mcp-client';
do $$
begin
  if (select count(*) from public.workspace_webhooks) <> 0 then
    raise exception 'legacy per-claim client_id evaded the OAuth classification';
  end if;
end;
$$;
reset request.jwt.claim.client_id;

-- Positive twin: the same user's app session (no client_id) still writes.
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare
  n int;
begin
  if (select count(*) from public.workspace_webhooks) < 1 then
    raise exception 'app session lost its own webhooks';
  end if;
  if (select count(*) from storage.objects) < 1 then
    raise exception 'app session lost its own storage objects';
  end if;
  begin
    update public.posts set name = 'session wrote' where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    get diagnostics n = row_count;
    if n < 1 then raise exception 'app session could not update its own post'; end if;
    raise exception using errcode = 'P0099', message = 'rollback';
  exception when sqlstate 'P0099' then null;
  end;
end;
$$;
reset role;

\echo 'database boundary tests passed'
