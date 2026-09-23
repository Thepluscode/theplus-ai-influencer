# Parking lot

Discovered, not authorised. Nothing here is the current task — `ACTIVE_WORK.yaml`
decides that, and discovery is not authorisation.

An entry earns a place by naming **what would make it the task**. An item with no
such condition is an opinion, and belongs in a commit message or nowhere.

The two open pull requests are the active task and are recorded in
`ACTIVE_WORK.yaml`, not here.

---

## P1 — found, verified, and deliberately NOT fixed

### `src/lib/stripe.ts` omits `server-only` while holding the Stripe secret key

It calls `new Stripe(serverEnv.STRIPE_SECRET_KEY, …)` and does not
`import 'server-only'`. Its sibling `src/lib/billing/stripe.ts` does declare it.

`CLAUDE-OPERATING.md` states the rule in this repository's own words: *any module
that imports an SDK secret or `supabase/server.ts` must import `'server-only'` at
the top so accidental client imports fail at build time.* This module is exactly
that case and is the exception.

**Nothing is leaking today.** Every importer of `@/lib/stripe` was checked and
all of them are server files — no `'use client'` tree reaches it. The guard's
purpose is to make a *future* accidental import fail at build instead of shipping
the key into the browser bundle, so its absence is invisible until the day it
matters.

**Why it was not fixed here**, having been written and then reverted: the fix is
one line, but **dependencies are not installed anywhere in this workspace**, so
neither `pnpm typecheck` nor `pnpm test` could be run against it. This project
has **no remote CI** — `.husky/pre-push` is the only gate — so an unverified
one-line change to a module in the Stripe path would have shipped with nothing
at all having checked it. `src/lib/billing/plans.ts` also imports `serverEnv`,
but only for `STRIPE_PRICE_*` identifiers, which are not secrets; it was left
alone.

**Becomes the task when:** someone has `pnpm install` run. Add
`import 'server-only';` as the first line, run typecheck and tests, then add
`stripe.ts` to the named list in `scripts/check_continuity.py` and delete the
check that records this gap.

---

## P6 — observed while migrating continuity, 2026-09-23

### Two pull requests have been open for weeks, and one carries a security fix

PR #9 since 2026-08-01 with twenty-three commits; PR #8 since 2026-07-22 with
one. Between them: a revoke of a helper grant an earlier migration introduced,
four credits-ledger defect fixes, deployed-truth probes, and a billing
reconciliation sweep for lost Stripe webhooks.

The part that makes this more than a merge backlog: **`main`'s operating file is
29 lines shorter than the branch's.** The verification-traps section — the uuid
primary key that makes `order by id desc` arbitrary, ledger fixtures that must
move money the way production does, the refund that needs a `refId` because the
unique index only fires when both `ref_kind` and `ref_id` are non-null — exists
only on the branch. A session on `main` is missing the warnings written from
this project's own mistakes, which is exactly when it is most likely to repeat
them.

**Becomes the task when:** it already is. `ACTIVE_WORK.yaml` names it.

### `CLAUDE-OPERATING.md` contradicted itself about demo mode, and the code settled it

Line 59 said *"The Zernio publish path still hits real connected accounts even in
demo mode — gate any live demo carefully."* Line 93, in the same file, described
the hard block correctly. `src/lib/zernio.ts:252` calls
`assertNotDemoMode('createPost')` before building the request body, and
`isDemoMode()` additionally fail-closes when `NODE_ENV=production`.

Line 59 described the behaviour before the block was added. Corrected in this
commit against main's own code, not the branch's. Worth recording because the
stale half was the more alarming one: a session reading it would either avoid a
safe demo or, worse, build a workaround around a gate that already works.

**Becomes the task when:** never — but it is the second instruction-file line in
this portfolio found stating something the code had already fixed. The first
cost a duplicate hash chain.

### `@playwright/test` is installed with no config and no `e2e/`

A dependency that does nothing. Not harmful, but it makes the test story look
broader than it is: vitest in jsdom is the only wired-up runner, and the only
enforced gate runs it.

**Becomes the task when:** the open pull requests land and someone wants browser
coverage. Until then, writing e2e against a `main` that is twenty-three commits
behind would be writing them twice.
