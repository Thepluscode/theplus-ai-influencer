-- =============================================================================
-- 0018_lock_job_rpcs.sql
-- =============================================================================
-- Lock down the Content OS background-worker job-queue RPCs. Both functions
-- are SECURITY DEFINER and are only ever called by the cron worker via the
-- service-role admin client (src/lib/content-jobs.ts). They were created with
-- the default EXECUTE-to-PUBLIC grant, which the Supabase security advisor
-- flags (0028/0029): a signed-in or even anon user could call them via
-- /rest/v1/rpc/... and claim/mutate queue rows.
--
-- Revoke EXECUTE from PUBLIC/anon/authenticated and re-grant only to
-- service_role. The worker authenticates with SUPABASE_SERVICE_ROLE_KEY (the
-- `service_role` Postgres role), so this does not affect it.
--
-- NOTE: consume_credits / grant_credits are intentionally left callable by
-- `authenticated` — server actions invoke them with the user's session client
-- (0006 grants them on purpose). Do NOT lock those here.
--
-- The storyboard render-job RPCs (claim_storyboard_render_job) carry the same
-- exposure but are pre-existing and left untouched here to avoid changing that
-- feature's surface; lock them separately if desired.
-- =============================================================================

revoke execute on function public.claim_content_job()            from public, anon, authenticated;
revoke execute on function public.reclaim_stalled_content_jobs() from public, anon, authenticated;

grant execute on function public.claim_content_job()             to service_role;
grant execute on function public.reclaim_stalled_content_jobs()  to service_role;
