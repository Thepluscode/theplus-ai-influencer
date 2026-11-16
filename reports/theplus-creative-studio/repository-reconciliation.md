# Repository reconciliation — ThePlus Creative Studio slice

Inspected 2026-11-16. Every row cites what was read. "documented" means the claim is written down; nobody re-observed it during this run.

## 1. Repository identity

|                  |                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote           | `github.com/Thepluscode/theplus-ai-influencer`                                                                                                                    |
| Canonical state  | `origin/main` = `edc593d` (merge of PR #11, 2026-11-10)                                                                                                           |
| This work        | branch `feat/creative-studio-slice`, worktree `../theplus-ai-influencer-studio`, based on `edc593d`, local only                                                   |
| Primary checkout | `codex/storyboard-mp4-export` at `8deba67`. It is 20 commits behind `origin/main` and has 50 uncommitted entries, last edited 2026-09-27. It was **not modified** |
| Local `main`     | `1a6e303`, 2 ahead of and 41 behind `origin/main` (Verified Engineering contract commits, never pushed)                                                           |

## 2. Source-of-truth order used

The founder's instruction comes first, then `AGENT_CONTEXT.md` and `ACTIVE_WORK.yaml` on `origin/main`, then code and tests on `origin/main`, then git and PR metadata (`gh pr list`). Uncommitted tracker text is lowest. It is recorded here as **documented**, never as verified.

## 3. Pull requests (`gh pr list`, 2026-11-16)

| PR                                  | Prior claim                                 | Observed                                                                                                               | Action                                                                                                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #9 public surfaces + 4 ledger fixes | `ACTIVE_WORK.yaml`: open, blocked on review | **MERGED 2026-11-10T22:37Z**                                                                                           | Mark it landed in `ACTIVE_WORK.yaml`. The founder edits that file, not an agent                                                                                                                                                                               |
| #8 billing reconciliation sweep     | open                                        | **OPEN, `mergeable: CONFLICTING`**, head `5ee606a`, 0 reviews                                                          | Rebase onto `origin/main`. It covers lost _Stripe purchase_ webhooks, not generation spend, so it does not block the render-refund path. It does block any claim that paid top-ups reconcile                                                                  |
| #12 three Codex review findings     | not in `ACTIVE_WORK.yaml`                   | **OPEN, MERGEABLE**, head `fb27326`. Includes migration `0034`, so `consume_credits` stops accepting `reason='refund'` | **Release blocker for `credits_billing`.** Today an owner can occupy the refund-dedupe slot with their own ref (PR-reported; `consume_credits` in `0023` was read and does not restrict `p_reason`). `0034` must also be applied to production by the founder |
| #10, #11                            | —                                           | merged 2026-11-10                                                                                                      | —                                                                                                                                                                                                                                                             |

## 4. `ACTIVE_WORK.yaml` discrepancies (`origin/main`)

1. `active.task` says "land the two open pull requests". One has landed (#9). The other (#8) now conflicts.
2. `blocked[0]` still lists PR #9.
3. PR #12, which carries a MEDIUM security fix, does not appear.
4. This session's task is a **founder override**. The founder pasted the Creative Studio brief, so it is not the authorised `active.task`. The file was not edited.

## 5. Highest-severity finding: production schema that exists in no commit

The uncommitted `FEATURE_TRACKER.md` in the primary checkout (2026-09-27) says migrations `0028`–`0031` were **applied to production**. It also says a storyboard → MP4 export was smoke-tested through a Railway deployment. `git log --all` finds **0 commits** for any of the four migration files. `origin/main` numbers its migrations `0027` → `0032`, which is consistent with those numbers being taken.

- **Before this run** the only copy was an uncommitted working tree.
- **Done:** snapshot into local branch `preserve/storyboard-mp4-export-wip` (`bae1497`). It was built from a temporary index, so the working tree, index and HEAD are unchanged (50 entries before and after). It has not been pushed.
- **UNKNOWN:** whether the build deployed now (after the 2026-11-10 merges) still serves `/api/jobs/storyboard-export`, which the `0031` cron reportedly calls every minute. Production was not probed this run.

## 6. Capability inventory (`origin/main` unless stated)

| Capability                                                             | Evidence level                                                                                                     | Source                                                                         | Gap                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Brief → 3–6 shot script (OpenAI)                                       | implemented                                                                                                        | `src/lib/storyboard.ts:66`, `clampShotCount` 3–6                               | —                                                                                    |
| Persona identity lock per shot (Luma `character_ref`)                  | implemented                                                                                                        | `storyboard.ts:156`                                                            | consistency never measured                                                           |
| Storyboard review decisions (approve/final)                            | implemented                                                                                                        | `review-approvals.ts`, `record_storyboard_review_decision`                     | —                                                                                    |
| Approval required before paid render                                   | implemented                                                                                                        | `actions.ts` animate guard (`review_status`)                                   | —                                                                                    |
| Durable render job: claim, reclaim, bounded retry, proportional refund | implemented, unit-tested this run                                                                                  | `storyboard-animate/route.ts`, `storyboard-jobs.ts`, migrations 0011/0018/0019 | —                                                                                    |
| Render refund dedupe per attempt                                       | **defect fixed this run**, locally_tested (ref reuse reproduced; the DB-side skip is read from 0021, not executed) | commit `2c2395f`; RED→GREEN in `route.test.ts`                                 | not applied anywhere deployed                                                        |
| Clip length                                                            | implemented, **5s only**                                                                                           | worker calls `animateSingleShot` without `durationSeconds`, default 5          | reel = 15–30s. **The 30–60s target is reachable only at exactly 6 shots × 5s = 30s** |
| In-browser sequential reel preview                                     | implemented                                                                                                        | `reel-preview.tsx`                                                             | not a file                                                                           |
| Stitched MP4 export, approval-pinned, private download                 | documented (tracker says VERIFIED 2026-09-27); code exists only in `preserve/storyboard-mp4-export-wip`            | `storyboard-export*.ts`, `0029`                                                | not in git history before today, not on main, not re-verified                        |
| Storyboard/export → scheduled post through brand-safety gate           | **not found**                                                                                                      | no `storyboard` reference in `posts.ts`, `publish-safety.ts`, `create-post/`   | missing connection                                                                   |
| Credits ledger, Stripe webhook idempotency                             | implemented; tracker says VERIFIED for 0021–0026                                                                   | `credits.ts`, FEATURE_TRACKER                                                  | PR #12/`0034` open                                                                   |
| Real Luma render inside the export path                                | unverified                                                                                                         | dirty tracker: "No paid Luma request was made"                                 | provider_verified missing                                                            |

## 7. Recommended corrections (founder decisions, not done here)

1. Update `ACTIVE_WORK.yaml`: #9 landed, add #12, re-state #8 as conflicting.
2. Push `preserve/storyboard-mp4-export-wip`, or port its export subset onto `main` (next engineering task, §D05).
3. Merge #12 and apply `0034` before any paid pilot.
4. Read the deployed host's export route to settle the UNKNOWN in §5.

## 8. Recovery session (2026-11-16, later the same day)

| Item          | Observed                                                                                                                                                       | Evidence          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Refs          | `origin/main` still `edc593d`; slice branch `45ba43d` (local, unpushed); preserve branch `bae1497`                                                             | `git rev-parse`   |
| Preservation  | 60/60 dirty paths byte-identical in `bae1497`. Not in it: `.env.local` (secrets, June, deliberately excluded) and generated husky/next-env files               | `EV-R0-MANIFEST`  |
| PR #12        | still open on GitHub; merged into the slice branch locally (`b48d14b`). Its tracker says `0034` was applied to production on 11 Nov (documented, not observed) | `EV-PR12-MERGE`   |
| PR #8         | cherry-pick conflicts: it moves every webhook handler into `stripe-events.ts`, and `main` rewrote those handlers in `f0bf952`. Not resolved here               | `EV-PR8-TRIAL`    |
| Export        | ported (`87d8dbf`) with `0028`, `0029`, `0031`. `0030` and the outbound-webhook code remain only in `bae1497`                                                  | `EV-PORT`         |
| Share links   | `origin/main` reads shared posts with a direct table SELECT; `0028` removes anonymous SELECT. If `0028` is live, a deploy of `main` breaks share links (R8)    | `EV-PORT`         |
| Deployed host | not probed: the unauthenticated request was denied by the session permission classifier                                                                        | `EV-PROBE-DENIED` |
