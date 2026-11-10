-- =============================================================================
-- 0022 — Stop anonymous callers from minting credits.
--
-- PROBLEM (live since 0006, verified against prod 2026-07-31)
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default. 0006 and 0021 both
-- granted explicitly to `authenticated` but never revoked PUBLIC, so `anon`
-- inherited EXECUTE on both credit RPCs. PostgREST exposes every public-schema
-- function at /rest/v1/rpc/<name>, and the anon key is public by design — it
-- ships in the browser bundle. So:
--
--   POST /rest/v1/rpc/grant_credits
--   apikey: <anon key>
--   {"p_workspace_id": "<any uuid>", "p_amount": 1000000, "p_reason": "refund"}
--
-- credits an arbitrary workspace, from an unauthenticated client. Both
-- functions are SECURITY DEFINER, so RLS on workspaces/credit_transactions
-- does not apply inside them. Confirmed reachable with p_amount = 0, which
-- raises before the UPDATE: the response was the function's own
-- 'amount must be positive', not a permission error.
--
-- consume_credits carries the same grant. It is less immediately profitable —
-- it only decrements — but it lets an anonymous caller drain any workspace's
-- balance, which is a denial-of-service on a paid feature.
--
-- FIX
-- Revoke from PUBLIC and anon; keep authenticated (server actions call these
-- with the user's session client — 0006 granted that on purpose and 0018
-- explicitly preserved it) and service_role (the Stripe webhook and cron
-- workers use the service key).
--
-- Revoking from PUBLIC alone is not enough: 0006 and 0021 granted `anon`
-- directly as members of PUBLIC pick up the grant, and Supabase's own
-- role setup grants anon separately. Both are revoked explicitly.
--
-- NOTE: authenticated retains EXECUTE, so a signed-in user can still call
-- grant_credits for ANY workspace id, not just their own — the function does
-- no ownership check. That is a real remaining hole and needs an
-- auth.uid()-based guard inside both functions, but it is a behaviour change
-- to the RPCs rather than a grant change and is deliberately NOT bundled here.
-- =============================================================================

revoke execute on function public.grant_credits(uuid, integer, text, text, text)
  from public, anon;

revoke execute on function public.consume_credits(uuid, integer, text, text, text)
  from public, anon;

-- Re-assert the intended callers, so this migration is self-contained and the
-- grants do not depend on what 0006/0021 happened to leave behind.
grant execute on function public.grant_credits(uuid, integer, text, text, text)
  to authenticated, service_role;

grant execute on function public.consume_credits(uuid, integer, text, text, text)
  to authenticated, service_role;
