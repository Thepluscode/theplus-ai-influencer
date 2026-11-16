-- Shared posts are capabilities: possession of the exact UUID token grants
-- access to one row. The old SELECT policy exposed every shared row to any
-- anonymous PostgREST query, so tokens protected routes but not the table.

drop policy if exists "anyone can read shared posts" on public.posts;

create or replace function public.get_shared_post_by_token(p_token uuid)
returns setof public.posts
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.*
  from public.posts p
  where p_token is not null
    and p.share_token = p_token
  limit 1
$$;

revoke execute on function public.get_shared_post_by_token(uuid)
  from public;
grant execute on function public.get_shared_post_by_token(uuid)
  to anon, authenticated;
