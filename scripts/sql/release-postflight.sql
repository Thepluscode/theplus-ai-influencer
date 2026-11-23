select
  to_regclass('public.storyboard_export_jobs') is not null as export_table_exists,
  to_regprocedure('public.get_shared_post_by_token(uuid)') is not null as share_rpc_exists,
  exists (
    select 1 from storage.buckets
    where id = 'storyboard-exports'
      and public = false
      and file_size_limit = 524288000
      and allowed_mime_types = array['video/mp4']
  ) as private_export_bucket_is_correct,
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'posts'
      and policyname = 'anyone can read shared posts'
  ) as broad_shared_post_policy_removed,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_webhooks'
      and column_name = 'signing_secret'
      and is_nullable = 'NO'
  ) as webhook_secret_is_required,
  not exists (
    select 1 from public.workspace_webhooks
    where active and signing_secret is null
  ) as no_active_unsigned_webhooks,
  (select relrowsecurity from pg_class where oid = 'public.storyboard_export_jobs'::regclass)
    as export_jobs_rls_enabled,
  has_function_privilege('anon', 'public.get_shared_post_by_token(uuid)', 'execute')
    as anon_can_resolve_exact_share_token,
  not has_function_privilege('anon', 'public.enqueue_storyboard_export(uuid,uuid)', 'execute')
    as anon_cannot_enqueue_export,
  has_function_privilege('authenticated', 'public.enqueue_storyboard_export(uuid,uuid)', 'execute')
    as authenticated_can_enqueue_export,
  not has_function_privilege('authenticated', 'public.claim_storyboard_export_job()', 'execute')
    as authenticated_cannot_claim_export,
  has_function_privilege('service_role', 'public.claim_storyboard_export_job()', 'execute')
    as service_role_can_claim_export;
