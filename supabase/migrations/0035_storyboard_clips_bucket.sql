-- =============================================================================
-- 0035 — Storage bucket for animated storyboard clips from providers whose
-- own URLs expire.
--
-- Runway output URLs die 24–48 h after a task finishes. A storyboard shows its
-- clips straight from `shots[].videoUrl`, so a Runway clip would go dead in the
-- app a day later. The Runway path now copies each finished clip here and
-- stores this bucket's URL instead (src/lib/runway.ts → persistRunwayClip).
--
-- Public for the same reason as 0027: the storyboard page plays the clip with a
-- plain <video src>, and the MP4 export downloads it with no auth header.
-- Object paths are `runway/<taskId>.mp4` — unguessable provider task ids.
--
-- No policies at all on storage.objects for this bucket:
--   * writes come only from the service-role worker (bypasses RLS), so no
--     authenticated user can upload or overwrite a clip;
--   * no select policy, so the bucket cannot be listed — objects are reachable
--     only by their exact public URL (same reasoning as 0027).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'storyboard-clips',
  'storyboard-clips',
  true,
  104857600, -- 100 MB; a 10 s 720p provider clip is a few MB
  array['video/mp4']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
