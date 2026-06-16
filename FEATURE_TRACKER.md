# Feature Tracker — theplus-ai-influencer

Lifecycle: `PLANNED → IN PROGRESS → DEPLOYED → VERIFIED`.
Never mark `VERIFIED` without production evidence (logs, API response, observed behavior). "Build succeeded" is not verification.

## Content OS — Extract → Repackage → Distribute

**Status: IN PROGRESS** (code complete + demo-verified; `0017` applied to prod 2026-06-16; no live paid-API run yet).

> **Prod note:** the Supabase project `izfwasxgfdisvlxjlvzs` (eu-west-1) was *paused* and had schema `0001–0016` already applied with real data (5 credit_transactions rows). It was restored to apply `0017`.
>
> **`0018_lock_job_rpcs.sql` applied** (2026-06-16): revoked EXECUTE on `claim_content_job` / `reclaim_stalled_content_jobs` from `public/anon/authenticated`, re-granted to `service_role` only. Verified: svc=true, anon/authenticated=false. (`consume_credits`/`grant_credits` left open to `authenticated` by design.)
>
> **Storyboard cron fixed** (`0019` + `storyboard-jobs.ts`, 2026-06-16): had the same two bugs as the Content OS cron (detached `supabase.rpc`, row-of-NULLs treated as a job) **plus** a missing prod RPC (`reclaim_stalled_storyboard_render_jobs`, never applied from `0011`). `0019` backfills the RPC + locks both storyboard worker RPCs to `service_role`; code fixes mirror the Content OS ones. Verified against prod: `/api/jobs/storyboard-animate` now returns 401 unauth / `{ran:false,"empty queue"}` authed (was 500). +4 regression tests.

Primary `/content-os` workflow: drop a source (paste / txt / md / pdf / audio / video) → extract reusable atoms → repackage into 10 channel-native outputs → approval-gated distribution through the existing posts / brand-safety / Calendar / Zernio path.

| Piece | State | Evidence |
|---|---|---|
| Migration `0017_content_os.sql` (5 tables, private `content-sources` bucket, claim/reclaim RPCs, RLS, credit-reason CHECK extend) | **APPLIED to prod** (project `izfwasxgfdisvlxjlvzs`, 2026-06-16) | verified: 5 tables present, bucket `public=false` @ 25 MB, 2 RPCs, constraint has new reasons; security advisors = WARN only |
| env: `OPENAI_TRANSCRIBE_MODEL`, `CONTENT_SOURCE_MAX_BYTES`; deps: `unpdf@1.6.2`; credits: 4 COSTS + 4 reasons | done | typecheck/lint green |
| Source ingest (client-direct upload to private bucket + `createContentSourceAction`) | done | demo page renders, upload composer wired |
| Extraction (paste/txt/md, PDF via unpdf, audio/video via OpenAI transcribe) + atoms | done | unit tests (stub) pass; **real paid path unrun** |
| Repurpose engine (10 channels, Zod-validated, stub) | done | unit tests pass; valid 10-channel pack |
| Media: OpenAI brief + Luma `photon-1` stills (persona-anchored via `character_ref` when the workspace has an AI model, else model-less) + short-form video (`animateSingleShot`, `ray-flash-2`) for TikTok/Reels/Shorts | done | stub tested (`LUMA_STUB`). Cost = `PACK_MEDIA_RENDER`(60) + `PACK_VIDEO_RENDER`(60) surcharge for short-form. Per-item model **selection UI** (vs auto-using the default model) deferred |
| Approve + schedule (reuse posts / brand-safety gate / Zernio / review links) | done | typecheck green; **live Zernio unrun** |
| Cron `/api/jobs/content-pipeline` (claim/reclaim, dispatch by kind) | done | **curled against prod DB**: 401 unauthorized + `{ran:false,empty queue}` authorized. Fixed 2 runtime bugs found here — detached `supabase.rpc` (lost `this`) and plpgsql row-of-NULLs treated as a job. Regression test added. |
| `/content-os` + `/content-os/[id]` UI + nav (first PRIMARY_NAV item) | done | demo HTTP 200, atoms + pack items + approve render; bad id → 404 |
| Demo fixtures | done | `THEPLUS_DEMO_MODE=1` page renders deterministic source/atoms/pack/jobs |

**Gates:** `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` (145 passing, 26 new) ✅ · `pnpm build` ✅ · demo `/content-os` + detail + regression routes HTTP 200 ✅

**To reach VERIFIED:**
1. ~~Apply `0017_content_os.sql` to prod Supabase; confirm bucket is private.~~ ✅ Done 2026-06-16 (prod project `izfwasxgfdisvlxjlvzs`; bucket `public=false`, RPCs + constraint verified). Schema `0001–0016` was already live. _Still TODO: a runtime check that RLS rejects cross-workspace reads with two real users._
2. Run a real source through extract → repackage with `OPENAI_STUB=0` (PDF text + a small audio transcription; confirm >25 MB fails closed). Run a media job with `LUMA_STUB=0` to confirm real `photon-1` stills render.
3. ~~`curl` `/api/jobs/content-pipeline` for extract/repackage/media ticks against real DB.~~ ✅ Done 2026-06-16 (stubbed AI): seeded a paste source → cron processed extract (7 atoms) → repackage (10 channels) → media (carousel: 3 stub images @ 1:1, `ready_for_approval`); credits debited 360→275 with reasons `source_extraction_text`/`content_repackage`/`pack_media_render` (proves the 0017 constraint live). _Still TODO: a tick with **real** OpenAI + Luma (`*_STUB=0`)._
4. Approve + schedule one social-channel item through live Zernio; confirm brand-safety block keeps a draft editable.
