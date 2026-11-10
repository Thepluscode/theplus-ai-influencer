# Parking lot

Discovered, not authorised. Nothing here is the current task — `ACTIVE_WORK.yaml`
decides that, and discovery is not authorisation.

An entry earns a place by naming **what would make it the task**. An item with no
such condition is an opinion, and belongs in a commit message or nowhere.

The two open pull requests are the active task and are recorded in
`ACTIVE_WORK.yaml`, not here.

---

## P1 — resolved 2026-09-23

`src/lib/stripe.ts` held the Stripe secret key without `import 'server-only'`. Founder-approved fix
on 2026-09-23: the guard is now its first line. Before the fix the module had **zero importers** on
`main`, `origin/main` and the feature branch (every caller uses `@/lib/billing/stripe`, which already
had the guard), so nothing leaked. The guard stops a future client import at build time.
Verified by `pnpm typecheck` and `pnpm test`, installed from the frozen lockfile with scripts disabled. Vitest
stubs `server-only`, so the tests show no regression; they do not show that the guard blocks a client import.

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
