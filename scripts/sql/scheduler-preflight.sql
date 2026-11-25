select
  exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron_enabled,
  exists (select 1 from pg_extension where extname = 'pg_net') as pg_net_enabled,
  exists (select 1 from pg_namespace where nspname = 'vault') as vault_available;
