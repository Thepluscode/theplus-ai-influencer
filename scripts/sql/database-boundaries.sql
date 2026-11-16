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
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
$$;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

\ir ../../supabase/migrations/0001_initial_schema.sql
\ir ../../supabase/migrations/0002_posts.sql
\ir ../../supabase/migrations/0004_post_share_token.sql
\ir ../../supabase/migrations/0006_credits_and_plan.sql
\ir ../../supabase/migrations/0008_storyboards.sql
\ir ../../supabase/migrations/0010_storyboard_video.sql
\ir ../../supabase/migrations/0011_storyboard_render_jobs.sql
\ir ../../supabase/migrations/0013_review_approvals.sql
\ir ../../supabase/migrations/0021_grant_credits_ref_idempotency.sql
\ir ../../supabase/migrations/0022_revoke_public_credit_rpcs.sql
\ir ../../supabase/migrations/0023_credit_rpc_ownership_guard.sql
\ir ../../supabase/migrations/0025_revoke_authenticated_grant_credits.sql
\ir ../../supabase/migrations/0026_revoke_assert_workspace_owner.sql
\ir ../../supabase/migrations/0028_restrict_shared_post_reads.sql
\ir ../../supabase/migrations/0029_storyboard_exports.sql

drop trigger if exists on_auth_user_created on auth.users;

grant usage on schema public, auth to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

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

\echo 'database boundary tests passed'
