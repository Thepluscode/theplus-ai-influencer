-- =============================================================================
-- 0005_post_uploads_bucket.sql
-- =============================================================================
-- Storage bucket for operator-uploaded post imagery. Two use cases:
--
--   1. "Skip render" — operator drops a finished image (their own shoot,
--      Midjourney, etc.) and uses this app only for caption + scheduling.
--   2. "Product reference" — operator drops a product photo that gets passed
--      to Luma as a second `image_ref` alongside the model's `character_ref`,
--      so the AI persona is rendered holding/wearing the real product.
--
-- Public read is required because:
--   - Luma fetches the URL during generation (no auth header support)
--   - Public share permalinks /p/<token> render the image to anyone
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-uploads',
  'post-uploads',
  true,
  10485760, -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- RLS — workspace-scoped writes, public reads
-- -----------------------------------------------------------------------------

drop policy if exists "members can upload post images" on storage.objects;
drop policy if exists "members can manage their post uploads" on storage.objects;
drop policy if exists "anyone can read post uploads" on storage.objects;

-- Path convention enforced by the upload helper: `{workspaceId}/<uuid>.<ext>`.
-- The first path segment IS the workspace id; the policy gates on whether
-- the caller owns that workspace.
create policy "members can upload post images"
  on storage.objects for insert
  with check (
    bucket_id = 'post-uploads'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can manage their post uploads"
  on storage.objects for update
  using (
    bucket_id = 'post-uploads'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can delete their post uploads"
  on storage.objects for delete
  using (
    bucket_id = 'post-uploads'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "anyone can read post uploads"
  on storage.objects for select
  using (bucket_id = 'post-uploads');
