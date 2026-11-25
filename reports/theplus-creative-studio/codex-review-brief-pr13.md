# Codex review brief — PR #13 port (`14f1d48..f8f2627`)

Status: **RUN 2026-11-25** (Codex task `task-mwvwagkm-lbing7`, model gpt-6-astra, session
`01a211f0-f0e0-7d22-bc4f-ba7b079273af`), pinned to `f8f2627`.

| Item | Codex verdict |
|---|---|
| 1 webhook security | FAIL: 3 findings, below |
| 2 migration 0030 / secret isolation | BLOCKED: sandbox Postgres `shmget` denied; static RLS read found no cross-workspace leak |
| 3 port vs `bae1497` | PASS (source comparison) |
| 4 Railpack ffmpeg | BLOCKED at runtime; `railpack.json` syntax correct |
| 5 install/typecheck/lint/test/build | BLOCKED: sandbox had no network, so `pnpm install` failed |

Findings, each reproduced by Codex:
- **HIGH**: `outbound-webhook.ts:89` pinned lookup answered Node's `all: true` call with a
  string, so every hostname delivery failed with `ERR_INVALID_IP_ADDRESS`. Claude reproduced it
  on Node 22.23.4 against a local server. **Production's tree has the identical code.**
- **MEDIUM**: the timeout did not cover DNS; a stalled resolver blocked the caller indefinitely.
- **MEDIUM**: the IPv6 denylist passed `100::1`, `2001:2::1`, `3fff::1` and NAT64.

Fixed in `970f820` + `408eedc` (an allowlist of 2000::/3 minus special ranges, one deadline
covering DNS, connect and response, and a correct pinned lookup). Each fix has a regression test,
and each test was confirmed to fail on its mutation (1, 1 and 3 tests). Pre-push: 378/378.
Re-review round 2 (`task-mwvy0n6l-rqc3wi`) on `408eedc` found two more issues:
- HIGH: the synchronous lookup answer crashed the process on an immediate connect failure.
  Reproduced by Claude on macOS.
- MEDIUM: public NAT64 was rejected.
Both fixed in `bb706ae`. Round 3 (`task-mwvyngg7-k5351c`) on `bb706ae`: **both closed (PASS)**,
with no new implementation regressions. Its one LOW, a test that could hang, was fixed in `5392244`
(test only). Items 2, 4 and 5 of the first review remain BLOCKED in Codex's sandbox (no Postgres,
no network). Merge and deploy stay on hold for the founder.

Run from the main checkout (do not run it inside this worktree):

```sh
cd /Users/theophilusogieva/projects/ai/theplus-ai-influencer
git fetch -q origin && git show origin/feat/creative-studio-slice:reports/theplus-creative-studio/codex-review-brief-pr13.md \
  | sed -n '/^## Brief$/,$p' | tail -n +2 > /tmp/codex-brief.md
node ~/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs \
  task --background --write --fresh --model gpt-6-astra --effort high --prompt-file /tmp/codex-brief.md
```

The review range is pinned to `f8f2627`; this brief's own commit is docs-only and out of scope.

## Brief
Independent, adversarial code review. Report findings only. You must NOT edit tracked files, commit, push, merge, or deploy, and must NOT touch existing worktrees (the main checkout's dirty tree is the live production build source).

Repo: /Users/theophilusogieva/projects/ai/theplus-ai-influencer (Next.js 16 + Supabase). Read AGENTS.md and CLAUDE.md there first.

Target: exact range 14f1d48..f8f2627 on branch feat/creative-studio-slice (PR #13): commits f08510e and f8f2627. Create your own worktree:
  git -C /Users/theophilusogieva/projects/ai/theplus-ai-influencer worktree add --detach /Users/theophilusogieva/projects/ai/theplus-ai-influencer-codex-review3 f8f2627

Context: Railway production runs an uncommitted tree snapshotted as commit bae1497 (branch preserve/storyboard-mp4-export-wip). PR #13 is meant to replace it. These two commits port pieces from bae1497. Do not take the commit messages as true; check them.

Challenge:
1. src/lib/outbound-webhook.ts and src/lib/workspace-webhooks.ts: can the private/reserved-address check be bypassed (DNS rebinding between check and connect, redirects, IPv4-mapped IPv6, decimal/octal IPs, URL credentials)? Is the timestamp+body HMAC verifiable by a receiver? Are timeouts bounded?
2. supabase/migrations/0030_secure_workspace_webhooks.sql: is it safe on a live DB? Can signing_secret reach the browser or another workspace (RLS; src/app/(app)/settings/*; src/lib/workspace-controls.ts)?
3. git diff bae1497 f8f2627: did the port miss anything production has that a deploy would regress, or bring in older code that undoes the branch's fixes? Verify the claim that the storyboard and animate-route differences were deliberately left at the branch's newer versions.
4. Would a Railway/Railpack build of f8f2627 install ffmpeg via railpack.json? Is the export worker's ffmpeg dependency met?
5. In your worktree, run pnpm install --frozen-lockfile, pnpm typecheck, pnpm lint, pnpm test, pnpm build and report exact results. Optionally run scripts/sql/database-boundaries.sql against a scratch Postgres (/opt/homebrew/opt/postgresql@17/bin, TCP 127.0.0.1, no docker).

Output: PASS/FAIL/BLOCKED per item, then findings with severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, a concrete failure scenario and evidence, marking each as reproduced or suspected. Finally delete the worktree's .next and node_modules and run `git worktree remove` on it.
