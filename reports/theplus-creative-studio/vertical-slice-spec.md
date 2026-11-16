# Vertical slice — one creator, one 30–60s cinematic short

Status: **specified; partly implemented.** Everything here refers to `origin/main` `edc593d` plus local commit `2c2395f`.

## 1. Objective and acceptance

A creator turns a brief into an approved 30–60s portrait MP4. The same persona appears in at least 3 shots, and the creator can schedule the video through the existing brand-safety gate.

Acceptance (locally demonstrable, `LUMA_STUB=1 OPENAI_STUB=1`):

1. Brief → storyboard with ≥4 shots, rendered against the persona's `character_ref`.
2. Approve → paid render enqueued once. Every failure refunds once, including on retry.
3. Render complete → export job → private MP4. `ffprobe` shows 30–60s at the chosen dimensions.
4. Editing the storyboard after approval invalidates the approval, and export is refused.
5. MP4 → post draft → `publish-safety` evaluation → schedule. In demo mode `DemoModeBlockedError` surfaces and is never swallowed.
6. A second workspace can neither read nor export any of it.

## 2. Architecture decision

**Integrate into the existing storyboard route. No new Creative Studio layer.**

| Option                                                           | Verdict                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Extend `storyboard/` + port the preserved export + one post link | **Accepted.** Brief, persona lock, approval, durable jobs, credits and the publish gate already exist. Three connections are missing |
| New Creative Studio app layer (projects/scenes/assets tables)    | Rejected. It would duplicate storyboards, review decisions, render jobs and the ledger with no demonstrated problem to solve         |

Reuse: `storyboard.ts`, `storyboard-jobs.ts`, `review-approvals.ts`, `credits.ts` (0021 dedupe), `publish-safety.ts` / `brand-safety.ts`, `zernio.ts` demo hard-block, workspace RLS.

## 3. Missing connections, in order

| #   | Connection                                                                                                                                     | Where                                                                                    | Size                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | ~~Render refund collides on retry~~                                                                                                            | **done**, `2c2395f`                                                                      | S                                                                                                                                          |
| 2   | Port the MP4 export onto main: `storyboard-export*.ts`, the export worker, the download route, the panel, `cron-auth.ts`, the env keys, `0029` | `preserve/storyboard-mp4-export-wip`                                                     | L. Must replay `0001`→`0034` + `0029` on scratch Postgres: `0029` redefines `record_storyboard_review_decision` and predates `0032`/`0033` |
| 3   | Reel length: offer 9s clips (4–6 × 9s = 36–54s). Price per clip-second                                                                         | `animateSingleShot` already accepts `5 \| 9`; the job needs the chosen duration; `COSTS` | M, **needs a founder pricing decision**: a 9s clip costs more provider spend                                                               |
| 4   | Export → post draft → existing publish gate                                                                                                    | `posts.ts` + `create-post`                                                               | M                                                                                                                                          |
| 5   | Cost/outcome visibility per storyboard (sum of ledger rows by ref)                                                                             | read-only query over `credit_transactions`                                               | S                                                                                                                                          |

Not built (§8): editor, timeline, scenes table, model marketplace, new billing.

## 4. State transitions

```
storyboard: draft --approve--> approved --edit--> draft   (0029 trigger)
render job: pending -> processing -> completed | failed(refund once, ref=job.id)
            processing --transient, attempts<4--> pending
export job: queued -> rendering -> ready | failed        (pinned to approval_decision_id)
post:       draft --publish-safety pass--> scheduled --Zernio--> published
```

## 5. Contracts

| Contract                                                                    | Status                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `storyboards`, `review_decisions`, `storyboard_render_jobs`                 | existing                                                                  |
| `credit_transactions` ref for renders = `('storyboard_render_job', job.id)` | **extended** (`2c2395f`). Older rows keep `('storyboard', storyboard_id)` |
| `storyboard_export_jobs` + private bucket                                   | new on main. Exists in `0029` (preserved), never on main                  |
| `posts.storyboard_export_id` (nullable)                                     | proposed                                                                  |

## 6. Safety invariants: enforcement points

| Invariant         | Enforced at                                                                                                | Open risk                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity / tenant | RLS `owner_user_id = auth.uid()`; `assert_workspace_owner` in credit RPCs; actions re-check `workspace_id` | `0033` column lock is on main; the cross-user probe was not re-run this session                                                                  |
| Credits           | `consume_credits` / `grant_credits` RPCs, 0021 unique refund ref                                           | **PR #12/`0034` open**: an owner can pre-occupy a refund ref. PR #8 is open, so lost Stripe purchase webhooks are not reconciled                 |
| Async jobs        | SKIP LOCKED claim, 6-minute reclaim, attempt cap 4 (transient errors only)                                 | a Luma output whose save fails is re-rendered (provider charged twice); a job that keeps crashing the worker is reclaimed forever with no refund |
| Publishing        | brand-safety gate; demo hard-block before network                                                          | no storyboard path reaches publishing yet, so there is nothing to bypass                                                                         |

## 7. Phase entry and exit criteria

(The brief's last line asked for these. Read as "make each phase's gates explicit" and applied here.)

| Phase      | Entry                                                   | Exit (evidence required)                                                                            | Status 2026-11-16                                      |
| ---------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| A Baseline | canonical remote + HEAD identified                      | reconciliation doc with cited sources; contradictions listed, not resolved by editing records       | **exited**                                             |
| B Slice    | A exited                                                | accepted architecture, gap list, contracts, acceptance criteria                                     | **exited** (this file)                                 |
| C Safety   | B exited                                                | each invariant has an enforcement point plus a test or probe result; release blockers named         | **blocked**: PR #12/`0034` unmerged, PR #8 conflicting |
| D Build    | C blockers either fixed or scoped away from the slice   | connections 2–5 merged on a branch; typecheck/lint/test green; criteria 1–6 demonstrated with stubs | **in progress**: 1 of 5                                |
| E Pilot    | D exited + P01–P07 evidenced + founder authorises spend | 5 terminal participant outcomes + closure → T01–T08 scorecard → decision                            | **not started**                                        |

## 8. Do not build yet

Nonlinear editor, scene/asset tables, a project-management layer, extra video models, new payment infrastructure, a pilot dashboard, or a JSON-schema validator for a pilot that has not run.

## 9. Recovery outcome (2026-11-16)

**Duration strategy (R3, selected):** more 5s clips at the unchanged per-shot price, not longer clips. The ceiling moves from 6 to 11 shots. The real renderer was run on SYNTHETIC 5s fixtures and the output measured with `ffprobe`: 6 shots → 30.02s, 11 → 55.02s, 12 → 60.02s (rejected: AAC padding pushes it over 60s). A 6-shot reel clears the floor by 21ms, so the pilot brief should ask for ≥7 shots until real Luma clip lengths are measured. Credits at today's prices: 7 shots = 15 + 7×20 + 7×60 = 575; 11 shots = 895. Provider cost per clip is UNKNOWN (not re-verified).

**Retry contract (changed):** a render job's budget counts only claims that did not complete a shot (`attempts − shots_completed − 1`). Four of those fail the job and refund the remaining shots under the job id, before another paid render.

**Worker auth (changed):** `/api/jobs/*` accept only `CRON_SECRET`. The service-role key is no longer a bearer credential.

**Resolving the "local R1 completion" contradiction.** Every R1 gate is defined at local scope: a scratch database, mocked SDKs and fixture media. Production or provider verification is never an R1 gate. It belongs to release readiness, recorded as risks and evidence levels. So R1 can complete without production access, but it cannot complete while any local gate is BLOCKED or NOT_TESTED. Today G04 (PR #8) is BLOCKED and G10 (review) is NOT_TESTED, so R1 is `blocked`. `scripts/validate_creative_studio_report.py` enforces this: a phase marked `completed` with any non-PASS gate is invalid.

| Phase | Status      | Gate results                                                                                              |
| ----- | ----------- | --------------------------------------------------------------------------------------------------------- |
| R0    | completed   | R0-G01 PASS                                                                                               |
| R1    | blocked     | G01–G03, G05–G09 PASS; G04 BLOCKED (PR #8); G10 NOT_TESTED (no review)                                    |
| R2    | in_progress | G01, G02 PASS; G03 BLOCKED (0031 needs pg_cron/Vault); G04 BLOCKED (no local Supabase; docker pulls fail) |
| R3    | completed   | R3-G01 PASS                                                                                               |
| R4    | blocked     | entry fails (R1); G01 PASS (fixture MP4); G02 BLOCKED (full stack)                                        |
| R5    | blocked     | G01 BLOCKED (Codex usage limit); G02 PASS (report validated)                                              |

**Update after GO:** R1-G04 is PASS on PR #14 (lost-webhook replay, mocked Stripe). The only open R1 gate is G10, the independent review, so R1 stays `blocked`.
