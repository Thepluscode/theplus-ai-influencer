# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Operating doctrine

The full operating rules — root-cause fixes, minimal diffs, no speculative abstractions, secret-handling, communication style — live in `AGENTS.md`. Read it first. `AGENTS.md` opens with a hard warning that this is **Next.js 16** and several App Router conventions / APIs differ from older releases — consult `node_modules/next/dist/docs/` before writing anything that depends on Next behaviour. Product / design / roadmap / sales context lives in `STRATEGY.md`, `DESIGN.md`, `BUILD_PLAN.md`, and `SCRIPT.md` — consult those before changing UX or scope, not as a substitute for reading code.

## Stack

`theplus-ai-influencer` is a single-app **Next.js 16** project (App Router, React 19, TypeScript strict, Tailwind 4). pnpm + Node ≥22. Default dev port is **3002** (3000 is reserved for the sibling `theplus-ai` project locally). `dev` uses the webpack builder; `pnpm dev:turbo` is available if you need Turbopack.

## Repository shape

```
src/
├── app/
│   ├── (marketing)/       # public landing
│   ├── (auth)/            # sign-in / sign-up
│   ├── (app)/             # authenticated surface
│   │   ├── dashboard/  studio/         create-post/  calendar/  accounts/
│   │   ├── storyboard/ content-engine/ series/       trends/    analytics/
│   │   ├── agents/     comments/       inbox/        safety/    settings/
│   ├── auth/callback/     # OAuth return (excluded from middleware matcher)
│   ├── p/                 # public share pages (post share tokens, review links)
│   └── api/
│       ├── stripe/webhook          # Stripe events → credit ledger
│       ├── webhooks/zernio         # Zernio comment/DM inbound (HMAC-signed)
│       └── jobs/storyboard-animate # cron worker, gated by CRON_SECRET
├── components/{layout,credits,posts,ui}/
├── lib/                   # see below
├── test/server-only-stub.ts        # makes `server-only` importable from vitest
└── types/
```

Many `(app)/<route>` directories follow the same pattern: `page.tsx` (server component), `actions.ts` (server actions), and sometimes `[id]/` and `new/` subroutes. When adding a route, mirror that shape unless you have a reason not to. `content-engine/` is the current surface for the planner (the older `series/` route still exists from the Series → Content Engine rename — check both before renaming or moving code between them).

## `src/lib/` map

- **Boundaries** — `env.ts` (Zod-validated `serverEnv` + `publicEnv`), `utils.ts` (`cn()`), `auth-redirect.ts`, `workspace.ts`, `demo-mode.ts`.
- **Supabase** — `supabase/{client,server,admin,middleware,types}.ts`. `client` is browser-safe; everything else is server-only.
- **Server-only SDK clients** — `luma.ts`, `luma-stub.ts`, `luma-influencer.ts`, `luma-post.ts`, `zernio.ts`, `stripe.ts`, `billing/{plans,stripe}.ts`. The `*-stub.ts` modules are the deterministic fakes used when `LUMA_STUB=1` / `OPENAI_STUB=1`.
- **Domain modules** — `ai-models.ts`, `posts.ts`, `credits.ts`, `captions.ts`, `social-accounts.ts`, `carousel-assets.ts`, `comments-engine.ts`, `dm-engine.ts`, `content-plans.ts`, `content-plan-review-links.ts`, `series-planner.ts`, `storyboard.ts`, `storyboards.ts`, `storyboard-jobs.ts`, `trends/catalog.ts`.
- **Safety / governance** — `brand-safety.ts` + `publish-safety.ts` (the publish gate), `review-comments.ts`, `review-approvals.ts`, `workspace-controls.ts` (+ their `*-schema.ts` Zod modules).
- **Inbound + agents** — `workspace-webhooks.ts`, `zernio-webhooks.ts` (HMAC verification + dedupe for `/api/webhooks/zernio`), `creative-agent-runs.ts` (+ `creative-agents-schema.ts`).

Anything that imports `server-only`, an SDK secret key, or `supabase/server.ts` is server-only and must never be reachable from a `'use client'` tree (would leak the secret into the bundle).

## External services & env

All env access funnels through `src/lib/env.ts`. Don't `process.env.X` directly in app code — add the key to the Zod schema and import `serverEnv` / `publicEnv`.

- **Supabase** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — auth + Postgres + storage. SQL migrations live in `supabase/migrations/` (currently `0001` → `0016_zernio_inbox.sql`). Apply via the Supabase SQL editor in numeric order; switch to the Supabase CLI once schema churn justifies it.
- **Luma** `lumaai` SDK (`LUMA_API_KEY`) — image / video generation. **Paid.** `LUMA_STUB=1` returns placeholder assets so you can exercise the full UI / DB / Zernio flow without burning credits.
- **OpenAI** (`OPENAI_API_KEY`, `OPENAI_CAPTION_MODEL` defaults to `gpt-4o-mini`) — caption writer + cross-platform reformatter. **Paid.** `OPENAI_STUB=1` returns canned outputs.
- **Zernio** (`ZERNIO_API_KEY`, `ZERNIO_API_BASE_URL` defaults to `https://zernio.com/api/v1`, `ZERNIO_WEBHOOK_SECRET`) — multi-platform social scheduling + OAuth. The webhook secret is the HMAC-SHA256 key Zernio signs inbound comment/DM events with (`X-Zernio-Signature`); `/api/webhooks/zernio` rejects events when it's unset. Docs: `https://docs.zernio.com`.
- **Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, plus `STRIPE_PRICE_{PRO,STUDIO,AGENCY,TOPUP}`) — subscriptions + credit topups. Webhook handler at `app/api/stripe/webhook`.
- **CRON_SECRET** — required in prod to authenticate `/api/jobs/storyboard-animate`. In dev, the route also accepts the service-role key as a bearer token so you can `curl` it locally.
- **`THEPLUS_DEMO_MODE=1`** — short-circuits paid integrations and forces deterministic fakes throughout the UI; pair with `LUMA_STUB=1` / `OPENAI_STUB=1` for a fully offline demo (see `lib/demo-mode.ts`). The Zernio publish path still hits real connected accounts even in demo mode — gate any live demo carefully.
- **`NEXT_PUBLIC_APP_URL`** — used by anything that builds absolute URLs (Stripe redirects, OAuth, share links). Defaults to `http://localhost:3002`.

The app boots with zero secrets; features that need a missing key throw on first call rather than at startup.

## Commands

```bash
pnpm dev               # Next on http://localhost:3002
pnpm build
pnpm lint
pnpm typecheck
pnpm test              # vitest run
pnpm test:watch
pnpm format / format:check
```

Single-test invocation:

```bash
pnpm exec vitest run src/lib/__tests__/utils.test.ts
pnpm exec vitest run -t "test name"
```

`.husky/pre-push` runs `typecheck` + `lint` + `test` before every push. Don't `--no-verify` without permission. `@playwright/test` is installed for end-to-end browser flows but there is no Playwright config or `e2e/` directory yet — vitest (jsdom) is still the only wired-up test runner. **There is intentionally no remote CI** (GitHub Actions is unavailable on this account); pre-push is the only enforced gate, so do not bypass it.

## Conventions worth knowing

- **Zod at every boundary.** Server actions, route handlers, env, and external API responses are validated with Zod. Don't trust shapes you didn't parse.
- **Server-action pattern.** Most mutations live in `actions.ts` colocated with the route. Server actions return typed `{ ok, ... } | { ok: false, error }` shapes — never `{ success: true }` on failure.
- **Publish gate.** Anything that schedules or publishes a post must go through `publish-safety.ts` / `brand-safety.ts` first — don't push posts straight to `zernio.ts`, or you bypass the safety scoring.
- **`server-only` discipline.** Any module that imports an SDK secret or `supabase/server.ts` must import `'server-only'` at the top so accidental client imports fail at build time. Vitest aliases `server-only` to `src/test/server-only-stub.ts` (see `vitest.config.ts`) so these modules remain unit-testable.
- **Path alias.** `@/*` → `src/*` (in both `tsconfig.json` and `vitest.config.ts`).
- **Auth enforcement.** There is **no** Next.js middleware in this project — auth is enforced inside `src/app/(app)/layout.tsx`, which calls `getSupabaseServerClient().auth.getUser()` and `redirect('/sign-in')` on miss. In demo mode the layout substitutes `DEMO_USER_EMAIL` and skips the Supabase check.
- **Demo-mode hard block.** `getZernioClient().createPost / deletePost / replyToComment / sendDmReply` throw `DemoModeBlockedError` when `isDemoMode()` returns true, before any network call. This is defense in depth — most actions also short-circuit at the route level. Don't catch and swallow `DemoModeBlockedError`; let it surface so demos fail loud rather than silently posting to a real connected account.

## Verification before reporting done

- UI changes: exercise the change in a browser at `http://localhost:3002`.
- Server / SDK integration: mock at the SDK boundary in vitest. Only hit the real Luma / OpenAI / Zernio / Stripe API behind the explicit `*_STUB=0` env or a deliberate manual test — those are paid endpoints.
- Cron worker (`/api/jobs/storyboard-animate`): `curl` it locally with `Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY` and quote the response.
- "Build succeeded" ≠ "feature works." If verification can't run (missing env / service down), state explicitly which command was attempted and what blocked it.

## False green — checks that pass while proving nothing

Every rule below is a mistake actually made in this repo, not a hypothetical.
The failure mode is always the same: something reported success, and the success
was empty. Assume a green result is lying until it has a control.

- **`$?` after a pipe is the last command's status, not the one you care about.**
  `python3 x.py | tail -5; echo $?` reports `tail`'s exit code, so a script that
  exited 7 prints `0`. Two mistakes in this repo were caused by exactly this.
  **The shell here is zsh**, so the fix is `set -o pipefail`, or don't pipe when
  the exit code is the evidence (`cmd > /tmp/out; rc=$?; tail /tmp/out`).
  `${PIPESTATUS[0]}` is bash-only — in zsh it expands to the empty string with no
  error, which is worse than wrong. zsh's own array is `$pipestatus[1]`
  (lowercase, 1-indexed) and is clobbered by the very next command, so it must be
  captured on the same line. Verified in this environment, not assumed.
- **A command can exit 0 having done nothing.** `railway up` returned 0 while its
  entire output was `Unauthorized. Please run railway login again.` — no deploy
  happened, and the site still served 200 from the *old* build. Read what a
  command printed; never infer success from its exit code alone.
- **An assertion count below what you expected is a FAILED run.** A status linter
  reported `0 entries, 0 ok, 0 failed`, exit 0 — it matched a `Status` column and
  this repo's tracker said `State`. Every scanner and probe must assert a minimum
  number of things found before asserting that they passed.
- **An isolation check needs its positive twin.** "B cannot read A's data" proves
  nothing if the route denies everyone, and "the marker is absent" proves nothing
  if it was never stored. Assert the allowed case works and the marker exists.
  See `scripts/probes/` for the shape.
- **Prove a guard fails.** After writing a test or gate, break the code it
  protects and confirm it goes red. A gate never observed failing is decoration.

## Environment truths that produce convincing wrong answers

- **A paused Supabase project returns EMPTY result sets without erroring** while
  status is `COMING_UP`. A `pg_proc` query came back `[]` and nearly became
  "migration 0006 was never applied." Check `get_project(id).status` is
  `ACTIVE_HEALTHY` before trusting any empty result.
- **A 307 to `/sign-in` is NOT proof the auth gate works.** A paused database
  produces exactly the same redirect: `getUser()` fails, no user, redirect. Prove
  auth with a real session that reaches `/dashboard`.
- **`credit_transactions.id` is a uuid, not a sequence.** `order by id desc` returns
  an arbitrary row. Order by `created_at`, or key on the `ref_id` you just wrote.
- **A fixture that bypasses the ledger makes a reconciliation check meaningless.**
  A test simulated a spend with a raw `UPDATE workspaces SET credits`, so
  `opening + sum(deltas)` could never balance. Fixtures must move money the same
  way production does.

## Claims and their evidence

- **Do not report an advisor warning as a defect without testing reachability.**
  `bootstrap_workspace_for_user` and `rls_auto_enable` were called "the same class
  as the anon credit hole"; both are trigger/event-trigger functions that PostgREST
  cannot invoke at all (404 / 400). Try the exploit before naming it one.
- **Verify a migration over the state it will actually meet.** A fresh schema makes
  `DROP FUNCTION` a no-op and hides overload and grant problems. Replay it against
  the prior migration's output too.
- **Coverage: line % is not statement %, branch % or function %.** Thresholds
  derived from the line figure failed on all three others. Read each metric.
- **Pin test tooling to one version.** `@vitest/coverage-v8` installed against a
  different `vitest` printed "Running mixed versions is not supported" and caused
  one pre-push to fail and an identical re-run to pass — the intermittent failure
  that teaches people to just push again.
