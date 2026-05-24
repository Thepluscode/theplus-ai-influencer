# ThePlus AI Influencer — VSL Script

> Spoken-word video sales letter. Voice: direct second person, CASHFLOW-quadrant
> framing (Rich Dad / Poor Dad). The sections below are the script; the
> **Internal notes** at the bottom are not part of the spoken copy.

---

## Hook

Hello, have you ever thought about why some people seem to be everywhere online? Daily content, emails, social posts, videos, while you're struggling to keep up?

I used to wonder the same thing. And then I figured it out. They haven't outworked you. They've outbuilt you.

## The content side

Without AI, content is a full-time job. You sit down Monday morning to write. Two hours later, you have a blog post. Then you spend 30 minutes turning it into an email. Then you manually write posts for LinkedIn, Facebook, Instagram, each one different, each one taking time. By the end, you've spent five or six hours and produced one piece of content.

You can't do that every day. So you do it when you can, which means sporadically, which means your audience never knows when to expect you, which means the algorithm punishes you, and your reach stays small.

That's the S quadrant trap applied to marketing. My poor dad had the same trap in his career. He worked harder every year and hit the same ceiling. My rich dad never asked how hard you worked. He asked whether your business worked without you.

With AI, one person can write 10 pieces of content in a single Sunday session, load them into a scheduling system, and have the entire month run automatically across every platform. You look like you have a marketing team. You don't. It's just you and the right tools.

That's the content side of what AI makes possible for a one-person business today.

## The engagement side

But content is only half of why someone seems to be everywhere.

The other half is the replies. The accounts you actually follow don't just post. They answer. Someone comments and gets a response. Someone sends a DM with a question and hears back the same day. That answering is what turns a follower into a customer, and it's the first thing that breaks when you're one person. You can write the Sunday batch. You cannot also live in the comments of every platform, every hour.

My poor dad would have answered every message himself, late at night, exhausted, proud of the effort. My rich dad would have asked one question: why are you the one sitting in the inbox?

You're not. The comments and the DMs land in one place, already sorted, each one with a reply drafted in your voice waiting beneath it. The real buyer pulled out of the noise. The spam set to the side. You read it, you tap approve, and it posts back to the platform for you. The blank box is gone. An hour of "what do I even say" becomes a minute of yes, yes, yes. You still decide what goes out in your name. You're just no longer the one starting from nothing at midnight.

That's the engagement side.

## The presence side

Then there's the hardest part of all. Being the face.

Posting and replying still assume one thing: that you want to be on camera, every day, looking the part, in the mood or not. For most people that's the real ceiling. Not the writing. The showing up as a personality, on video, forever.

So you build a face that's yours to direct and never tired. You create the persona once. You decide who they are, how they look, how they talk. Then you generate the photos and the reels from a prompt, in your style, with no camera, no studio, and not a single good hair day.

That's the presence side.

## The trap inside the solution

Now here's the trap hiding inside the solution.

You could go assemble this yourself. One tool to make the images. Another to write the captions. A third to reformat them for each platform. A scheduler. A comment bot. A DM tool. An analytics dashboard. Seven logins, seven bills, seven things that break, and a Sunday that somehow got longer instead of shorter. You didn't escape the S quadrant. You rebuilt it with more tabs open.

Rich dad's question still stands. Does it run without you? Seven disconnected tools don't. They run because you're the glue holding them together. Take you out and the whole thing stops.

## The system

That's why I built ThePlus AI Influencer.

One persona. One system. One place where the whole machine lives.

You create your influencer in the studio. You generate the posts and the reels from it. The AI writes the captions and rewrites each one for the platform it's headed to. You drop a month into the calendar and connect your accounts once. From there it posts, on time, everywhere, while you do other things. It pulls in every comment and DM, drafts the response in your voice, and the moment you approve, posts it back to the platform. It checks every piece against your own brand rules before anything goes out, so the machine never says something you wouldn't. And it shows you, in plain numbers, what landed and what to make more of.

You're not the glue anymore. You're the owner.

## The quadrant

That's the move my rich dad spent his life pointing at. The S quadrant trades your hours for output, and it caps you at the number of hours you have. The B quadrant builds a system that produces whether you show up or not. Most people never cross that line, because building the system used to cost a team and a budget. Not anymore. Now it costs a Sunday and the decision to stop being the bottleneck.

## The new week

So picture the new week. Sunday, you direct your persona and load the month. Monday through Saturday, you live your life. The posts go out. The replies arrive already drafted, waiting for your yes. The right conversations find you. The numbers come back and tell you what to make next. You look like you have a marketing team, a content studio, and a community manager.

You don't. It's just you and the right system.

## Close

The people who are everywhere aren't working harder than you. They're running something you haven't built yet.

You can build it this weekend. Open the studio, create your influencer, and watch the first month run itself.

---

## Internal notes (not part of the spoken script)

**What each claim maps to in the product:**

| Claim | Backing |
|---|---|
| "generate the photos and the reels from a prompt" | `studio/` (Luma personas), `storyboard/` (Luma video) |
| "writes the captions and rewrites each one for the platform" | `src/lib/captions.ts` (OpenAI) |
| "drop a month into the calendar… posts everywhere" | `calendar/`, `accounts/`, `src/lib/zernio.ts` |
| "pulls in every comment and DM, drafts the response… posts it back" | `src/lib/zernio-webhooks.ts`, `src/app/api/webhooks/zernio`, `zernio.replyToComment` / `sendDmReply` |
| "checks every piece against your brand rules before anything goes out" | `src/lib/publish-safety.ts` (enforced on every publish path; **verified live**) |
| "shows you, in plain numbers, what landed" | `analytics/` (Zernio metrics) |

**Honesty boundary — do not record/publish the engagement claim until verified:**

- The engagement copy ("comments and DMs land already drafted… posts back for you") describes the auto-ingest + reply-back pipeline, which is **built and unit-tested but not yet verified end-to-end in production**. It needs: Zernio **Inbox add-on** enabled, `ZERNIO_WEBHOOK_SECRET` set, the webhook URL registered in Zernio, and a `/v1/webhooks/test` → approve → posts-back round-trip confirmed.
- Replies are **approval-gated by design** — nothing posts in your name without your tap. The copy reflects this ("you tap approve", "waiting for your yes"); keep it. Do not rewrite it to imply fully autonomous replying.
- The **brand-safety** line is true and verified today; it can ship now.
- No results/numbers are claimed anywhere — keep it that way until there's measured evidence.
