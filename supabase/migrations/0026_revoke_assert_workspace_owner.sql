-- =============================================================================
-- 0026 — Remove surface 0023 introduced.
--
-- 0023 added assert_workspace_owner() and granted EXECUTE to `authenticated`.
-- That grant was never needed. The function is only ever called via `perform`
-- from inside grant_credits / consume_credits / apply_plan_credits, all of
-- which are SECURITY DEFINER — so the nested call runs as the function OWNER,
-- not as the session role. The caller's own privileges on the helper are
-- irrelevant.
--
-- Left as-is it is a SECURITY DEFINER function callable over
-- /rest/v1/rpc/assert_workspace_owner by any signed-in user. It does a lookup
-- against public.workspaces and is the kind of thing that is harmless today and
-- load-bearing after someone extends it. Supabase's own linter flags it
-- (0029_authenticated_security_definer_function_executable).
--
-- anon was already revoked in 0023; this closes `authenticated` and PUBLIC.
--
-- VERIFY AFTER APPLYING: an authenticated owner must still be able to spend
-- credits, which proves the SECURITY DEFINER nesting works as described above
-- rather than silently depending on the grant.
-- =============================================================================

revoke execute on function public.assert_workspace_owner(uuid)
  from public, anon, authenticated;

-- service_role keeps it: the webhook and cron paths run as service_role and
-- the nested call is evaluated in that context.
grant execute on function public.assert_workspace_owner(uuid) to service_role;
