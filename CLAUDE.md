# Start here

A fresh session reconstructs this project from the repository, never from memory
or from the previous conversation. Six steps, in order.

1. **Verify you are in the canonical repository.**
   `~/projects/ai/theplus-ai-influencer`, remote
   `Thepluscode/theplus-ai-influencer`. Anywhere else: stop.

2. **Check which branch you are on.** Two pull requests have been open for weeks
   and `main` is missing what they carry. `ACTIVE_WORK.yaml` says what.

3. **Read `AGENT_CONTEXT.md`** — mission, the publish and demo-mode gates, and
   the fact that pre-push is the only enforced gate anywhere. Stable.

4. **Read `ACTIVE_WORK.yaml`** — the authorised current task, what is blocked,
   what is parked. This file decides what you work on.

5. **Run preflight and refresh state.** `~/.claude/scripts/preflight .` exits
   non-zero rather than warning. `python3 scripts/project_state.py` writes
   `PROJECT_STATE.json`.

6. **Act only on the task `ACTIVE_WORK.yaml` names.**

The stack, repository map, env reference, commands and the repo-specific
verification traps are in `CLAUDE-OPERATING.md`. `AGENTS.md` carries the
operating doctrine and opens with a hard warning that this is **Next.js 16**,
where several App Router conventions differ from older releases.

## The three rules this file exists to enforce

**Discovery is not authorisation.** The most recently discussed defect, feature
or idea does **not** become the current task. Park it in `PARKING_LOT.md` and
carry on with what `ACTIVE_WORK.yaml` says.

Changing the active task requires `FOUNDER_OVERRIDE`, `CURRENT_TASK_COMPLETED`,
`RELEASE_CONDITION_MET`, or a verified `P0`/`P1` interrupt — and the switch
records its reason. See `~/.claude/rules/rule-precedence.md` §B.

**This app posts in public and spends money.** Everything that schedules or
publishes goes through the brand-safety gate; pushing straight to `zernio.ts`
bypasses it. Demo mode hard-blocks the publish path before any network call —
never catch and swallow `DemoModeBlockedError`, because a demo that fails loud
is the point. Luma and OpenAI are paid per call; use the stubs.

**Pre-push is the only gate that exists.** There is no remote CI on this
account. `.husky/pre-push` runs typecheck, lint and test, and nothing catches
what it misses. Do not `--no-verify` without permission.
