# Build Plan — alignment to the InfluencerAI reference

> Companion to `STRATEGY.md`. STRATEGY answers *why and what for*; this answers *what and when*.
> Status: drafting. Awaiting sign-off on phase order before execution.

## Why this doc exists

I've been building screen-by-screen against ad-hoc feedback, which means features are accumulating without a unified spec. The user supplied a full walkthrough of the reference product (InfluencerAI Platform) plus a Whimsical-style architecture diagram. This doc maps the reference 1:1 to what we currently have, names the gaps, and sequences the work.

The standing principles (saved to memory) still anchor everything: **abstraction > speed · automation as human leverage · distribution is the moat**.

---

## 1. Reference inventory — what the walkthrough showed

Pulled from the user's narration + the 6 screenshots (5 product screens + 1 architecture canvas):

| Surface | Key elements in the reference |
|---|---|
| **Landing** | "Build, brief, and ship AI influencers" hero, marketing CTA |
| **Auth** | Sign-in / sign-up · **email + password + Google + GitHub** via Supabase |
| **Sidebar** | InfluencerAI logo top, **Dashboard · Models/Studio · Create Post · Calendar · Accounts · Settings**, user card + Sign Out in footer |
| **Top-right chrome** | **Credits pill** showing balance (e.g. `1740` credits) on every authed surface |
| **Studio hub** | Page title "AI Studio · Manage models and generate viral content" · **two giant CTAs**: Create New Model (blue) + Create New Post (purple, "Coming Soon" in the demo) · **My Models grid** with portrait + vibe badge + "Reach est. 12.5k-45k" · **Recent Activity rail** on the right showing scheduled/draft posts |
| **Create AI Model** | Influencer Name input · Gender pills (Female/Male) · Body Type (Slim/Athletic/Curvy/Plus Size) · Skin Tone (Fair/Tan/Olive/Brown/Deep) · Age Range (18-24/25-34/35-45) · Hair Style text · **Vibe** (Minimal/Cyber/Retro/Street/Luxury/E-Girl) · Prompt Builder text · **Generate Influencer (50 Credits)** CTA · right rail: Save AI Model to Studio + Portrait + Full Body preview · Credits visible top right |
| **Create Post** | **Model picker as avatar cards** with vibe + reach pill on each · Select Platforms split into **Connected Accounts** (Instagram, X/Twitter shown) vs **Connect More Platforms** (TikTok, LinkedIn, Pinterest dimmed) · Post Format · Campaign Name · Post Goal (awareness/engagement/launch dropdown) · Detailed Brief · Scene Location · Outfit · Lighting Style · Props · Brand Tone · Primary CTA · **up to 3 reference images** (with note that Luma Uni-1 supports up to 9) · Caption style auto-generated · **Right column: Instagram phone mockup live preview** with V1 / V2 toggle |
| **Schedule flow** | After variants render, choose **Save as draft** or **Schedule** → "Schedule now" vs "Schedule later" → date + time → Confirm |
| **Post Details modal** | Hero image left, right side: Platform & Model pills, Caption (editable), **Scheduled for** date/time, **Post Actions** (Save Draft) · **Connections Required** warning + Go to Accounts CTA if any picked platform isn't connected |
| **Calendar** | Beautiful month-view grid, post chips on day cells, edit/draft/delete from chip click, drafts strip |
| **Accounts** | Zernio-powered single-key multi-platform: Instagram, TikTok, Facebook, YouTube, Twitter |
| **Settings** | Free plan + paid plan selection · **Stripe checkout integration** |
| **Architecture node** | Landing → Auth check → SignIn/SignUp → Dashboard → branches to **Home / Models-Studio / Calendar / Accounts / Settings** → Models-Studio expands to *Create New Model* + *Create New Post* → *Generate & Scheduler on social media* → *Track Performance* → *Analytics* |

---

## 2. Current state — what we actually have

| Surface | Status |
|---|---|
| Landing | ✅ Marketing hero exists at `/`. |
| Auth — email/password | ✅ Sign-in, sign-up, **forgot-password** flow shipped. |
| Auth — Google / GitHub | ⚠️ Buttons exist on sign-in + sign-up pages, but no OAuth redirect URLs are configured in Supabase project. Buttons currently no-op or 500. |
| Sidebar nav | ✅ All 6 items + user card + Sign Out in footer (Framer palette). |
| Credits pill | ❌ Not implemented. No credits table, no decrement logic. |
| Studio hub | ⚠️ Currently the studio page IS the wizard. No hub layout, no two-card CTAs, no "Recent Activity" rail. Saved roster appears above the wizard but no vibe badge or reach estimate. |
| Studio wizard | ✅ Persona definition with emoji chips (gender/body/skin/age/vibe), preview tiles, save. Taxonomy mismatch (see §4). |
| Create Post | ⚠️ Wizard + variant canvas + AI Captions panel + upload slots. Missing: live phone-mockup preview, Connected vs Connect-more split, multi-reference (only 1 ref slot today), Post Goal / Lighting / Schedule-now-or-later fields. |
| Live preview | ❌ No Instagram-phone-mockup rendering of the variant. |
| Multi-reference upload | ⚠️ Single Product Reference slot. Reference wants up to 3 (Luma supports 9). |
| Schedule from Create-post | ❌ Today the operator must save draft → go to Calendar → drag to a date. Reference does it inline. |
| Post Details modal | ⚠️ Calendar's edit modal exists but lacks "Connections Required" warning and unified actions. |
| Captions / hashtags | ✅ Caption Writer + Cross-platform reformatter shipped. |
| Public share permalink | ✅ Shipped (`/p/[token]`). |
| Image upload | ✅ Two slots: skip-render + product reference. |
| Accounts (Zernio) | ✅ Page exists, connect buttons functional, status pills. |
| Calendar | ✅ Month grid, drafts shelf, edit modal, share-link panel, blue accent. |
| Dashboard | ✅ Stat tiles + quick actions + recent personas strip + next-up posts. |
| Settings | ⚠️ Page exists with integration status + danger zone. Billing / plans marked "soon". |
| Stripe billing | ❌ Not wired. Stripe keys in env schema but no checkout, no webhook, no plan rows. |
| Analytics (post performance) | ❌ Not implemented. |
| Reach estimate per model | ❌ Not implemented. |

---

## 3. Critical features to PRESERVE

User's stated: *"I like some features you have added, they are critical."* These are explicitly kept and integrated into the new structure:

1. **Framer DESIGN.md system** — black canvas, white-pill discipline (but with the blue CTA override the user approved), emoji chips with blue check badges, tight letter-spacing display type, hairline borders. Don't redesign — extend.
2. **AI Captions panel** (Caption Writer + Cross-Platform Reformatter) — keep on Create-post below variant canvas.
3. **Image upload slots** — Final image (skip render) + Product reference (compose into render).
4. **Public share permalink** `/p/[token]` — distribution moat feature.
5. **Forgot-password flow** — `/forgot` + `/reset` + callback.
6. **Calendar edit modal + share link panel** — keep, just add Connections-required warning.
7. **Dashboard stat tiles + quick actions + recent personas strip** — keep (this IS most of what the reference's Studio hub does — re-use the components when restructuring).
8. **Settings integrations status + Danger zone** — keep, just slot Billing in between.
9. **STRATEGY.md memo** — the AI roadmap (Caption Writer ✅, Cross-Platform Reformatter ✅, Performance Coach, Series Planner, Trend Synthesizer, Video Storyboarder).

---

## 4. Naming + taxonomy alignment (small, do early, prevents rework)

Reference uses friendlier copy than what I shipped. Aligning:

| Concept | Current | Target (matches reference) |
|---|---|---|
| Domain noun | "Model" / "Persona" | **"Influencer"** (with "Model" as a backwards-compat alias in DB) |
| Skin tone enum | light · medium-light · medium · medium-dark · dark | **Fair · Tan · Olive · Brown · Deep** |
| Age range enum | 18-25 · 25-35 · 35-45 · 45-55 · 55+ | **18-24 · 25-34 · 35-45** (drop the 45+ tiers — reference omits them) |
| Vibe enum | street · minimal · luxury · cinematic · editorial | **Minimal · Cyber · Retro · Street · Luxury · E-Girl** (drop cinematic + editorial, add cyber + retro + e-girl) |
| Gender enum | woman · man · non-binary | Female · Male · Non-binary (just label cap-change) |
| Studio page title | "Studio" | "AI Studio" + tagline "Manage models and generate viral content" |
| Persona-name field | "Model name" | "Influencer name" |
| Primary CTA copy | "Generate model" / "Generate Influencer" | **"Generate Influencer (50 Credits)"** (after credits ship) |
| Roster card subtitle | model name + time-since | model name + vibe badge + "Reach est. 12.5k-45k" pill |

These are mostly string and enum migrations — do in one PR. No DB rewrites (string values widen, not narrow).

---

## 5. Phased plan

Each phase is one shippable chunk. The goal: each phase ships value end-to-end and doesn't break what came before. Phases are roughly equal-effort (~3–6 hours of dense work each).

### Phase 1 — Studio hub + Credits + Taxonomy align *(unlock biggest UX leap)*

**Why first**: turns the most-visited surface (Studio) into the reference's hub-and-spoke layout. Credits unlock the billing path. Taxonomy clean-up prevents downstream rework.

- New `/studio` becomes a hub: title + tagline · two big CTA cards (Create New Model | Create New Post) · My Models grid below · Recent Activity rail on the right (re-uses Dashboard's "Next up" pattern)
- Move the existing wizard to **`/studio/new`** (separate page, back arrow to `/studio`)
- Studio: model cards get a **vibe badge** overlay + "Reach est." pill (formula: `1.2k–3.5k × portrait_seed_factor` for now; placeholder until Phase 4 plugs in real metrics)
- **Credits**: add `workspaces.credits` column (default 360) · `workspaces.plan` column (default 'free') · cost constants: 50 credits/influencer render, 25 credits/post variant, 5 credits/caption generation, 0 credits/cross-platform reformat (reuse last LLM call's hashtag bank). Deduct in server actions. 400 / paywall when insufficient.
- **Credits pill** in app-layout top-right showing remaining balance, links to `/settings#billing`
- **Taxonomy migration** (§4) — string updates + new enum values in zod schemas + UI relabels. No DB column rename.
- **Influencer rename** — UI copy only ("Model" → "Influencer"), DB tables keep `ai_models` for now.

### Phase 2 — Create Post: Live Preview + multi-reference + Connections split + Schedule inline

**Why second**: this is the most-used workflow once a roster exists. Reference's biggest wow factor is the live phone-mockup preview.

- **Live preview** right column: Instagram-style phone mockup framing the selected variant. V1 / V2 toggle (re-uses our variant array). Show influencer handle + Sponsored tag. (Lower priority: TikTok and X mockups via tabs.)
- **Platform picker split**: query Zernio account list server-side → render two sections, "Connected accounts" (clickable, selectable) and "Connect more" (dimmed, click → `/accounts`)
- **Multi-reference upload**: extend `productRefUrl` (single) to `productRefUrls` (string[] up to 3). Backend passes array as multiple `image_ref` entries (Luma supports up to 9). UI: three slots in a row.
- **Inline schedule**: after variants render, the existing Save Draft panel gets a sibling **Schedule** panel with date/time picker + "Schedule now" radio + "Schedule for…" radio + Confirm. Pushes to Zernio immediately on Confirm.
- **Post Goal** dropdown added to brief (awareness / engagement / launch / sales) — fed to caption prompt and Luma scene direction.
- **Lighting style** added to scene direction (natural / golden hour / studio / neon / overcast / cinematic).

### Phase 3 — Stripe billing + Plans + Paywall integration

**Why third**: needs Phase 1's credits scaffold to be in place.

- **Plans table**: workspaces.plan ∈ {`free`, `pro`, `studio`, `agency`}
- **Plan tiers**:
  - Free — 360 credits/mo, max 2 influencers, captions on
  - Pro $29/mo — 2,500 credits, max 10 influencers, priority queue
  - Studio $79/mo — 8,000 credits, unlimited influencers, multi-ref unlocked, share-link analytics
  - Agency $199/mo — 25,000 credits, team seats, white-label share links
- **Stripe checkout** server action + webhook handler at `/api/stripe/webhook` (updates plan + credits on `customer.subscription.created` / `.updated`)
- **Settings → Billing section**: current plan card, upgrade cards in a row, manage-subscription button (Stripe Customer Portal)
- **Paywall modals**: hit when credits = 0 or feature is plan-gated. CTA = Upgrade → Stripe checkout.
- Credit-purchase one-off SKU ($10 / 1,000 credits) for top-ups without changing plan.

### Phase 4 — Post Details modal + Connections-required + Analytics scaffold

**Why fourth**: polish + the analytics seed for v2.

- **Reusable Post Details modal** opened from any post chip (Studio Recent Activity, Dashboard Next-up, Calendar grid). Layout matches the reference screenshot: hero image left, right column with Platform & Model pills, Caption (editable), Scheduled for, Post Actions (Save Draft / Reschedule / Delete / Share link).
- **Connections required** warning component — checks selected platforms vs Zernio-connected platforms; renders inside the modal AND inline on Create-post before Schedule is clickable. CTA: Go to Accounts.
- **Analytics page** `/analytics` (new sidebar item or under Dashboard) — pulls Zernio engagement metrics per post (views/likes/comments/saves where available). Placeholder cards when empty. This is the seed for the **Performance Coach** agent in STRATEGY.md.
- **Studio Recent Activity rail** wired to the modal (currently the chips on Studio hub are display-only).

### Phase 5 (post-PMF) — bigger AI bets from STRATEGY.md

Series Planner, Trend Synthesizer, Video Storyboarder, Comment Watcher, DM Responder. Out of scope for this build cycle.

---

## 6. What I'm explicitly NOT doing

- **DB column renames** (e.g. `ai_models` → `ai_influencers`). String-only UI alignment.
- **Migrating the auth schema** to add OAuth. The buttons stay; Supabase project just needs Google/GitHub provider toggles flipped + redirect URLs added in the Supabase dashboard — pure ops, no code.
- **Rebuilding what already works** (Captions, share-permalink, forgot-password, upload slots, Calendar grid, Settings shell).

---

## 7. Open questions — answer before I start Phase 1

1. **Credits cost per generation** — keep my proposal (50 for influencer · 25 per variant · 5 captions · 0 reformat), or different?
2. **Plan prices** — keep my proposal ($0 / $29 / $79 / $199), or different?
3. **Default credit grant on signup** — 360 (reference) or different (e.g. 500)?
4. **"Influencer" rename in DB** — keep `ai_models` table or migrate to `ai_influencers`? (Recommend: keep — string aliasing only.)
5. **Taxonomy drop** — am I OK to drop `cinematic` and `editorial` vibes that I already shipped? Operators may have saved models with those values — need a migration to either keep them as legacy or remap.
6. **Live preview scope** — Instagram phone mockup only (v1), or all platforms tabbed (v1.1)?
7. **Reach-est. formula** — placeholder pseudo-random tied to model id (so it's stable per model), or hide until Phase 4 brings real metrics?

---

## 8. Recommended execution order

I propose: **Phase 1 → Phase 2 → Phase 4 → Phase 3**

Reasoning: Phase 3 (Stripe) is the most operationally heavy (webhook reliability, refund edge cases, dunning) and shouldn't block UX-leverage work. Phases 1+2+4 together get the product to "looks and feels like the reference," which is what the user is reaching for right now. Stripe can ship right before launch.

If you want billing earlier (you might, to charge alpha users), swap to: **Phase 1 → Phase 3 → Phase 2 → Phase 4**.

---

## 9. What I need from you to start

Sign-off on:
- Phase order (default proposed: 1 → 2 → 4 → 3, or 1 → 3 → 2 → 4 if billing first)
- Answers to §7 open questions (at minimum #5 — the vibe taxonomy drop — since it touches existing data)

Then I lock the plan, update STRATEGY.md cross-reference, and start Phase 1.
