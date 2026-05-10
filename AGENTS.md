<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — theplus-ai-influencer

You are working as a senior engineer on **ThePlus.AI Influencer**, a SaaS app that:

1. Lets a brand define an **AI influencer persona** (name, niche, body, vibe).
2. Generates cinematic visuals via **Luma** (`lumaai` SDK).
3. Composes platform-targeted posts (caption, format, scene, props, CTA).
4. Schedules cross-platform via **Zenio** (Instagram / TikTok / YouTube / X).

Auth + DB = **Supabase**. Billing = **Stripe**. UI = **Next.js 16 App Router** + Tailwind 4.

## Operating rules

- Fix root causes, not symptoms.
- Keep diffs minimal and scoped to the requested behavior.
- Centralize shared logic. Do not duplicate behavior across call sites.
- Don't add speculative abstractions or comments to untouched code.
- Don't read or print secrets from `.env*`, Supabase service keys, Stripe keys, Luma keys, or Zenio tokens unless the user explicitly asks for a security audit.
- Never commit `.env*` files (only `.env.example`).
- Server-only modules (`src/lib/{stripe,zenio,luma}.ts`, `src/lib/supabase/server.ts`, `src/lib/env.ts`'s `serverEnv`) must never be imported from a client component.
- Treat Luma + Zenio as paid APIs: keep usage explicit, log requests, never burn credits in tests.

## Local state discipline

- The worktree may already contain user changes. Never revert changes you did not make.
- Check `git status --short --branch` before edits and before final reporting.
- Stage specific files only. Never use `git add .`.
- Don't amend commits, force-push, reset hard, or run destructive filesystem operations without explicit current-prompt permission.
- Use imperative commit messages that explain why.

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

The pre-push hook runs `typecheck` + `lint` + `test`. Don't `--no-verify`.

## Verification

- For UI changes: run `pnpm dev`, click through the affected route in a browser. "It compiles" is not "it works".
- For API/server changes: write a vitest spec or hit the endpoint with `curl` and quote the response.
- For Luma/Zenio/Stripe integrations: mock the SDK at the boundary in tests; only hit the real API behind an explicit env flag.

## Communication

- Lead with the action or finding.
- Be concise. State uncertainty directly instead of guessing.
- When the user says "GO", execute without asking for confirmation.
- Don't summarize obvious diffs.
