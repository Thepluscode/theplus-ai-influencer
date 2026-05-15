# Strategy — theplus-ai-influencer

> Status: living document. Updated 2026-05-12.
> Operating principle (saved): *abstraction > speed, automation as human leverage, distribution is the moat.*

## ICP — who buys this

**Primary wedge**: solo founder-operators running 1–3 AI influencer accounts as a business — the "AI persona founder." Already paying for Midjourney + CapCut + Notion calendar + a VA for posting. $40–200/month sub willingness. Discovers product on Twitter / Reddit / TikTok via creators who built it themselves.

**Adjacent ICPs** (in order of cleanest pain → product fit):

- **SMMAs / micro-agencies** managing 5–30 small-brand accounts. Need to scale content per account without scaling headcount.
- **DTC brands without in-house photo budget** — virtual brand ambassador instead of $3–10K model shoots.
- **Affiliate / lifestyle dropshippers** who want a face that scales without IRL liability.

Avoid for v1: agencies of agencies, big-brand marketing teams (procurement cycle kills you), adult-niche (payment-processor exposure).

## Pain points the ICP feels weekly

1. **Face drift** — Midjourney / SD without character locking produces a "different person" every render. Viewers detect it; trust dies; growth stalls. *(This is the only pain the app already solves — via Luma `character_ref`. It's the moat.)*
2. **5+ tool stack tax** — Midjourney → Photoshop → CapCut → IG/TikTok app → Notion calendar. ~30 min per post even when optimized. Context-switching, not creating.
3. **Caption + hashtag fatigue** — writing on-brand copy at scale, pacing voice, "rewrite this 10 ways."
4. **Cross-posting drag** — same content, 4 platforms, each needs reformatting + different caption tone + different hashtag style.
5. **No learning loop** — they post but don't know which face/scene/hook converted. No idea what to do next.
6. **Cadence burnout** — daily-or-die on TikTok / Reels; manual is unsustainable.
7. **Comment + DM volume** — once growth hits, this becomes a second job.
8. **No trend awareness** — they're shipping yesterday's format while the algorithm rewards today's.

## Gap — current app vs. what they actually need

Solves **#1 (face drift)** and partially **#2 (tool consolidation: Studio + Create-post + Calendar + Zernio)**. Everything else — captions, cross-posting smarts, learning loop, cadence sustainability, comments, trends — is currently the operator's manual labor.

Concretely missing:

- ❌ Captions (we collect brief + tone + CTA but don't generate copy)
- ❌ Hashtag bank
- ❌ Per-platform reformatting (one approved post → 4 platform-native variants)
- ❌ Performance analytics flowing back from Zernio
- ❌ Trend awareness (what's working *this week*)
- ❌ Video / storyboarded reels (image-only is a dealbreaker — Reels / TikTok is where growth lives)
- ❌ Series planning (a content arc, not a one-off post)
- ❌ Comment + DM autoresponse
- ❌ A/B testing & learning loop
- ❌ Multi-language localization

## Where AI goes — each agent maps to a role they'd otherwise hire

Anchored to the operating principle: *each agent = a role we'd otherwise hire*. The automation is the leverage we hand to the operator.

| Agent | Replaces | Effort | Why high-leverage |
|---|---|---|---|
| **1. Caption Writer** | Social media copywriter | Low | Touches every single post. LLM + persona profile + brief + platform rules → 3 captions + hashtags. Biggest per-post time win. |
| **2. Cross-Platform Reformatter** | Junior social manager | Low–Med | One approved post → 4 platform-native variants. **The "distribution moat" feature in code.** |
| **3. Performance Coach** | Analyst | Med | Pulls metrics from Zernio → tells operator what worked. *"Golden-hour scenes get 2.3× saves. Post at 7:42 PM EST."* Closes the learning loop. |
| **4. Series Planner** | Content strategist | Med | Given a model + goal → 28-day content arc with themes, scenes, hooks, post times. **The "app does my job FOR me" moment that turns trials into subs.** |
| **5. Trend Synthesizer** | Trend researcher | Med | Ingests trending audio (TikTok), formats (Reels), hooks → daily push: *"This audio is breaking out. Aria fits it. Brief?"* |
| **6. Video Storyboarder** | Director + editor | High | Brief → storyboard → Luma/Runway/Sora → stitched reel. **Killer feature — without video you can't compete for Reels growth.** |
| **7. Comment Watcher** | Community manager | High | Monitors comments → drafts brand-voice replies → one-tap approve. Spam-hide + brand-safety triage. |
| **8. DM Responder** | DM assistant | High | Qualifies inbound DMs (collab / fan / spam / lead). Auto-replies low-stakes, escalates the rest. |
| **9. Brand-Safety Guardian** | Comms reviewer | Med | Pre-publish check: visual + caption vs. brand rules, platform policy, sponsor restrictions. |
| **10. Localizer** | Translator | Low–Med | Auto-localize caption + cultural references for ES / PT / FR / DE — multiplies reach for free. |

## Roadmap — what ships, when

**v1 — get to "addictive value"** (in progress)

1. **Caption Writer** (LLM + persona context)
2. **Cross-Platform Reformatter** (one post → 4 native variants)
3. **Performance Coach — basic** (pull Zernio metrics, surface 3 insights weekly)

**v2 — get to "irreplaceable"**

4. **Series Planner** (28-day content arc generator)
5. **Trend Synthesizer** (daily trend push)

**v3 — open the video moat**

6. **Video Storyboarder** (storyboard → Luma / Runway → stitch → publish)

**v4 — operator becomes spectator** (post-PMF)

7–9. Comment Watcher + DM Responder + Brand-Safety Guardian

## Positioning evolution

- Current pitch: *"Generate AI influencer photos."*
- After v1: *"The AI content team for your AI persona."*
- After v2: *"Run an AI influencer business — fewer hours than a side project."*
- After v3: *"From persona to viral reel in 10 minutes."*

The product graduates from a generator (commoditized, lots of competition) into a **vertical workflow engine** (defensible, sticky, role-replacement). That's the whole game.

## Open questions

- Pricing model: per-seat, per-persona, or credit-pack? (Tied to LLM + Luma + Runway compute cost per post.)
- LLM provider for caption/copy: OpenAI for v1 (cost + reliability). Revisit for v2 with Anthropic for longer-form planning.
- Video provider for v3: Runway Gen-4 vs. Luma Dream Machine vs. Sora API — depends on character-lock fidelity at video scale.
- Should Trend Synthesizer build its own ingestion or proxy a 3rd-party (e.g. SocialContext API)? Lean toward proxy in v2, own in v3.
