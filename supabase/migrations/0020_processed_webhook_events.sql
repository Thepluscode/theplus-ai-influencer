-- ---------------------------------------------------------------------------
-- 0020 — Webhook idempotency ledger
-- ---------------------------------------------------------------------------
-- Stripe (and any other provider) redelivers webhook events on timeout, on
-- non-2xx, and on a manual "Resend" from the dashboard. Handlers that *set*
-- absolute state are replay-safe; handlers that *increment* (credit topup
-- grants) are not — a redelivery double-grants. This table records every
-- provider event id we've fully processed so the handler can no-op replays.
--
-- One row per (provider, event_id). The handler INSERTs at the top of the
-- request; a unique-violation means "already processed → ack and stop".
-- ---------------------------------------------------------------------------

create table if not exists public.processed_webhook_events (
  provider     text        not null,
  event_id     text        not null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- Written only by the service-role webhook handlers; no end-user access.
alter table public.processed_webhook_events enable row level security;
