-- =============================================================================
-- 0033_lock_workspace_columns.sql — owners can no longer write their own balance
-- =============================================================================
-- CRITICAL, live since 0001 + 0006. 0001 gave owners an UPDATE policy on
-- public.workspaces with no column restriction, Supabase grants UPDATE on every
-- public table to `authenticated`, and 0006 then put the credit balance and the
-- billing state on that same row. So any signed-in user could, straight through
-- the REST API with the anon key and their own session:
--   PATCH /rest/v1/workspaces?id=eq.<own id>  {"credits": 999999, "plan": "agency"}
-- and also point stripe_customer_id at someone else's Stripe customer (the
-- billing portal is opened from that column). 0022–0026 closed the credit RPCs;
-- none of them touched the table itself. Reproduced on a scratch Postgres 17
-- replay of 0001 + 0006 with Supabase role shims: UPDATE 1, credits 360 → 999999,
-- plan free → agency. Cross-tenant was already blocked (UPDATE 0).
--
-- The same table also let an owner DELETE their workspace; the next request's
-- getOrCreateCurrentWorkspace() then inserted a fresh one with the 360-credit
-- default — an unlimited free-credit loop (and it cascades away all their data).
--
-- No application code needs any of this. Every session-client write to
-- workspaces is the bootstrap INSERT of (owner_user_id, name) in
-- src/lib/workspace.ts. Balance, plan and Stripe columns are written only by the
-- service role (Stripe webhook) and by SECURITY DEFINER functions
-- (consume_credits, grant_credits, apply_plan_credits,
-- bootstrap_workspace_for_user), which these revokes do not affect.
--
-- The ledger had the same shape: 0006 let owners INSERT their own
-- credit_transactions rows ("so a compromised client cannot mint credits" — it
-- cannot move the balance, but it can forge history, which is what reconciliation
-- and abuse detection read, and it can pre-occupy a refund's 0021 dedupe key).
-- No application code inserts ledger rows; only the SECURITY DEFINER credit
-- functions do. Owners keep read access.
--
-- An owner can still INSERT a second workspace, but only (owner_user_id, name):
-- it starts at the 360 default and getOrCreateCurrentWorkspace() always picks
-- the OLDEST row, so an extra workspace is creatable but never used.
--
-- Rollback: grant update, delete on public.workspaces and insert on
-- public.credit_transactions to authenticated, and recreate the three policies
-- from 0001/0006. Do not roll back without a replacement.
-- =============================================================================

-- TRUNCATE too: production showed both roles holding it, and it bypasses RLS.
-- PostgREST does not expose it, so this is defence in depth, not a live path.
revoke insert, update, delete, truncate on public.workspaces from anon, authenticated;

-- The bootstrap insert may name only these columns; credits and plan come from
-- the column defaults (360 / 'free'), never from the caller.
grant insert (owner_user_id, name) on public.workspaces to authenticated;

-- With no UPDATE/DELETE policy, a future grant cannot silently reopen this:
-- RLS would still refuse the row.
drop policy if exists "owners can update own workspaces" on public.workspaces;
drop policy if exists "owners can delete own workspaces" on public.workspaces;

revoke insert, update, delete, truncate on public.credit_transactions from anon, authenticated;
drop policy if exists "owners can insert credit transactions" on public.credit_transactions;
