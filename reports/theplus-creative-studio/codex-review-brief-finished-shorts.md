# Codex review brief — `feat/finished-shorts` (`207b06b..45e1319`)

Status: **NOT RUN.** Codex usage limit resets 2026-11-25 08:03. This branch is
stacked on PR #13 (`feat/creative-studio-slice`), which has its own pending brief
(`codex-review-brief-pr13.md`). Nothing here merges or deploys before both reviews.

Run from the main checkout:

```sh
cd /Users/theophilusogieva/projects/ai/theplus-ai-influencer
git fetch -q origin && git show origin/feat/finished-shorts:reports/theplus-creative-studio/codex-review-brief-finished-shorts.md \
  | sed -n '/^## Brief$/,$p' | tail -n +2 > /tmp/codex-brief-shorts.md
node ~/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs \
  task --background --write --fresh --model gpt-6-astra --effort high --prompt-file /tmp/codex-brief-shorts.md
```

## Brief
Independent, adversarial code review. Report findings only. Do NOT edit tracked files, commit, push, merge or deploy, and do NOT touch existing worktrees.

Repo: /Users/theophilusogieva/projects/ai/theplus-ai-influencer (Next.js 16 + Supabase). Read AGENTS.md and CLAUDE.md first.

Target: exact range 207b06b..45e1319 on branch feat/finished-shorts (five code commits: b1cfc03 captions+voiceover in the MP4 export, b60543e Runway as second shot-animation provider, 4ab2579 remote MCP over HTTP with Supabase OAuth, 1c113ab review fixes, 45e1319 Runway clip persistence + migration 0035; the brief-only commits between them change no code). Create your own worktree:
  git -C /Users/theophilusogieva/projects/ai/theplus-ai-influencer worktree add --detach /Users/theophilusogieva/projects/ai/theplus-ai-influencer-codex-review4 45e1319

Challenge:
1. src/lib/storyboard-finishing.ts + storyboard-export.ts: can any caption text reach a network fetch (next/og loads Google Fonts / emoji CDN for glyphs outside its bundled font)? Is OFFLINE_GLYPHS truly offline-safe? Does the ffmpeg graph (overlay, amix normalize=0, apad, -t) produce valid 48 kHz stereo AAC segments the `-c copy` concat accepts, for clips with and without source audio? Can a voice failure ship a voiceless video marked complete?
2. src/lib/runway.ts: verify the request contract against the official @runwayml/sdk types (base URL, X-Runway-Version, ratio/duration values, task statuses). Can a create be issued twice for one shot (retries, worker reclaim)? Is the runway:<id> refresh path in the export correct? persistRunwayClip copies each clip into the `storyboard-clips` bucket (migration 0035): can it throw and trigger a re-create, store a partial/oversized object, or let an authenticated user list or overwrite clips? Is adding our own Supabase host to the export clip allow-list an SSRF widening? Run scripts/sql/database-boundaries.sql (needs Docker or a local Postgres) and report.
3. src/app/api/mcp/route.ts, src/app/.well-known/oauth-protected-resource/[[...resource]]/route.ts, src/app/oauth/consent/*: auth bypasses (missing/forged/expired token, other users' workspaces), Origin handling, rate limits (per IP via X-Forwarded-For — spoofable?), the THEPLUS_MCP_REMOTE switch, consent CSRF / open redirect (redirect_url from Supabase), and whether any service-role key becomes reachable.
4. Run pnpm install --frozen-lockfile, pnpm typecheck, pnpm lint, pnpm test, pnpm build in your worktree and report exact results. Local ffmpeg is Homebrew 8 (no drawtext/libass) — the caption path must not need them.

Output: PASS/FAIL/BLOCKED per item, then findings with severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, concrete failure scenario and evidence, each marked reproduced or suspected. Finally delete the worktree's .next and node_modules and `git worktree remove` it.
