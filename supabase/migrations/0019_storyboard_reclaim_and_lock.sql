-- =============================================================================
-- 0019_storyboard_reclaim_and_lock.sql
-- =============================================================================
-- Two fixes for the storyboard animate-to-video cron:
--
-- 1. Backfill `reclaim_stalled_storyboard_render_jobs()`. It is defined in
--    0011 locally but was never created in the prod database (the 0011 apply
--    predated it), so src/lib/storyboard-jobs.ts:reclaimStalledJobs() throws
--    "function does not exist" on every cron tick. `create or replace` is
--    idempotent and matches the 0011 definition.
--
-- 2. Lock both storyboard worker RPCs to service_role, mirroring 0018 for the
--    Content OS RPCs (they're only called by the cron via the admin client).
-- =============================================================================

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

revoke execute on function public.claim_storyboard_render_job()            from public, anon, authenticated;
revoke execute on function public.reclaim_stalled_storyboard_render_jobs() from public, anon, authenticated;

grant execute on function public.claim_storyboard_render_job()             to service_role;
grant execute on function public.reclaim_stalled_storyboard_render_jobs()  to service_role;
