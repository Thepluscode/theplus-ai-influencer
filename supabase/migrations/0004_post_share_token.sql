-- =============================================================================
-- 0004_post_share_token.sql
-- =============================================================================
-- Public, opt-in shareable permalinks for posts.
--
-- A post gets a `share_token` (UUID) when the owner clicks "Get share link".
-- Anonymous visitors can then read that single row by querying on the token.
-- Token is unguessable; setting it to NULL revokes the share. RLS is what
-- enforces this — without the policy below the anon client can't see anything
-- in `posts` regardless of token value.
-- =============================================================================

alter table public.posts
  add column if not exists share_token uuid unique;

create index if not exists posts_share_token_idx
  on public.posts(share_token)
  where share_token is not null;

-- Anyone (including anon) can read posts whose share_token is set. Combined
-- with a `.eq('share_token', token)` filter in the route handler, this is the
-- minimum surface needed — non-shared rows remain invisible to anon callers.
drop policy if exists "anyone can read shared posts" on public.posts;
create policy "anyone can read shared posts"
  on public.posts for select
  using (share_token is not null);
