-- Durable queue draining for content, animation, and MP4 export jobs.
-- The application URL and dedicated cron bearer live in Supabase Vault.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.invoke_theplus_worker(p_path text)
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  app_url text;
  cron_secret text;
  request_id bigint;
begin
  if p_path not in (
    '/api/jobs/content-pipeline',
    '/api/jobs/storyboard-animate',
    '/api/jobs/storyboard-export'
  ) then
    raise exception 'Worker path is not allowed.' using errcode = '42501';
  end if;

  select decrypted_secret into app_url
  from vault.decrypted_secrets
  where name = 'theplus_app_url';

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'theplus_cron_secret';

  if nullif(app_url, '') is null or nullif(cron_secret, '') is null then
    raise exception 'Worker scheduler secrets are not configured.';
  end if;

  select net.http_post(
    url := rtrim(app_url, '/') || p_path,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    timeout_milliseconds := 120000
  ) into request_id;

  return request_id;
end;
$$;

revoke execute on function public.invoke_theplus_worker(text)
  from public, anon, authenticated;
grant execute on function public.invoke_theplus_worker(text)
  to service_role;

do $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid from cron.job
    where jobname in (
      'theplus-content-pipeline',
      'theplus-storyboard-animate',
      'theplus-storyboard-export'
    )
  loop
    perform cron.unschedule(existing_job);
  end loop;
end;
$$;

select cron.schedule(
  'theplus-content-pipeline',
  '* * * * *',
  $$select public.invoke_theplus_worker('/api/jobs/content-pipeline');$$
);

select cron.schedule(
  'theplus-storyboard-animate',
  '* * * * *',
  $$select public.invoke_theplus_worker('/api/jobs/storyboard-animate');$$
);

select cron.schedule(
  'theplus-storyboard-export',
  '* * * * *',
  $$select public.invoke_theplus_worker('/api/jobs/storyboard-export');$$
);
