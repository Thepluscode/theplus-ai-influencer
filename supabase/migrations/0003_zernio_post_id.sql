-- =============================================================================
-- 0003_zernio_post_id.sql
-- =============================================================================
-- Tracks the Zernio-side post ID so we can DELETE / update the scheduled or
-- published post on the Zernio platform when the operator cancels or edits it
-- on our calendar.
-- =============================================================================

alter table public.posts
  add column if not exists zernio_post_id text;

create index if not exists posts_zernio_post_id_idx
  on public.posts(zernio_post_id) where zernio_post_id is not null;
