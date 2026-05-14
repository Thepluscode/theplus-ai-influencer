# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Operating doctrine

The full operating rules — root-cause fixes, minimal diffs, no speculative abstractions, secret-handling, communication style — live in `AGENTS.md`. Read it first. Product / design / roadmap context lives in `STRATEGY.md`, `DESIGN.md`, and `BUILD_PLAN.md` — consult those before changing UX or scope, not as a substitute for reading code.

## Stack

`theplus-ai-influencer` is a single-app **Next.js 16** project (App Router, React 19, TypeScript strict, Tailwind 4). pnpm + Node ≥22. Default dev port is **3002** (3000 is reserved for the sibling `theplus-ai` project locally).

## Repository shape

```
src/
├── middleware.ts          # runs Supabase session refresh on every request
├── app/
│   ├── (marketing)/       # public landing
│   ├── (auth)/            # sign-in / sign-up
│   ├── (app)/             # authenticated surface
│   │   ├── dashboard/  studio/  create-post/  calendar/  accounts/
│   │   ├── storyboard/ series/  trends/       analytics/
│   │   ├── comments/   inbox/   safety/       settings/
│   ├── auth/callback/     # OAuth return (excluded from middleware matcher)
│   └── api/
│       ├── stripe/webhook         # Stripe events → credit ledger
│       └── jobs/storyboard-animate # cron worker, gated by CRON_SECRET
├── components/{layout,credits,posts,ui}/
├── lib/                   # see below
├── test/server-only-stub.ts        # makes `server-only` importable from vitest
└── types/
```

Many `(app)/<route>` directories follow the same pattern: `page.tsx` (server component), `actions.ts` (server actions), and sometimes `[id]/` and `new/` subroutes. When adding a route, mirror that shape unless you have a reason not to.

## `src/lib/` map

- **Boundaries** — `env.ts` (Zod-validated `serverEnv` + `publicEnv`), `utils.ts` (`cn()`), `auth-redirect.ts`, `workspace.ts`.
- **Supabase** — `supabase/{client,server,admin,middleware,types}.ts`. `client` is browser-safe; everything else is server-only.
- **Server-only SDK clients** — `luma.ts`, `luma-stub.ts`, `luma-influencer.ts`, `luma-post.ts`, `zernio.ts`, `stripe.ts`, `billing/{plans,stripe}.ts`. The `*-stub.ts` modules are the deterministic fakes used when `LUMA_STUB=1` / `OPENAI_STUB=1`.
- **Domain modules** — `ai-models.ts`, `posts.ts`, `credits.ts`, `captions.ts`, `comments-engine.ts`, `dm-engine.ts`, `content-plans.ts`, `series-planner.ts`, `storyboard.ts`, `storyboards.ts`, `storyboard-jobs.ts`, `brand-safety.ts`, `trends/catalog.ts`.

Anything that imports `server-only`, an SDK secret key, or `supabase/server.ts` is server-only and must never be reachable from a `'use client'` tree (would leak the secret into the bundle).

## External services & env

All env access funnels through `src/lib/env.ts`. Don't `process.env.X` directly in app code — add the key to the Zod schema and import `serverEnv` / `publicEnv`.

- **Supabase** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — auth + Postgres + storage. SQL migrations live in `supabase/migrations/`. Apply via the Supabase SQL editor for now; switch to the Supabase CLI once schema churn justifies it.
- **Luma** `lumaai` SDK (`LUMA_API_KEY`) — image / video generation. **Paid.** `LUMA_STUB=1` returns placeholder assets so you can exercise the full UI / DB / Zernio flow without burning credits.
- **OpenAI** (`OPENAI_API_KEY`, `OPENAI_CAPTION_MODEL` defaults to `gpt-4o-mini`) — caption writer + cross-platform reformatter. **Paid.** `OPENAI_STUB=1` returns canned outputs.
- **Zernio** (`ZERNIO_API_KEY`, `ZERNIO_API_BASE_URL` defaults to `https://zernio.com/api/v1`) — multi-platform social scheduling + OAuth. Docs: `https://docs.zernio.com`.
- **Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, plus `STRIPE_PRICE_{PRO,STUDIO,AGENCY,TOPUP}`) — subscriptions + credit topups. Webhook handler at `app/api/stripe/webhook`.
- **CRON_SECRET** — required in prod to authenticate `/api/jobs/storyboard-animate`. In dev, the route also accepts the service-role key as a bearer token so you can `curl` it locally.
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

`.husky/pre-push` runs `typecheck` + `lint` + `test` before every push. Don't `--no-verify` without permission.

## Conventions worth knowing

- **Zod at every boundary.** Server actions, route handlers, env, and external API responses are validated with Zod. Don't trust shapes you didn't parse.
- **Server-action pattern.** Most mutations live in `actions.ts` colocated with the route. Server actions return typed `{ ok, ... } | { ok: false, error }` shapes — never `{ success: true }` on failure.
- **`server-only` discipline.** Any module that imports an SDK secret or `supabase/server.ts` must import `'server-only'` at the top so accidental client imports fail at build time. Vitest aliases `server-only` to `src/test/server-only-stub.ts` (see `vitest.config.ts`) so these modules remain unit-testable.
- **Path alias.** `@/*` → `src/*` (in both `tsconfig.json` and `vitest.config.ts`).
- **Middleware.** `src/middleware.ts` refreshes the Supabase session on every non-static request. `auth/callback` is intentionally excluded — don't add it back.

## Verification before reporting done

- UI changes: exercise the change in a browser at `http://localhost:3002`.
- Server / SDK integration: mock at the SDK boundary in vitest. Only hit the real Luma / OpenAI / Zernio / Stripe API behind the explicit `*_STUB=0` env or a deliberate manual test — those are paid endpoints.
- Cron worker (`/api/jobs/storyboard-animate`): `curl` it locally with `Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY` and quote the response.
- "Build succeeded" ≠ "feature works." If verification can't run (missing env / service down), state explicitly which command was attempted and what blocked it.
