# Feature Tracker — theplus-ai-influencer

Lifecycle: `PLANNED → IN PROGRESS → DEPLOYED → VERIFIED`.
Never mark `VERIFIED` without production evidence (logs, API response, observed behavior). "Build succeeded" is not verification.

## Content OS — Extract → Repackage → Distribute

**Status: IN PROGRESS** (code complete + demo-verified locally; migration not yet applied to prod; no live paid-API run).

Primary `/content-os` workflow: drop a source (paste / txt / md / pdf / audio / video) → extract reusable atoms → repackage into 10 channel-native outputs → approval-gated distribution through the existing posts / brand-safety / Calendar / Zernio path.

| Piece | State | Evidence |
|---|---|---|
| Migration `0017_content_os.sql` (5 tables, private `content-sources` bucket, claim/reclaim RPCs, RLS, credit-reason CHECK extend) | written, **NOT applied to prod** | apply in Supabase SQL editor in numeric order |
| env: `OPENAI_TRANSCRIBE_MODEL`, `CONTENT_SOURCE_MAX_BYTES`; deps: `unpdf@1.6.2`; credits: 4 COSTS + 4 reasons | done | typecheck/lint green |
| Source ingest (client-direct upload to private bucket + `createContentSourceAction`) | done | demo page renders, upload composer wired |
| Extraction (paste/txt/md, PDF via unpdf, audio/video via OpenAI transcribe) + atoms | done | unit tests (stub) pass; **real paid path unrun** |
| Repurpose engine (10 channels, Zod-validated, stub) | done | unit tests pass; valid 10-channel pack |
| Media briefs (visual channels) | done | stub tested. **Storyboard auto-render DEFERRED** (see memory) |
| Approve + schedule (reuse posts / brand-safety gate / Zernio / review links) | done | typecheck green; **live Zernio unrun** |
| Cron `/api/jobs/content-pipeline` (claim/reclaim, dispatch by kind) | done | compiles; **not curled against real DB** |
| `/content-os` + `/content-os/[id]` UI + nav (first PRIMARY_NAV item) | done | demo HTTP 200, atoms + pack items + approve render; bad id → 404 |
| Demo fixtures | done | `THEPLUS_DEMO_MODE=1` page renders deterministic source/atoms/pack/jobs |

**Gates:** `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` (145 passing, 26 new) ✅ · `pnpm build` ✅ · demo `/content-os` + detail + regression routes HTTP 200 ✅

**To reach VERIFIED:**
1. Apply `0017_content_os.sql` to prod Supabase; confirm bucket is private + RLS rejects cross-workspace reads.
2. Run a real source through extract → repackage with `OPENAI_STUB=0` (PDF text + a small audio transcription; confirm >25 MB fails closed).
3. `curl` `/api/jobs/content-pipeline` with the cron bearer against the real DB for extract/repackage/media ticks; quote responses.
4. Approve + schedule one social-channel item through live Zernio; confirm brand-safety block keeps a draft editable.
