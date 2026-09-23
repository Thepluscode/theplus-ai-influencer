# AGENT_CONTEXT — theplus-ai-influencer

The stable charter. What this is, what it may decide, and what it is forbidden to
do. Countable figures live in `PROJECT_STATE.json`; the current task lives in
`ACTIVE_WORK.yaml`; the stack, repository map, env reference and repo-specific
verification traps live in `CLAUDE-OPERATING.md`.

## Mission

An AI influencer content platform: generate persona imagery and video, write and
reformat captions, plan content, and schedule or publish it to real connected
social accounts — with a brand-safety gate in front of anything that goes out.

Single-app Next.js 16, App Router, React 19, TypeScript strict, Tailwind 4,
Supabase for auth and Postgres, pnpm, dev on port 3002.

## It spends money and it posts in public

Two kinds of irreversibility, and both have a gate.

| Authority | The boundary | Where |
|---|---|---|
| Publishing | **Anything that schedules or publishes must go through the brand-safety gate first.** Pushing a post straight to `zernio.ts` bypasses safety scoring entirely. | `publish-safety.ts`, `brand-safety.ts` |
| Demo mode | `createPost`, `deletePost`, `replyToComment` and `sendDmReply` throw `DemoModeBlockedError` **before any network call**. Defence in depth — most actions also short-circuit at the route level. **Never catch and swallow it**: a demo must fail loud rather than silently post to a real connected account. | `zernio.ts`, `demo-mode.ts` |
| Demo mode in production | `isDemoMode()` **fail-closes when `NODE_ENV=production`**, so the flag cannot turn a production deployment into a demo. | `demo-mode.ts` |
| Secrets in the bundle | Any module importing an SDK secret or `supabase/server.ts` **must** `import 'server-only'` at the top, so an accidental client import fails at build time instead of shipping the key to the browser. | convention, enforced by build |
| Env access | **No `process.env.X` in app code.** Everything funnels through the Zod-validated `serverEnv` / `publicEnv`. | `src/lib/env.ts` |
| Inbound webhooks | `/api/webhooks/zernio` verifies an HMAC-SHA256 signature and dedupes; it **rejects events when the secret is unset** rather than trusting them. | `zernio-webhooks.ts` |
| Cron worker | `/api/jobs/storyboard-animate` is gated by `CRON_SECRET` in production. | route handler |
| Auth | **There is no Next.js middleware here.** Auth is enforced inside `(app)/layout.tsx`, which calls `auth.getUser()` and redirects to `/sign-in` on a miss. Do not assume a middleware matcher protects a route. | `src/app/(app)/layout.tsx` |
| Boundaries | **Zod at every boundary** — server actions, route handlers, env, external API responses. Don't trust a shape you did not parse. | throughout |
| Action results | Server actions return `{ ok, ... } \| { ok: false, error }`. **Never `{ success: true }` on failure.** | convention |

## Paid endpoints

Luma and OpenAI both cost money per call. `LUMA_STUB=1` and `OPENAI_STUB=1`
return deterministic fakes so the full UI, database and Zernio flow can be
exercised without burning credits; `THEPLUS_DEMO_MODE=1` short-circuits paid
integrations throughout.

Only hit a real Luma, OpenAI, Zernio or Stripe endpoint behind an explicit
`*_STUB=0` or a deliberate manual test, and say which.

## There is no remote CI

GitHub Actions is unavailable on this account. **`.husky/pre-push` — typecheck,
lint, test — is the only enforced gate in the entire project.** Do not
`--no-verify` without permission; there is nothing behind it to catch what it
misses.

`@playwright/test` is installed but there is no Playwright config and no `e2e/`
directory. Vitest in jsdom is the only wired-up runner.

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm test    # what pre-push runs
pnpm exec vitest run -t "test name"         # a single test
python3 scripts/check_continuity.py
```

UI changes are exercised in a browser at `http://localhost:3002`. Server and SDK
integration is mocked at the SDK boundary. The cron worker is `curl`ed locally
with the service-role key as a bearer token, and the response quoted.

**"Build succeeded" is not "feature works."** If verification cannot run because
env is missing or a service is down, state which command was attempted and what
blocked it.

`CLAUDE-OPERATING.md` carries the repo-specific verification traps — the uuid
primary key that makes `order by id desc` arbitrary, ledger fixtures that must
move money the way production does, and the fact that a `307 → /sign-in` proves
nothing because a paused Supabase produces the identical redirect.

## Where everything else lives

| | |
|---|---|
| Stack, repo map, env, traps, commands | `CLAUDE-OPERATING.md` |
| Operating doctrine, Next.js 16 warning | `AGENTS.md` |
| Current authorised task | `ACTIVE_WORK.yaml` |
| Discovered but unauthorised work | `PARKING_LOT.md` |
| Countable state | `PROJECT_STATE.json` (generated, gitignored) |
| Feature status and evidence | `FEATURE_TRACKER.md` |
| Product, design, roadmap, sales | `STRATEGY.md`, `DESIGN.md`, `BUILD_PLAN.md`, `SCRIPT.md` |
