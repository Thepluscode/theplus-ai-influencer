-- Outbound webhook recipients need a shared secret to authenticate events.
-- Existing unsigned endpoints are disabled until their owners recreate them.

alter table public.workspace_webhooks
  add column if not exists signing_secret text;

update public.workspace_webhooks
set active = false,
    signing_secret = encode(gen_random_bytes(32), 'hex')
where signing_secret is null;

alter table public.workspace_webhooks
  alter column signing_secret set not null;

alter table public.workspace_webhooks
  drop constraint if exists workspace_webhooks_signing_secret_length;

alter table public.workspace_webhooks
  add constraint workspace_webhooks_signing_secret_length
  check (char_length(signing_secret) between 32 and 256);
