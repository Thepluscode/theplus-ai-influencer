# Local end-to-end MP4 export — 2026-11-24

**Verdict: PASS (local integration evidence).** Not staging, not production. Build: `feat/finished-shorts` at `7810c52`
(code head `a18cbfc`), `next dev` on :3002.

## Environment (all local; FIXTURE data)

| Piece | What ran |
|---|---|
| Supabase | Supabase CLI 2.98.2 local stack (Postgres 17, GoTrue, PostgREST, Storage, Kong) in a separate colima VM `influencer`; all 35 migrations `0001`–`0035` applied by `supabase start` |
| App | `pnpm dev` with `OPENAI_STUB=1`, `LUMA_STUB=1`, `STORYBOARD_EXPORT_VOICEOVER=1` (stub speech = generated test tone, no paid call) |
| Clips | **FIXTURE**: the repo's `src/test/fixtures/videos/*.mp4` (0.5 s red+audio, green silent, blue+audio) served over https at `clips.localtest.me:8443` with a self-signed cert trusted via `NODE_EXTRA_CA_CERTS`; host added through `STORYBOARD_EXPORT_ALLOWED_CLIP_HOSTS` |
| Storyboard | **FIXTURE** row seeded by SQL (3 shots, captions `Café opens at dawn — €5 off`, `Wait for the reveal 🎬`, `日本語のキャプション`); everything after that went through the UI or HTTP entry points |

## Journey (real entry points)

1. `/sign-up` in a browser → user A created and signed in; workspace row created.
2. Storyboard page → review panel: first save refused (`summary` required, shown on page); with a summary, **Approved** saved → `review_status=approved, review_version=1, approved_at` set.
3. **Render downloadable MP4** → `exportStoryboardAction` queued the job and kicked `/api/jobs/storyboard-export` itself (CRON_SECRET). Worker fetched all 3 clips from the fixture host, logged `caption not burned: characters outside the bundled font { shot: 3 }`, uploaded, completed:
   `status=completed attempts=1 output_bytes=43154 output_duration_ms=1521 720x1280 has_audio=t`.
4. Panel showed **MP4 ready · 720×1280** with **Download MP4** → `GET /api/storyboards/<sb>/exports/<job>/download` as user A:
   `302`, `cache-control: private, no-store`, Location = signed URL on the private `storyboard-exports` bucket → file `200`, **43154 B (= recorded output_bytes)**.
5. ffprobe of the downloaded file: `h264 720x1280` + `aac 48000 Hz 2 ch`, duration 1.521 s. volumedetect mean −12.1 dB / max −8.1 dB (narration present, incl. over the silent green shot).
6. One frame per shot: `local-export-e2e-2026-11-24-frames.png` — shot 1 caption with é and € burned; shot 2 caption burned with the emoji dropped; shot 3 (Japanese) not burned, by design.

## Failure and boundary cases

| Case | Result |
|---|---|
| Download signed out | 401 |
| Download, signed in, unknown job id | 404 |
| User B (live session) downloads user A's export | **404** `{"error":"not found"}` |
| Positive twin: user A (fresh session) same URL | 302 |
| Private bucket object via the public path | 400 |
| Approval without the required summary | refused, status unchanged (`needs_changes`) |

## Not covered here

Real Luma clips; Railway image (ffmpeg/next/og inside the container); production Supabase; Runway clip
persistence against real storage (local Supabase is http, and the export only downloads https clips).

## Defect found (pre-existing, not fixed here)

`stubStoryboardVideo` (`src/lib/luma-stub.ts`) points at `commondatastorage.googleapis.com/gtv-videos-bucket/sample/*.mp4`;
all five sample URLs now return **403** (curl, 2026-11-24). In stub/demo mode, storyboard clips are broken and an
export would fail at clip download. Those samples were also minutes long, which the 105 s worker budget could not render.
