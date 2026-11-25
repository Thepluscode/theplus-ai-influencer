with worker_jobs as (
  select jobid, jobname, schedule, command, active
  from cron.job
  where jobname in (
    'theplus-content-pipeline',
    'theplus-storyboard-animate',
    'theplus-storyboard-export'
  )
), recent_runs as (
  select d.status
  from cron.job_run_details d
  join worker_jobs j on j.jobid = d.jobid
  where d.start_time > now() - interval '10 minutes'
), recent_responses as (
  select status_code, error_msg
  from net._http_response
  where created > now() - interval '10 minutes'
)
select
  (select count(*) from worker_jobs) = 3 as exactly_three_worker_jobs,
  coalesce((select bool_and(active) from worker_jobs), false) as all_worker_jobs_active,
  coalesce(
    (select bool_and(schedule = '* * * * *') from worker_jobs),
    false
  ) as all_worker_jobs_run_every_minute,
  (select count(*) from recent_runs where status = 'succeeded') >= 3
    as recent_worker_runs_succeeded,
  (select count(*) from recent_runs where status <> 'succeeded') = 0
    as no_recent_worker_run_failures,
  (select count(*) from recent_responses where status_code = 200) >= 3
    as recent_worker_requests_returned_200,
  (
    select count(*)
    from recent_responses
    where status_code <> 200 or error_msg is not null
  ) = 0 as no_recent_worker_request_errors,
  (
    select count(*)
    from vault.secrets
    where name in ('theplus_app_url', 'theplus_cron_secret')
  ) = 2 as scheduler_secrets_exist,
  not has_function_privilege(
    'anon',
    'public.invoke_theplus_worker(text)',
    'execute'
  ) as anon_denied,
  not has_function_privilege(
    'authenticated',
    'public.invoke_theplus_worker(text)',
    'execute'
  ) as authenticated_denied,
  has_function_privilege(
    'service_role',
    'public.invoke_theplus_worker(text)',
    'execute'
  ) as service_role_allowed;
