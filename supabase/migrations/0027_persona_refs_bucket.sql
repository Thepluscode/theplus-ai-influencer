-- =============================================================================
-- 0027 — Storage bucket for operator-supplied persona identity images.
--
-- The persona wizard only ever GENERATES a face (Luma), so an operator with
-- their own shoot, or a brand with an existing character, had no way to make it
-- the persona. This bucket backs a "replace image" action on a saved persona.
--
-- Kept separate from `post-uploads` deliberately. That bucket holds post
-- attachments and product references — transient content. These images ARE the
-- persona's identity: ai_models.portrait_url is passed to Luma as
-- `character_ref` by luma-post.ts, content-media.ts, storyboard.ts and
-- content-pipeline.ts, so every downstream render inherits whatever lives here.
-- Mixing the two would make "which files define a face" unanswerable, and
-- `post-uploads` carries a broad listing policy this does not need.
--
-- Public read is required for the same reason as 0005: Luma fetches the URL
-- during generation and supports no auth header.
--
-- Deliberately NO select policy on storage.objects. `public = true` is what
-- makes an object fetchable at /storage/v1/object/public/... — that path does
-- not consult RLS. A select policy governs the LIST/select API instead, which
-- is why 0005's blanket "anyone can read post uploads" lets anyone enumerate
-- that bucket (Supabase linter: public_bucket_allows_listing). Omitting it here
-- keeps persona images reachable by URL while leaving the bucket unwalkable.
-- Verified after applying, not assumed — see the migration note in
-- FEATURE_TRACKER.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'persona-refs',
  'persona-refs',
  true,
  10485760, -- 10 MB, matching post-uploads
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- RLS — workspace-scoped writes, public object reads.
-- Path convention enforced by the upload helper: `{workspaceId}/<uuid>.<ext>`,
-- so the first segment IS the workspace id and the policy gates on ownership.
-- -----------------------------------------------------------------------------

drop policy if exists "owners can upload persona refs" on storage.objects;
drop policy if exists "owners can update persona refs" on storage.objects;
drop policy if exists "owners can delete persona refs" on storage.objects;
drop policy if exists "owners can list persona refs" on storage.objects;
drop policy if exists "anyone can read persona refs" on storage.objects;

create policy "owners can upload persona refs"
  on storage.objects for insert
  with check (
    bucket_id = 'persona-refs'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "owners can update persona refs"
  on storage.objects for update
  using (
    bucket_id = 'persona-refs'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "owners can delete persona refs"
  on storage.objects for delete
  using (
    bucket_id = 'persona-refs'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- Owners may list their OWN folder (the UI shows what it uploaded). Anonymous
-- callers get no select policy at all, so they cannot enumerate the bucket —
-- while the public object path still serves the file to Luma.
create policy "owners can list persona refs"
  on storage.objects for select
  using (
    bucket_id = 'persona-refs'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );
