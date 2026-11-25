# Codex review brief — `feat/finished-shorts` (`207b06b..a18cbfc`)

Status: **RUN 2026-11-25** (Codex task `task-mwvwobr8-iwxtp5`, model gpt-6-astra, session
`01a211fa-d112-7f62-8965-35ecc36e8988`), pinned to `a18cbfc`. Codex verdict: **NOT DEMO-READY**.

| Item | Codex verdict |
|---|---|
| 1 captions, audio, voice failure | PASS: 346 glyphs rendered with zero network requests; real ffmpeg 8.1.2 concat gave 48 kHz stereo AAC |
| 2 Runway + persistence | FAIL (3 findings); SQL harness BLOCKED in the sandbox |
| 3 remote MCP + consent | FAIL (2 findings) |
| 4 checks | typecheck/lint PASS; test/build BLOCKED (sandbox denies sockets and network) |

Every finding was reproduced by Claude outside the sandbox at `a18cbfc` before being fixed:

| Sev | Finding | Fix |
|---|---|---|
| HIGH | OAuth-client token reads webhook secrets and deletes posts directly via PostgREST | `0036` (`e9a52ad`); **not applied, apply before enabling the OAuth server** |
| HIGH | transient poll failure → second paid Runway task | `583cec7`: id saved on the shot before polling and resumed next tick |
| MED | fallback Runway CDN clip cannot export (host not allow-listed) | `583cec7`: refresh via API; trust only the API-returned host |
| MED | rotating the first X-Forwarded-For hop dodges the per-IP cap | `583cec7`: rightmost hop |
| MED | a 206 partial body is stored as a permanent clip | `583cec7`: exactly 200 and Content-Length match |

Implementer-run, not independent: 7 code mutations and 6 migration mutations, each killed. The SQL
harness passes on a fresh Postgres 17. Pre-push: 412/412 (`f16beca`). **The fixes need an
independent re-review** of `a18cbfc..f16beca`. This branch does not yet carry PR #13's webhook fix
(`970f820`, `408eedc`).

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

Target: exact range 207b06b..a18cbfc on branch feat/finished-shorts (six code commits: b1cfc03 captions+voiceover in the MP4 export, b60543e Runway as second shot-animation provider, 4ab2579 remote MCP over HTTP with Supabase OAuth, 1c113ab review fixes, 45e1319 Runway clip persistence + migration 0035, a18cbfc its stream-reader fix; the brief-only commits between them change no code). Create your own worktree:
  git -C /Users/theophilusogieva/projects/ai/theplus-ai-influencer worktree add --detach /Users/theophilusogieva/projects/ai/theplus-ai-influencer-codex-review4 a18cbfc

Challenge:
1. src/lib/storyboard-finishing.ts + storyboard-export.ts: can any caption text reach a network fetch (next/og loads Google Fonts / emoji CDN for glyphs outside its bundled font)? Is OFFLINE_GLYPHS truly offline-safe? Does the ffmpeg graph (overlay, amix normalize=0, apad, -t) produce valid 48 kHz stereo AAC segments the `-c copy` concat accepts, for clips with and without source audio? Can a voice failure ship a voiceless video marked complete?
2. src/lib/runway.ts: verify the request contract against the official @runwayml/sdk types (base URL, X-Runway-Version, ratio/duration values, task statuses). Can a create be issued twice for one shot (retries, worker reclaim)? Is the runway:<id> refresh path in the export correct? persistRunwayClip copies each clip into the `storyboard-clips` bucket (migration 0035): can it throw and trigger a re-create, store a partial/oversized object, or let an authenticated user list or overwrite clips? Is adding our own Supabase host to the export clip allow-list an SSRF widening? Run scripts/sql/database-boundaries.sql (needs Docker or a local Postgres) and report.
3. src/app/api/mcp/route.ts, src/app/.well-known/oauth-protected-resource/[[...resource]]/route.ts, src/app/oauth/consent/*: auth bypasses (missing/forged/expired token, other users' workspaces), Origin handling, rate limits (per IP via X-Forwarded-For — spoofable?), the THEPLUS_MCP_REMOTE switch, consent CSRF / open redirect (redirect_url from Supabase), and whether any service-role key becomes reachable.
4. Run pnpm install --frozen-lockfile, pnpm typecheck, pnpm lint, pnpm test, pnpm build in your worktree and report exact results. Local ffmpeg is Homebrew 8 (no drawtext/libass) — the caption path must not need them.

Output: PASS/FAIL/BLOCKED per item, then findings with severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, concrete failure scenario and evidence, each marked reproduced or suspected. Finally delete the worktree's .next and node_modules and `git worktree remove` it.
