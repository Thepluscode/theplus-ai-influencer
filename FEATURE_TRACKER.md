# Feature Tracker — theplus-ai-influencer

Lifecycle: `PLANNED → IN PROGRESS → DEPLOYED → VERIFIED`, plus `NOT A DEFECT` for an
investigated claim that turned out not to be a bug (it still needs evidence).
Checked by `pnpm lint:tracker` — a status claiming proof beside empty or
hand-waving evidence fails.
Never mark `VERIFIED` without production evidence (logs, API response, observed behavior). "Build succeeded" is not verification.

## Credits ledger — integrity & access control

| Piece | Status | Evidence |
| --- | --- | --- |
| `0025_revoke_authenticated_grant_credits.sql` — self-crediting | VERIFIED (applied 2026-08-02, after the deploy) | 0023 stopped cross-tenant access but not self-crediting: `grant_credits` had to stay callable by `authenticated` because `refundCredits` used the user's session client, and `assert_workspace_owner()` passes for an owner by definition. So any signed-in user could credit their own workspace with any amount (a ceiling is not a fix — a capped attacker loops). `refundCredits` now uses the service-role client, which frees the grant to be revoked. Tests 14 → 16; mutation-checked (routing refunds back through the session client fails 6). **ORDERING held**: deployed first (the running build still refunded via the session client and would have started getting `42501`), then applied. Live-verified by impersonating each caller: owner self-credit DENIED `42501`; owner can still spend (360→358, `consume_credits` grant intact); the service-role refund path the new code uses still works — then rolled back (ledger 4 rows, balance 360, 0 residue). `grant_credits` has also disappeared from the Supabase security advisors, where it previously appeared under both the anon and authenticated `SECURITY DEFINER` warnings. |
| `0026_revoke_assert_workspace_owner.sql` — surface 0023 added | VERIFIED (applied 2026-08-03) | 0023 granted `authenticated` EXECUTE on the new `assert_workspace_owner()` helper. The grant was never needed: the helper is only called via `perform` from inside SECURITY DEFINER functions, so the nested call runs as the function OWNER and the caller's own privilege is irrelevant. Left as-is it was a SECURITY DEFINER function any signed-in user could hit at `/rest/v1/rpc/assert_workspace_owner` (Supabase linter 0029). Applied and live-verified: an authenticated owner can STILL spend (360→358 — proving the nesting works rather than the grant), and a direct call to the helper is denied `42501`; rolled back, ledger 4 rows / balance 360. Cross-user probe re-run after: 8/8. |
| Advisor warnings on `bootstrap_workspace_for_user` / `rls_auto_enable` | NOT A DEFECT (checked 2026-08-03) | Both flagged by the Supabase linter as anon-executable SECURITY DEFINER functions. Neither is reachable: `bootstrap_workspace_for_user` is a TRIGGER function (PostgREST 404, not in the schema cache) and `rls_auto_enable` returns `event_trigger` (PostgREST 400, 'cannot display a value of type event_trigger'). Tested as anon over HTTP. An earlier note in this session called them the same class as the anon credit hole — that was wrong. |
| Ledger unit tests (`src/lib/__tests__/credits.test.ts`) | VERIFIED | Money path had zero tests. 14 covering the debit path, both fail-closed branches (`-1` sentinel and non-numeric balance — neither may read as a successful debit), RPC error → throw, zero-cost short circuit, negative amount, and the reversal path. Mutation-checked: widening the sentinel comparison fails 2, making the refund throw fails 1. Scope is the RPC boundary — DB-owned atomicity/debit=credit are NOT covered and the file says so. |
| `0021_grant_credits_ref_idempotency.sql` — refund idempotency | VERIFIED | `grant_credits` dropped the `ref_kind`/`ref_id` `refundCredits` passed, so every refund row had a null ref and a double refund was indistinguishable from two real ones. Now carried through + a partial unique index on `(workspace_id, ref_kind, ref_id) where reason='refund'`; the credit and its ledger row are one subtransaction, so a `unique_violation` rolls the UPDATE back. **APPLIED to prod** 2026-07-31 (`izfwasxgfdisvlxjlvzs`). Verified live: 360 → 410 on first refund, 410 on identical retry, 1 ledger row, then rolled back (ledger still 4 rows, 0 residue, balance 360). Pre-verified against Postgres 16 in Docker over both a fresh schema (7 scenarios + a closing balance that reconciles to opening + sum(deltas)) and replayed over pre-0021 state (index builds, 1 overload remains, legacy 3-arg call resolves, EXECUTE grant restored). |
| `0022_revoke_public_credit_rpcs.sql` — anon could mint credits | VERIFIED | **CRITICAL, live since 0006.** `CREATE FUNCTION` grants EXECUTE to PUBLIC by default; 0006/0021 granted `authenticated` but never revoked PUBLIC, so `anon` could POST `/rest/v1/rpc/grant_credits` with the public anon key and credit any workspace. Confirmed exploitable 2026-07-31 with `p_amount=0` (returned the function's own `P0001 amount must be positive`, i.e. reached the body). **APPLIED to prod** 2026-07-31. Re-tested with `p_amount=1000000`: `42501 permission denied for function grant_credits`, HTTP 401; same for `consume_credits`. Ledger unchanged (4 rows, balance 360, 0 workspaces with anomalous balances). |
| `0023_credit_rpc_ownership_guard.sql` — cross-tenant credit access | VERIFIED | After 0022, `authenticated` still had EXECUTE and neither RPC checked ownership, so any signed-in user could credit or drain **any** workspace id (signup is free, so the barrier was one email). New `assert_workspace_owner()` mirrors the predicate all 6 RLS policies use (`owner_user_id = auth.uid()`); `service_role` exempted for the Stripe webhook + cron; every other context fails closed. Guard runs *before* amount validation so the error cannot be used to probe which workspace ids exist. Raised as `42501` → HTTP 403. Verified on Postgres 16 in Docker with `auth.uid()`/`auth.role()` emulated via GUCs — 9 cases: owner consumes, cross-tenant grant denied, cross-tenant consume denied, anon denied, unknown context denied, service_role works, 0021 dedup still holds, `-1` sentinel intact, validation still fires; ledger reconciles. **APPLIED to prod** 2026-08-01 and re-verified live by impersonating each caller via `request.jwt.claims`: cross-tenant grant denied, cross-tenant consume denied, owner consume 360→350, service_role grant → 360 — then rolled back (ledger 4 rows, balance 360). |

## Billing — Stripe webhook

| Piece | Status | Evidence |
| --- | --- | --- |
| Live checkout round-trip (test mode) | VERIFIED | Real end-to-end 2026-08-01 via Playwright against the deployed app: password sign-in → `/dashboard`, `/settings` billing rendered live plan data, Upgrade to Pro → `cs_test_a1in5f…` on account "The_plus", card `4242…4242` → paid → webhook → Supabase showed `plan=pro`, `credits=2500`, customer + subscription ids set. The `?billing=success` redirect is Stripe's return URL and proves nothing; the DB row is the evidence. Test user + subscription cleaned up afterwards (0 orphans, ledger back to 4 rows). **This run surfaced the two bugs below** — nothing short of a live checkout would have. |
| `plan_renews_at` always null | VERIFIED | `route.ts:228` read `sub.current_period_end`, which Stripe moved onto `sub.items.data[0]`. Proven against the live subscription: top-level absent, `items.data[0].current_period_end = 1788279664`. A type cast had silenced the error rather than prompting a check — the type was right. Now reads the item with a legacy fallback. Test asserts the exact ISO timestamp; mutation-checked (reverting to top-level-only fails it). |
| `0024_apply_plan_credits.sql` — subscription credits left no ledger row | VERIFIED | The live upgrade moved 360 → 2500 with `credit_transactions` **empty**: lines 237/256/283/328 wrote `credits` directly. Switching to `grant_credits` would reintroduce the additive double-grant on replay, so the fix keeps the absolute write and derives the delta in one statement — a replay moves nothing and records nothing. `SELECT … FOR UPDATE` serialises concurrent events. service_role only, and guarded in-function rather than by GRANT alone (a test caught that ownership was the wrong predicate — an owner setting their own balance is exactly what it must refuse). Verified on Postgres 16 across 8 cases incl. replay-writes-nothing, negative delta on downgrade, null-plan leaves the tier alone, both guard and GRANT layers, and a closing reconciliation of 360 == 360. **APPLIED to prod** 2026-08-01, live-verified: 360 → 2500, replay 2500, exactly 1 new row, delta 2140, balance_after 2500, reason `plan_upgrade` — then rolled back (4 rows, balance 360, plan free). 4 new route tests, both fixes mutation-checked. |
| Zernio inbound webhook (comments + DMs) | VERIFIED (2026-08-03) | The deployed route answered `503 Zernio webhook not configured` — found by the error-paths probe, not by a test. Cause: Zernio does NOT generate a signing secret (unlike Stripe); `secret` is a field the caller supplies on `PUT /v1/webhooks/settings`, and the webhook had been created with it blank. Generated a 32-byte hex secret, set it on Railway FIRST (so the app could verify before Zernio began signing), waited for the container to pick it up (`503`→`401`), then set the identical value on the Zernio webhook; re-read the API and confirmed both sides match (64 chars). Live-verified against the deployed endpoint: correctly-signed request → `200 {ok:true, ignored event}`; signature from a different key → `401`; and a signature valid for the ORIGINAL body with the body then tampered → `401`, which proves the HMAC covers the raw payload rather than merely being present. Probe re-run after: 9/9, 0 failed. The secret was never printed to the transcript and the local copy was destroyed. |
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

| Piece | Status | Evidence |
|---|---|---|
| Migration `0017_content_os.sql` (5 tables, private `content-sources` bucket, claim/reclaim RPCs, RLS, credit-reason CHECK extend) | VERIFIED (applied to prod 2026-06-16) | project `izfwasxgfdisvlxjlvzs`; verified: 5 tables present, bucket `public=false` @ 25 MB, 2 RPCs, constraint has new reasons; security advisors = WARN only |
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

## Generate hub — `@handle` mentions + Picture / Edit (`/create`)

Branch `feat/handle-create-hub` (worktree `theplus-ai-influencer-create`), based on `8deba67`. Not committed, pushed or deployed; migration `0032` is not applied anywhere but a scratch database.

| Piece | Status | Evidence |
| ----- | ------ | -------- |
| `@handle` parser (`src/lib/handles.ts`): handle derived from the persona name; emails ignored; an unknown, ambiguous or second persona is refused | IMPLEMENTED | 14 unit tests (`handles.test.ts`) |
| Face lock: the mentioned persona's portrait is sent as `character_ref`, the handle is stripped from the prompt, and Edit sends `modify_image_ref` at weight 1 | IMPLEMENTED | `creations.test.ts` asserts the exact request sent to a mocked Luma SDK. **Real Luma render NOT RUN (paid)** |
| `createAction`: resolve handles → load the edit source by id from the workspace → charge → render → refund on failure (one fresh UUID is the ref for both) → record; a failed record still returns the paid asset; an edit with no mention keeps the source's persona | IMPLEMENTED | 13 action tests. Mutation tests killed all 6: handle check skipped, refund with the wrong ref, source-ownership check skipped, face lock dropped, charge before resolve, edit inheritance removed |
| `0032_creations.sql`: service-role-only writes, owner read/delete under RLS, CHECKs | IMPLEMENTED | Replayed twice on scratch Postgres 17 with Supabase role shims. Owner sees 1 row, other workspace 0, anon 0. Insert/update by an authenticated user is denied; with the grant restored, RLS alone still blocks it. Bad mode, http URL, empty prompt and negative credits are all rejected. **Production NOT APPLIED** |
| `/create` UI: Picture/Edit tabs, `@` autocomplete (keyboard + click), persona chips, 5 shapes, cost on the Generate button, results grid, Edit-from-result, "Use in a post" handoff | IMPLEMENTED | Demo-mode browser run (Playwright): mention resolves to "Face locked to Aria Vance"; Generate shows a 9:16 card; `@nova` is refused with the button disabled; Edit of a result adds an "Edit" card; 390px mobile layout fits after a min-width fix. Real Supabase/Luma session NOT RUN |
| Route protection (`/create` added to `PROTECTED_PREFIXES`) and `force-dynamic` | IMPLEMENTED | Middleware test: signed-out → 307 to `/sign-in?returnTo=%2Fcreate`; signed-in → 200. It goes red when `/create` is removed. Build lists `ƒ /create` |
| Hand-off to `/create-post?creationId=` (server lookup in the workspace; brand-safety gate unchanged) | IMPLEMENTED | Typecheck/build. Browser path NOT RUN (demo results are not stored) |

**Gates (2026-11-10):** `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test:coverage` (the pre-push gate) ✅ · `pnpm build` ✅ · `pnpm lint:tracker` ✅

**Known limits:**
- `creations.asset_url` stores the raw Luma CDN URL, like `posts` does, so it can expire. An old result's thumbnail and its use as an Edit source may stop working until a URL refresh exists.
- Credits are booked as `post_variant_render` (`ref_kind='creation'`). Nothing in `src/` reports by that reason, so no metric is skewed.
- The handle is derived from the persona name. Renaming a persona changes its handle.

**Not built in this slice:**
- Video, which belongs on the existing animate job queue.
- Upscale: the Luma SDK only exposes `upscale_video`, so there is no image upscale.
- Swap, Motion-clone and Recast-a-trend: these put a face into third-party posts and need a rights/consent gate first.

**To reach VERIFIED:**
1. Apply `0032` to production after checking the live migration ledger.
2. Make one real Luma Picture render plus one Edit, and confirm the ledger rows: `post_variant_render` −25 with `ref_kind=creation`, and a refund on a forced failure.
3. Have Codex reproduce the action tests and attack source-id/ownership.

## First-run setup (`/welcome`) + guided tour

Branch `feat/onboarding-tour`, based on `c8c2fc6` (the Generate hub). Not merged or deployed. No migration: answers stay in the browser and only build links, which the receiving pages whitelist-parse.

| Piece | Status | Evidence |
| ----- | ------ | -------- |
| 4-step setup: goal + experience → persona (name, niche, vibe) → plan (platforms, cadence) → honest summary ("nothing generated yet", persona cost from `COSTS.INFLUENCER_RENDER`) with three next steps | IMPLEMENTED | Demo browser run: Continue stays disabled until a name is entered; focus moves to each step heading; a live region announces the step; answers survive a reload (`localStorage`) |
| Prefill hand-offs: `/studio/new?name&niche&vibe` and `/series/new?cadence&platforms`, parsed by `src/lib/onboarding.ts` | IMPLEMENTED | 4 unit tests, including hostile/unknown values dropped and the name capped at 80. Browser: Studio opened with name "Audrey Lane", vibe street and the niche brief; Campaigns opened with 7/week on instagram, tiktok, youtube |
| Guided tour (`?tour=1`, 8 steps): spotlights Studio, Generate, Create, Campaigns, Calendar and Credits; arrow keys, Escape, focus on Next; strips the flag from the URL | IMPLEMENTED | 5 placement tests (right, below, centred fallback, never off a 390px screen). Browser at 1440px and 390px: spotlight and card placed, Escape closes, `?tour=1` removed |
| New sign-ups land on `/welcome` (email-confirm `next=/welcome`); `/welcome` behind auth | IMPLEMENTED | Middleware test: signed-out `/welcome` → 307 sign-in. **Real email sign-up NOT RUN** |

**Gates (2026-11-10):** `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test:coverage` ✅ · `pnpm build` ✅

**Not built:** Eromify's "free starter faces". A shared library of ready-made personas is a separate slice and needs its own rights check on the faces.

## Canvas (`/canvas`) — results as a tree of edits

Branch `feat/creation-canvas`, based on `e0b22f5` (the onboarding branch). Not merged or deployed. No new migration: the tree comes from `creations.source_creation_id`, which `0032` already defines (still **not applied in production**).

| Piece | Status | Evidence |
| ----- | ------ | -------- |
| Layout (`src/lib/canvas.ts`): the tree's depth sets the column; leaves get rows oldest first and a parent sits on its first child's row. An edit whose source isn't loaded becomes a root; cycles and self-references are placed once; the walk is iterative | IMPLEMENTED | 7 unit tests with hard-coded cells: chain, fork, newest-first input, orphan, cycle, a 9-node no-shared-cell check, and a 5,000-node chain |
| `/canvas` page: the same composer and `createAction` as Generate (no second charge path). Each card has a labelled `+` handle on its edge that branches an edit, and edits are drawn as connected cards. Children read "Branched from: …", the edge SVG is `aria-hidden`, and the newest card scrolls into view | IMPLEMENTED | Demo browser run at 1440px and 390px: 2 roots (9:16, 16:9), root 1 branched twice, then a child branched gives 5 cards, 3 edges and 0 overlapping card boxes. The page has no horizontal overflow at either width (the canvas scrolls inside its box). No console errors. At 390px with no assisted scrolling, tapping `+` focuses the prompt on screen, and the new child card lands in view after Apply |
| `CreationView.sourceCreationId` set by `toCreationView`, the demo result and the unsaved fallback | IMPLEMENTED | 2 `toCreationView` tests. The action tests assert `null` for a picture and the source id for an edit; the charge/refund order is unchanged (all action tests green) |
| `/canvas` in `PROTECTED_PREFIXES`, the nav item (and so the top-bar title), `force-dynamic`, and a tour step (now 9 steps) | IMPLEMENTED | Middleware test: signed-out `/canvas` → 307. It goes red when `/canvas` is removed and green when restored. Build lists `ƒ /canvas`. Tour step 4 of 9 spotlights the Canvas nav item at 1440px |
| `/create` after the shared-studio change | IMPLEMENTED | Re-run in the demo browser at 1440px and 390px: Generate plus Edit gives 2 results, the "Editing:" banner shows, and there is no overflow |

**Gates (2026-11-10):** `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test:coverage` 45 files / 297 tests ✅ · `pnpm build` ✅

**Not run:** the tree surviving a reload on the real data path. Demo mode persists nothing; this needs `0032` applied and a real session.

**Known limits:**
- The canvas loads the newest 120 results, so an edit whose source is older is drawn as a root.
- Layout is automatic: there is no drag, pan or zoom.
- Image cards only. Video cards wait for the Video slice.
- In demo mode an edit's placeholder image isn't derived from its source.
