-- =============================================================================
-- 0025 — No user session may increase a balance.
--
-- PROBLEM (remaining after 0023)
-- 0023 stopped cross-tenant access: a signed-in user can no longer touch
-- someone else's workspace. It did not stop a user crediting their OWN
-- workspace, because grant_credits still has to be callable by `authenticated`
-- and assert_workspace_owner() passes for an owner by definition. So:
--
--   POST /rest/v1/rpc/grant_credits
--   Authorization: Bearer <their own session JWT>
--   {"p_workspace_id": "<their own>", "p_amount": 1000000, "p_reason": "refund"}
--
-- mints credits. An amount ceiling is not a fix — a capped attacker loops.
--
-- WHY authenticated HAD the grant
-- refundCredits() in src/lib/credits.ts called grant_credits through the user's
-- session client, so the grant was load-bearing. It is server-only code whose
-- callers have already decided a refund is owed and where no user input reaches
-- the amount, so it had no need of the session — it now uses the service-role
-- client, and the grant can go.
--
-- consume_credits deliberately keeps its `authenticated` grant. It only ever
-- decrements, and 0023 already restricts it to the caller's own workspace, so
-- the worst a user can do is spend credits they already paid for.
-- =============================================================================

revoke execute on function public.grant_credits(uuid, integer, text, text, text)
  from authenticated;

-- service_role remains: the Stripe topup path and refundCredits both run there.
grant execute on function public.grant_credits(uuid, integer, text, text, text)
  to service_role;
