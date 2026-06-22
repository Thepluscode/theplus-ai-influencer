-- =============================================================================
-- 0017_content_os.sql
-- =============================================================================
-- Content OS — Extract → Repackage → Distribute.
--
-- The operator drops a source (paste / text / markdown / PDF / audio / video),
-- the pipeline EXTRACTS reusable content atoms, REPACKAGES them into
-- channel-native outputs across 10 surfaces, and queues them for
-- APPROVAL-GATED distribution through the existing posts/calendar/Zernio path.
--
-- Tables:
--   content_sources    — one row per ingested source (+ extracted text)
--   content_atoms      — structured reusable units pulled from a source
--   content_packs      — a multi-channel repackage of a source's atoms
--   content_pack_items — one channel output inside a pack (links to a draft post)
--   content_jobs       — async work queue (extract | repackage | media)
--
-- Storage:
--   content-sources    — PRIVATE bucket (no public read). The server reads
--                        files via the service-role admin client; the browser
--                        uploads under {workspaceId}/<uuid>.<ext> like
--                        post-uploads, but reads are workspace-scoped only.
--
-- Job runner mirrors 0011_storyboard_render_jobs: SELECT FOR UPDATE SKIP
-- LOCKED claim + 6-minute stall reclaim, driven by /api/jobs/content-pipeline.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- content_sources
-- -----------------------------------------------------------------------------
create table if not exists public.content_sources (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  title           text        not null,
  type            text        not null
                              check (type in ('paste', 'txt', 'md', 'pdf', 'audio', 'video')),
  status          text        not null default 'uploaded'
                              check (status in (
                                'uploaded', 'extracting', 'extracted',
                                'repackaging', 'ready', 'failed'
                              )),
  -- Storage path inside the content-sources bucket. NULL for paste sources.
  storage_path    text,
  byte_size       integer     check (byte_size is null or byte_size >= 0),
  mime_type       text,
  -- Original pasted/uploaded text (paste/txt/md). NULL for binary sources.
  raw_text        text,
  -- Normalized text after extraction/transcription — the input to atoms.
  extracted_text  text,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists content_sources_workspace_id_idx
  on public.content_sources(workspace_id, created_at desc);

drop trigger if exists content_sources_set_updated_at on public.content_sources;
create trigger content_sources_set_updated_at
  before update on public.content_sources
  for each row execute function public.set_updated_at();

alter table public.content_sources enable row level security;

drop policy if exists "members can read workspace content_sources"   on public.content_sources;
drop policy if exists "members can insert workspace content_sources" on public.content_sources;
drop policy if exists "members can update workspace content_sources" on public.content_sources;
drop policy if exists "members can delete workspace content_sources" on public.content_sources;

create policy "members can read workspace content_sources"
  on public.content_sources for select
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can insert workspace content_sources"
  on public.content_sources for insert
  with check (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can update workspace content_sources"
  on public.content_sources for update
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can delete workspace content_sources"
  on public.content_sources for delete
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- content_atoms
-- -----------------------------------------------------------------------------
create table if not exists public.content_atoms (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  source_id       uuid        not null references public.content_sources(id) on delete cascade,
  kind            text        not null
                              check (kind in (
                                'hook', 'claim', 'story', 'quote', 'framework',
                                'objection', 'proof_point', 'cta', 'audience_insight'
                              )),
  text            text        not null,
  tags            jsonb       not null default '[]'::jsonb,
  source_location text,
  confidence      numeric     check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists content_atoms_source_idx
  on public.content_atoms(source_id, created_at);
create index if not exists content_atoms_workspace_id_idx
  on public.content_atoms(workspace_id);

drop trigger if exists content_atoms_set_updated_at on public.content_atoms;
create trigger content_atoms_set_updated_at
  before update on public.content_atoms
  for each row execute function public.set_updated_at();

alter table public.content_atoms enable row level security;

drop policy if exists "members can read workspace content_atoms"   on public.content_atoms;
drop policy if exists "members can insert workspace content_atoms" on public.content_atoms;
drop policy if exists "members can update workspace content_atoms" on public.content_atoms;
drop policy if exists "members can delete workspace content_atoms" on public.content_atoms;

create policy "members can read workspace content_atoms"
  on public.content_atoms for select
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can insert workspace content_atoms"
  on public.content_atoms for insert
  with check (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can update workspace content_atoms"
  on public.content_atoms for update
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can delete workspace content_atoms"
  on public.content_atoms for delete
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- content_packs
-- -----------------------------------------------------------------------------
create table if not exists public.content_packs (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  source_id       uuid        not null references public.content_sources(id) on delete cascade,
  status          text        not null default 'draft'
                              check (status in ('draft', 'generating', 'ready', 'failed')),
  channels        jsonb       not null default '[]'::jsonb,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists content_packs_source_idx
  on public.content_packs(source_id, created_at desc);
create index if not exists content_packs_workspace_id_idx
  on public.content_packs(workspace_id);

drop trigger if exists content_packs_set_updated_at on public.content_packs;
create trigger content_packs_set_updated_at
  before update on public.content_packs
  for each row execute function public.set_updated_at();

alter table public.content_packs enable row level security;

drop policy if exists "members can read workspace content_packs"   on public.content_packs;
drop policy if exists "members can insert workspace content_packs" on public.content_packs;
drop policy if exists "members can update workspace content_packs" on public.content_packs;
drop policy if exists "members can delete workspace content_packs" on public.content_packs;

create policy "members can read workspace content_packs"
  on public.content_packs for select
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can insert workspace content_packs"
  on public.content_packs for insert
  with check (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can update workspace content_packs"
  on public.content_packs for update
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can delete workspace content_packs"
  on public.content_packs for delete
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- content_pack_items
-- -----------------------------------------------------------------------------
-- One channel-native output. Links to a draft `posts` row once approved
-- (post_id), and optionally to a storyboard for generated visuals.
create table if not exists public.content_pack_items (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  pack_id         uuid        not null references public.content_packs(id) on delete cascade,
  channel         text        not null,
  format          text        not null,
  body            jsonb       not null default '{}'::jsonb,
  status          text        not null default 'draft'
                              check (status in (
                                'draft', 'media_generating', 'ready_for_approval',
                                'approved', 'scheduled', 'published', 'failed'
                              )),
  post_id         uuid        references public.posts(id) on delete set null,
  storyboard_id   uuid        references public.storyboards(id) on delete set null,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists content_pack_items_pack_idx
  on public.content_pack_items(pack_id, created_at);
create index if not exists content_pack_items_workspace_id_idx
  on public.content_pack_items(workspace_id);

drop trigger if exists content_pack_items_set_updated_at on public.content_pack_items;
create trigger content_pack_items_set_updated_at
  before update on public.content_pack_items
  for each row execute function public.set_updated_at();

alter table public.content_pack_items enable row level security;

drop policy if exists "members can read workspace content_pack_items"   on public.content_pack_items;
drop policy if exists "members can insert workspace content_pack_items" on public.content_pack_items;
drop policy if exists "members can update workspace content_pack_items" on public.content_pack_items;
drop policy if exists "members can delete workspace content_pack_items" on public.content_pack_items;

create policy "members can read workspace content_pack_items"
  on public.content_pack_items for select
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can insert workspace content_pack_items"
  on public.content_pack_items for insert
  with check (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can update workspace content_pack_items"
  on public.content_pack_items for update
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

create policy "members can delete workspace content_pack_items"
  on public.content_pack_items for delete
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- content_jobs — async work queue (extract | repackage | media)
-- -----------------------------------------------------------------------------
-- Mirrors storyboard_render_jobs. Inserts/updates are service-role only;
-- app users get read-only access for status polling.
create table if not exists public.content_jobs (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  kind            text        not null check (kind in ('extract', 'repackage', 'media')),
  source_id       uuid        references public.content_sources(id) on delete cascade,
  pack_id         uuid        references public.content_packs(id) on delete cascade,
  pack_item_id    uuid        references public.content_pack_items(id) on delete cascade,
  status          text        not null default 'pending'
                              check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts        integer     not null default 0,
  last_error      text,
  cost_charged    integer     not null default 0 check (cost_charged >= 0),
  cost_refunded   integer     not null default 0 check (cost_refunded >= 0),
  claimed_at      timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Dequeue index: worker pulls oldest unclaimed pending/processing row.
create index if not exists content_jobs_queue_idx
  on public.content_jobs(status, claimed_at, created_at)
  where status in ('pending', 'processing');

create index if not exists content_jobs_source_idx
  on public.content_jobs(source_id, created_at desc);
create index if not exists content_jobs_workspace_id_idx
  on public.content_jobs(workspace_id, created_at desc);

drop trigger if exists content_jobs_set_updated_at on public.content_jobs;
create trigger content_jobs_set_updated_at
  before update on public.content_jobs
  for each row execute function public.set_updated_at();

alter table public.content_jobs enable row level security;

drop policy if exists "members can read workspace content_jobs" on public.content_jobs;

-- Read-only RLS for app users. The queue must not be mutable from client cookies.
create policy "members can read workspace content_jobs"
  on public.content_jobs for select
  using (workspace_id in (select id from public.workspaces where owner_user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- claim_content_job — atomic dequeue (SECURITY DEFINER for the cron worker)
-- -----------------------------------------------------------------------------
create or replace function public.claim_content_job()
returns public.content_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  picked public.content_jobs;
begin
  with candidate as (
    select id
    from public.content_jobs
    where status in ('pending', 'processing')
      and claimed_at is null
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.content_jobs job
  set status = 'processing',
      claimed_at = now(),
      started_at = coalesce(job.started_at, now()),
      attempts = job.attempts + 1
  from candidate
  where job.id = candidate.id
  returning job.* into picked;

  return picked;
end;
$$;

-- -----------------------------------------------------------------------------
-- reclaim_stalled_content_jobs — free rows stuck > 6 minutes
-- -----------------------------------------------------------------------------
create or replace function public.reclaim_stalled_content_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  freed integer;
begin
  update public.content_jobs
  set claimed_at = null
  where status = 'processing'
    and claimed_at is not null
    and claimed_at < now() - interval '6 minutes';

  get diagnostics freed = row_count;
  return freed;
end;
$$;

-- -----------------------------------------------------------------------------
-- content-sources storage bucket — PRIVATE (no public read)
-- -----------------------------------------------------------------------------
-- Path convention enforced by the upload helper: `{workspaceId}/<uuid>.<ext>`.
-- 25 MB cap matches OpenAI speech-to-text limits (CONTENT_SOURCE_MAX_BYTES).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-sources',
  'content-sources',
  false,
  26214400, -- 25 MB per file
  array[
    'text/plain', 'text/markdown',
    'application/pdf',
    'audio/mpeg', 'audio/mpga', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
    'audio/wav', 'audio/x-wav', 'audio/webm',
    'video/mp4', 'video/mpeg', 'video/webm'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members can upload content sources"      on storage.objects;
drop policy if exists "members can read their content sources"  on storage.objects;
drop policy if exists "members can update their content sources" on storage.objects;
drop policy if exists "members can delete their content sources" on storage.objects;

create policy "members can upload content sources"
  on storage.objects for insert
  with check (
    bucket_id = 'content-sources'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- Workspace-scoped read ONLY — no public read policy (unlike post-uploads).
create policy "members can read their content sources"
  on storage.objects for select
  using (
    bucket_id = 'content-sources'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can update their content sources"
  on storage.objects for update
  using (
    bucket_id = 'content-sources'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );

create policy "members can delete their content sources"
  on storage.objects for delete
  using (
    bucket_id = 'content-sources'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Extend credit_transactions.reason for the new Content OS cost codes.
-- -----------------------------------------------------------------------------
alter table public.credit_transactions
  drop constraint if exists credit_transactions_reason_check;

alter table public.credit_transactions
  add constraint credit_transactions_reason_check
  check (reason in (
    'initial_grant',
    'monthly_grant',
    'topup',
    'plan_upgrade',
    'influencer_render',
    'post_variant_render',
    'caption_generation',
    'series_plan_generation',
    'storyboard_generation',
    'storyboard_shot_render',
    'storyboard_video_render',
    'brand_safety_check',
    'comment_reply_draft',
    'dm_triage',
    'source_extraction_text',
    'source_transcription',
    'content_repackage',
    'pack_media_render',
    'refund',
    'admin_adjustment'
  ));
