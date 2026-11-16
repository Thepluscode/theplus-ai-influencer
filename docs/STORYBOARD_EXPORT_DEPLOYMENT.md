# Storyboard MP4 export deployment

The export worker runs in the existing Railway-hosted Next.js service. It uses the existing
Postgres queue pattern, renders in the Node runtime with FFmpeg, uploads the finished file to a
private Supabase bucket, and returns a five-minute signed download only after re-authorizing the
workspace member.

## Release order

1. Run the local gates:

   ```bash
   pnpm test:database-boundaries
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   ```

2. Apply migrations in numeric order. `0028_restrict_shared_post_reads.sql` is a release blocker
   and must be live before the export UI is exposed. `0029_storyboard_exports.sql` creates the job
   queue, approval invalidation, atomic enqueue/complete functions, and private
   `storyboard-exports` bucket. `0030_secure_workspace_webhooks.sql` disables legacy unsigned
   endpoints and requires a signing secret for every new outbound webhook.
   `0031_schedule_worker_routes.sql` enables Supabase Cron/pg_net and drains all three queues once
   per minute using secrets stored in Supabase Vault.

   The current production migration ledger uses timestamp versions while this checkout uses
   numeric versions. Until that ledger is reconciled, do **not** run `supabase db push --linked`: it will
   try to replay earlier migrations. Migrations `0028` through `0031` were applied on 2026-09-27
   with `supabase db query --linked --file <migration>` and then checked with the scripts in
   `scripts/sql/`. Reconcile the full `0001`–`0031` history before the next schema release instead
   of marking versions applied without mapping them to the production history.

3. Re-run the live boundary probe. It provisions and removes two throwaway users, workspaces, and
   one shared post.

   ```bash
   python3 scripts/probes/cross_user.py --env-file .env.local
   ```

   Do not continue if anonymous shared-post enumeration or either credit assertion fails.

4. Deploy the existing Railway service. `railpack.json` installs FFmpeg in the final runtime image.
   Keep `CRON_SECRET`, the Supabase service-role key, and the Luma key server-only. Use a dedicated
   `CRON_SECRET`; worker routes no longer accept the service-role key as a bearer token.
   `STORYBOARD_EXPORT_ALLOWED_CLIP_HOSTS` may contain additional comma-separated exact HTTPS
   hostnames for operator-controlled media mirrors. IP literals, ports, paths, credentials, and
   non-HTTPS destinations remain invalid, and every redirect is revalidated.

5. Before applying `0031`, store the application URL as Vault secret `theplus_app_url` and the same
   dedicated `CRON_SECRET` used by Railway as `theplus_cron_secret`. The server action sends an
   immediate best-effort tick; the scheduler is still required for retries and recovery after
   worker restarts. Each request processes one complete 3–6 shot export and is capped at 105
   seconds inside a 120-second route budget.

   After applying it, run `scripts/sql/scheduler-postflight.sql`. Exactly three active jobs must
   exist, recent `cron.job_run_details` rows must be `succeeded`, pg_net responses must be HTTP 200,
   both Vault names must exist, and only `service_role` may execute the worker invocation function.

6. Recreate any workspace webhooks disabled by `0030` with a recipient-held signing secret of at
   least 32 characters. Recipients verify `x-theplus-signature` as HMAC-SHA256 over
   `<x-theplus-timestamp>.<raw request body>` and reject stale timestamps.

## Production smoke test

1. Animate every shot in one storyboard. Animation changes the shot data and therefore invalidates
   the earlier approval.
2. Approve the fully animated version again.
3. Click **Render downloadable MP4** twice quickly. Both clicks must show the same job and create one
   export row.
4. Observe `queued → rendering → completed`, then download the file.
5. Verify the file with `ffprobe`: MP4/H.264, requested dimensions, expected summed clip duration,
   correct shot order, and an AAC audio track.
6. Attempt the status and download URLs as another workspace member; both must return no resource.
7. Withdraw approval or change a shot, then confirm a new export is blocked until that new version
   is approved.

## Current media behavior

- Source clip audio is preserved and normalized to stereo AAC.
- A silent clip receives silence so mixed silent/audio storyboards concatenate reliably.
- No soundtrack or voiceover mix is added.
- Hook captions are not burned into the MP4.
- If a Luma asset URL expires, the worker resolves a fresh URL from the stored generation ID once.
- Only built-in provider and operator-configured exact hosts are fetchable; redirects are revalidated.
- Temporary and partial local files are removed after every attempt. A failed terminal job removes
  any uploaded object; a retry overwrites the deterministic private path.

## Repeatable production fixture probe

The probe uses the repository's three short videos and does not call Luma, OpenAI, or Zernio. It
creates two throwaway users, a temporary public fixture bucket, one approved storyboard, and two
concurrent enqueue requests. It validates the downloaded MP4 with FFmpeg/ffprobe, checks tenant
denial, and removes the users, database rows, bucket, source clips, and rendered output.

```bash
railway run --service web --environment production --no-local \
  python3 scripts/probes/storyboard_export_live.py
```
