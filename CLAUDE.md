# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Operating doctrine

The full operating rules — root-cause fixes, minimal diffs, no speculative abstractions, secret-handling, communication style — live in `AGENTS.md`. Read it first.

## Repository shape

`theplus-ai-influencer` is a single-app Next.js 16 project (App Router, TypeScript strict, Tailwind 4). pnpm + Node 22.x.

```
src/
├── app/
│   ├── (marketing)/        # public landing
│   ├── (auth)/             # sign-in, sign-up (Supabase auth)
│   └── (app)/              # authenticated dashboard
│       ├── dashboard/
│       ├── studio/         # build AI influencer model (Luma)
│       ├── create-post/    # platform-targeted post composer
│       ├── calendar/       # scheduled posts (Zernio)
│       ├── accounts/       # connected social accounts (Zernio)
│       └── settings/       # profile, billing (Stripe), credits
├── components/
│   ├── layout/             # sidebar, etc.
│   └── ui/                 # primitives (shadcn-style if/when added)
├── lib/
│   ├── env.ts              # Zod-validated env (serverEnv + publicEnv)
│   ├── utils.ts            # cn() helper
│   ├── supabase/{client,server}.ts
│   ├── luma.ts             # server-only Luma client (lumaai SDK)
│   ├── zernio.ts           # server-only Zernio REST client
│   └── stripe.ts           # server-only Stripe client
└── types/
```

## External services (env vars in `.env.example`)

- **Supabase** — auth + Postgres + storage. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Luma** (`lumaai` SDK) — AI image generation. `LUMA_API_KEY`.
- **Zernio** — multi-platform social scheduling (REST + OAuth orchestration). `ZERNIO_API_KEY`, `ZERNIO_API_BASE_URL` (defaults to `https://zernio.com/api/v1`). Docs: `https://docs.zernio.com`.
- **Stripe** — billing + credit system. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

All env access funnels through `src/lib/env.ts` (Zod). Don't `process.env.X` directly in app code; add the key to the schema and import `serverEnv` / `publicEnv`.

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

## Pre-push hook

`.husky/pre-push` runs `typecheck` + `lint` + `test` before every push. Hook is wired via `core.hooksPath = .husky/_` (set automatically by `husky init`).

## Conventions worth knowing

- API responses from server actions / route handlers should be typed and validated with Zod at the boundary.
- Server-only modules (anything in `src/lib/{stripe,zernio,luma}.ts`, `src/lib/supabase/server.ts`) must never be imported from a client component (would leak secrets to the bundle).
- The default port is **3002** (3000 is reserved locally for the sibling `theplus-ai` project).

## Verification before reporting done

- UI changes: exercise the change in a browser at `http://localhost:3002`.
- Server / SDK integration: mock at the SDK boundary in vitest. Only hit the real Luma / Zernio / Stripe API behind an explicit env flag — those are paid endpoints.
- "Build succeeded" ≠ "feature works." If verification can't run (missing env / service down), state explicitly which command was attempted and what blocked it.
