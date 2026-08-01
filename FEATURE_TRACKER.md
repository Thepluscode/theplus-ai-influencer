# Feature Tracker — theplus-ai-influencer

Lifecycle: `PLANNED → IN PROGRESS → DEPLOYED → VERIFIED`.
Never mark `VERIFIED` without production evidence (logs, API response, observed behavior). "Build succeeded" is not verification.

## Credits ledger — integrity & access control

| Piece | State | Evidence |
| --- | --- | --- |
| Ledger unit tests (`src/lib/__tests__/credits.test.ts`) | VERIFIED | Money path had zero tests. 14 covering the debit path, both fail-closed branches (`-1` sentinel and non-numeric balance — neither may read as a successful debit), RPC error → throw, zero-cost short circuit, negative amount, and the reversal path. Mutation-checked: widening the sentinel comparison fails 2, making the refund throw fails 1. Scope is the RPC boundary — DB-owned atomicity/debit=credit are NOT covered and the file says so. |
| `0021_grant_credits_ref_idempotency.sql` — refund idempotency | VERIFIED | `grant_credits` dropped the `ref_kind`/`ref_id` `refundCredits` passed, so every refund row had a null ref and a double refund was indistinguishable from two real ones. Now carried through + a partial unique index on `(workspace_id, ref_kind, ref_id) where reason='refund'`; the credit and its ledger row are one subtransaction, so a `unique_violation` rolls the UPDATE back. **APPLIED to prod** 2026-07-31 (`izfwasxgfdisvlxjlvzs`). Verified live: 360 → 410 on first refund, 410 on identical retry, 1 ledger row, then rolled back (ledger still 4 rows, 0 residue, balance 360). Pre-verified against Postgres 16 in Docker over both a fresh schema (7 scenarios + a closing balance that reconciles to opening + sum(deltas)) and replayed over pre-0021 state (index builds, 1 overload remains, legacy 3-arg call resolves, EXECUTE grant restored). |
| `0022_revoke_public_credit_rpcs.sql` — anon could mint credits | VERIFIED | **CRITICAL, live since 0006.** `CREATE FUNCTION` grants EXECUTE to PUBLIC by default; 0006/0021 granted `authenticated` but never revoked PUBLIC, so `anon` could POST `/rest/v1/rpc/grant_credits` with the public anon key and credit any workspace. Confirmed exploitable 2026-07-31 with `p_amount=0` (returned the function's own `P0001 amount must be positive`, i.e. reached the body). **APPLIED to prod** 2026-07-31. Re-tested with `p_amount=1000000`: `42501 permission denied for function grant_credits`, HTTP 401; same for `consume_credits`. Ledger unchanged (4 rows, balance 360, 0 workspaces with anomalous balances). |
| Ownership check inside the credit RPCs | PLANNED | `authenticated` retains EXECUTE and neither function checks ownership, so any signed-in user can still call `grant_credits` for **any** workspace id. Needs an `auth.uid()` guard inside both functions — a behaviour change, deliberately not bundled into the 0022 revoke. |

## Billing — Stripe webhook

| Piece | State | Evidence |
| --- | --- | --- |
| Railway deploy + Stripe wiring (test mode) | DEPLOYED | Account `acct_1RVJB9IbZh1C3vw0` had zero prices; created 4 matching `plans.ts` (Pro $29/2,500 · Studio $79/8,000 · Agency $199/25,000 · Topup $10/1,000) with plan id + credits in price metadata, and webhook endpoint `we_1TzKF9IbZh1C3vw0na5H4ym7` → the Railway domain on exactly the 7 events `route.ts` handles. Verified against the deployed container: unsigned POST → 400, forged signature → 400 (Stripe verifier), correctly-signed payload → 200 `{"received":true}` — which proves the container holds the *matching* secret, not merely that the var is set. Claim row written then cleaned up; ledger untouched. **Not VERIFIED:** no real checkout has run — that needs sign-in, which is blocked on the Supabase redirect URL. |
| Dispute/chargeback capture (`charge.dispute.*`) | DEPLOYED | `src/app/api/stripe/webhook/route.ts` — the switch ignored `charge.dispute.*`; now `charge.dispute.created` alerts and `charge.dispute.funds_withdrawn` **revokes access** (workspace → Free; customer resolved via `stripe.charges.retrieve`; unresolvable → ERROR, never silently dropped). Idempotency via the existing `processed_webhook_events` claim + absolute-state write. `route.test.ts` 6 passing (+3); `tsc --noEmit` clean. PR #6 (merged). Not production-verified. |
| Reconciliation sweep (lost-webhook self-heal) | PLANNED | Flagged by the dispute-readiness sweep — no scheduled pull-verify of stale-pending payments. Needs a cron / edge function (serverless). Deferred. |

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
