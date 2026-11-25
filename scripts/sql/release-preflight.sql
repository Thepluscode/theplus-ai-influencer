select
  to_regclass('public.storyboard_export_jobs') is not null as export_table_exists,
  to_regprocedure('public.get_shared_post_by_token(uuid)') is not null as share_rpc_exists,
  exists (
    select 1 from storage.buckets
    where id = 'storyboard-exports' and public = false
  ) as private_export_bucket_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_webhooks'
      and column_name = 'signing_secret'
  ) as webhook_secret_column_exists,
  (select count(*) from public.workspace_webhooks) as webhook_count,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'posts'
      and policyname = 'anyone can read shared posts'
  ) as broad_shared_post_policy_exists;
