# ThePlus.AI Influencer

AI influencer SaaS — define a synthetic persona, generate cinematic visuals with Luma, compose platform-targeted posts, and schedule across Instagram / TikTok / YouTube / X via Zernio. Auth + DB by Supabase, billing by Stripe.

## Stack

- **Next.js 16** App Router, React 19, TypeScript strict
- **Tailwind 4** + Lucide icons
- **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`) — auth + Postgres + storage
- **Luma** (`lumaai`) — AI image / video generation
- **Zernio** (custom HTTP client in `src/lib/zernio.ts`) — multi-platform social scheduling
- **Stripe** — subscriptions + credit system
- **Zod**, **react-hook-form** — schema validation + forms
- **Vitest**, **Testing Library**, **jsdom** — tests
- **Husky** — pre-push hook (`typecheck` + `lint` + `test`)

## Getting started

```bash
# 1. Install deps
pnpm install

# 2. Copy env template, fill in real keys
cp .env.example .env.local
$EDITOR .env.local

# 3. Run dev server (port 3002)
pnpm dev
```

Open <http://localhost:3002>.

## Env vars

See `.env.example`. You'll need accounts on:

- [Supabase](https://supabase.com) — create a project, copy URL + anon key + service-role key
- [Luma Labs](https://lumalabs.ai/dream-machine/api) — generate an API key
- Zernio — sign up and copy the API key + base URL
- [Stripe](https://dashboard.stripe.com/) — copy publishable + secret + webhook secret

The app boots without any of these but features that need them will throw on first call. Wire them in as you build each surface.

## Database setup (Supabase)

After creating your Supabase project, apply the schema:

1. Open the SQL editor in your Supabase dashboard.
2. Paste and run each migration in order:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_posts.sql`
   - `supabase/migrations/0003_zernio_post_id.sql`

This creates:

- `public.workspaces` — one per user, auto-created on signup via trigger.
- `public.ai_models` — saved AI influencer personas with portrait + full-body URLs.
- Row-level security so each user only sees their own workspace's data.
- A `handle_new_user`-style trigger on `auth.users` that bootstraps a default workspace.

When the schema grows beyond two tables, switch to the Supabase CLI for proper migration tracking (`supabase migration new <name>` + `supabase db push`).

## Project structure

See `CLAUDE.md` for the full map.

```
src/
├── app/
│   ├── (marketing)/        # public landing
│   ├── (auth)/             # sign-in, sign-up
│   └── (app)/              # authenticated dashboard, studio, calendar, ...
├── components/
└── lib/                    # env, utils, supabase, luma, zernio, stripe clients
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next dev on port 3002 |
| `pnpm build` | Production build |
| `pnpm start` | Production server (3002) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest run |
| `pnpm test:watch` | Vitest watch |
| `pnpm format` / `format:check` | Prettier |

## Pre-push hook

`.husky/pre-push` runs `typecheck` + `lint` + `test`. Fails fast — don't `--no-verify` without a strong reason.

## Roadmap

1. **Studio** — model creator: name / gender / body / skin / hair / vibe + custom prompt → Luma → portrait + full body.
2. **Create post** — model + platform + format + scene + props + CTA + reference images → Luma → 2 variants.
3. **Calendar** — month/week view, drag to reschedule, in-line draft promotion.
4. **Accounts** — Zernio OAuth-style flow per platform.
5. **Billing** — Stripe checkout + portal + webhooks; credit ledger in Supabase.

Built with [Claude Code](https://claude.ai/code).
