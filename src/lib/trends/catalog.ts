import type { BrandTone, CTA, LightingStyle, Platform, PostFormat, PostGoal } from '@/types/post';

// ---------------------------------------------------------------------------
// Trend catalog — v1 of the Trend Synthesizer (STRATEGY.md §AI roadmap).
// ---------------------------------------------------------------------------
// Curated by hand for the first release. The shape is identical to what a
// scraped feed (e.g. TikTok Creative Center / SocialContext / BuzzSumo)
// would return, so swapping the source later means rewriting only the
// loader — the rest of the app reads `Trend` and won't change.
//
// To refresh: edit this file weekly with current viral formats. Eventually
// migrate to a Supabase-backed table + a worker that polls a trends API.
// ---------------------------------------------------------------------------

export type TrendKind = 'audio' | 'hook' | 'format' | 'hashtag';
export type TrendCategory =
  | 'lifestyle'
  | 'fashion'
  | 'fitness'
  | 'food'
  | 'tech'
  | 'beauty'
  | 'business';

export interface Trend {
  id: string;
  title: string;
  kind: TrendKind;
  category: TrendCategory;
  platforms: Platform[];
  /** One-line summary visible on the card. */
  description: string;
  /** Why this is breaking out right now — surfaced under the description. */
  why: string;
  /** Optional link to an example post / source article. */
  source?: string;
  /** ISO date the trend started visibly breaking out. */
  trendingSince: string;
  /** When to stop showing it (UI hides past this date). */
  expiresAt?: string;
  /** Pre-fill for /create-post when the operator hits "Brief this trend". */
  prefill: {
    brief: string;
    scene: string;
    outfit: string;
    props: string;
    hook: string;
    postGoal: PostGoal;
    lighting: LightingStyle;
    format: PostFormat;
    brandTone: BrandTone;
    cta: CTA;
  };
}

export const CATEGORIES: TrendCategory[] = [
  'lifestyle',
  'fashion',
  'fitness',
  'food',
  'tech',
  'beauty',
  'business',
];

export const CATEGORY_EMOJI: Record<TrendCategory, string> = {
  lifestyle: '✨',
  fashion: '👗',
  fitness: '💪',
  food: '🍳',
  tech: '🛠️',
  beauty: '💄',
  business: '💼',
};

export const KIND_EMOJI: Record<TrendKind, string> = {
  audio: '🎵',
  hook: '🎣',
  format: '🎬',
  hashtag: '#️⃣',
};

// ---------------------------------------------------------------------------
// Seed catalog — refresh weekly.
// ---------------------------------------------------------------------------

export const TRENDS: Trend[] = [
  {
    id: 'pov-morning-establishing',
    title: '"POV: it\'s 6:47am and…" cinematic morning shot',
    kind: 'hook',
    category: 'lifestyle',
    platforms: ['tiktok', 'instagram'],
    description:
      'A wide, slightly-too-honest first frame with a timestamped POV caption — sets up a 7-second authenticity payoff.',
    why: 'Time-stamped POVs are pulling 3-5x average watch-time across lifestyle accounts this cycle.',
    trendingSince: '2026-05-01',
    prefill: {
      brief:
        'Open with a POV-style wide of the persona just waking up. The time-stamp caption ("POV: it\'s 6:47am") is the hook. Frame should feel a little unflattering, a little real. Persona drops a one-line truth about their routine.',
      scene: 'soft bedroom morning light through blinds, unmade bed visible',
      outfit: 'oversized t-shirt, no makeup, hair pulled back',
      props: 'phone in hand, coffee mug nearby',
      hook: "POV: it's 6:47am and I haven't decided yet",
      postGoal: 'engagement',
      lighting: 'natural',
      format: 'portrait',
      brandTone: 'casual',
      cta: 'no_cta',
    },
  },
  {
    id: 'get-ready-with-me',
    title: 'GRWM in <15 seconds',
    kind: 'format',
    category: 'beauty',
    platforms: ['tiktok', 'instagram'],
    description:
      'Tight cut sequence: 3 product close-ups → final reveal. Captions name each product over the shot.',
    why: 'Sub-15-second GRWMs are outperforming the 30-second cut by 2x in saves — viewers want the pace.',
    trendingSince: '2026-04-22',
    prefill: {
      brief:
        '3-shot GRWM. Each shot holds for 2-3 seconds: hand on serum bottle → tinted SPF on cheek → final closeup of the finished look. Final shot lingers an extra beat.',
      scene: 'bright bathroom with daylight, white tile background',
      outfit: 'cream tank, towel collar',
      props: 'serum bottle, tinted SPF, mascara',
      hook: 'My 90-second face. Watch what does the work.',
      postGoal: 'sales',
      lighting: 'natural',
      format: 'portrait',
      brandTone: 'playful',
      cta: 'shop_now',
    },
  },
  {
    id: 'desk-setup-flat-lay',
    title: 'Top-down desk flat-lay reveal',
    kind: 'format',
    category: 'tech',
    platforms: ['instagram', 'pinterest'],
    description:
      'Overhead shot of a desk setup with everything in frame — laptop, mug, plant, notebook — composed for the algorithm grid.',
    why: 'Pinterest impressions on desk setups are up 60% MoM as remote workers refresh for fall.',
    trendingSince: '2026-04-10',
    prefill: {
      brief:
        "Top-down hero shot of an aspirational but achievable desk setup. Every prop on the desk has a reason — show, don't tell. Final caption lists the 3 items the persona refuses to work without.",
      scene: 'overhead desk shot, walnut wood surface, soft window light from one side',
      outfit: '—',
      props: 'laptop, ceramic mug, small plant, leather notebook, mechanical pencil',
      hook: 'My 3 non-negotiables (and 4 things I added back).',
      postGoal: 'engagement',
      lighting: 'natural',
      format: 'square',
      brandTone: 'professional',
      cta: 'learn_more',
    },
  },
  {
    id: 'silent-recipe-asmr',
    title: 'Silent recipe ASMR (no voice-over)',
    kind: 'format',
    category: 'food',
    platforms: ['tiktok', 'instagram', 'youtube'],
    description:
      'Cooking sequence with ONLY in-camera audio — sizzle, chop, pour. No music, no voice-over.',
    why: 'Silent-cook videos are getting reshared into stories at 4x the rate of voice-over recipes.',
    trendingSince: '2026-03-28',
    prefill: {
      brief:
        'Cook a single dish front-to-back in silence. Every step is one shot, no cuts mid-step. End on the plate. Caption tells the recipe in 5 lines.',
      scene: 'minimalist kitchen, white marble counter, morning light',
      outfit: 'plain linen shirt rolled to elbows',
      props: 'cast-iron pan, wooden spoon, fresh ingredients laid out',
      hook: '5 ingredients. 4 minutes. 0 words.',
      postGoal: 'engagement',
      lighting: 'natural',
      format: 'portrait',
      brandTone: 'casual',
      cta: 'no_cta',
    },
  },
  {
    id: 'gym-tutorial-3-cuts',
    title: '3-cut form-check tutorial',
    kind: 'format',
    category: 'fitness',
    platforms: ['tiktok', 'instagram', 'youtube'],
    description:
      'Wide shot → side shot → close-up of grip / foot placement. Text overlay calls out the form cue per cut.',
    why: 'Form-check tutorials are converting fitness viewers into followers at the highest rate of any subgenre this month.',
    trendingSince: '2026-04-15',
    prefill: {
      brief:
        'Demonstrate one lift in 3 cuts. Cut 1: wide. Cut 2: side. Cut 3: close-up of the contact point (grip / foot). Each cut gets one text-overlay cue. Last frame: persona looks at camera, nods.',
      scene: 'gym, late afternoon, soft window light, dark equipment',
      outfit: 'athletic tank, fitted shorts',
      props: 'barbell or dumbbell relevant to the lift',
      hook: 'The 1 cue most people miss on this lift →',
      postGoal: 'community',
      lighting: 'cinematic',
      format: 'portrait',
      brandTone: 'edgy',
      cta: 'dm_me',
    },
  },
  {
    id: 'denim-fit-spin',
    title: 'Denim fit-check with the 360 spin',
    kind: 'format',
    category: 'fashion',
    platforms: ['instagram', 'tiktok'],
    description:
      'Persona stands in frame, slowly spins 360°. The fit speaks for itself. Caption names brand + size.',
    why: 'Slow-spin fit-checks are running at 2.4% engagement rate vs. 1.1% for static OOTDs.',
    trendingSince: '2026-04-29',
    prefill: {
      brief:
        'Single shot, persona stands center frame and rotates 360° over 6 seconds. No cuts. Camera is locked. Outfit is the message.',
      scene: 'plain concrete wall, urban street, golden hour',
      outfit: 'denim jacket + matching jean, white tee, beat-up sneakers',
      props: '—',
      hook: 'New denim, no edits, full spin.',
      postGoal: 'awareness',
      lighting: 'golden_hour',
      format: 'portrait',
      brandTone: 'casual',
      cta: 'shop_now',
    },
  },
  {
    id: 'before-after-split',
    title: '"Before / after" split-frame',
    kind: 'format',
    category: 'beauty',
    platforms: ['instagram', 'tiktok', 'pinterest'],
    description:
      'Single frame, persona half done up / half bare. Caption sells the product that did the work.',
    why: 'Split-frame proofs are saved at 5x the rate of carousel before/afters because they fit a single grid tile.',
    trendingSince: '2026-03-15',
    prefill: {
      brief:
        "Single hero shot, persona's face is bare on the left, fully done up on the right. Sharp dividing line down the middle of the frame. Caption names the 3 products that did the visible work.",
      scene: 'plain neutral backdrop, dramatic side light',
      outfit: 'shoulders bare or simple top',
      props: 'product line-up tucked into corner of frame',
      hook: 'Same face. 3 products. 4 minutes.',
      postGoal: 'sales',
      lighting: 'studio',
      format: 'square',
      brandTone: 'professional',
      cta: 'shop_now',
    },
  },
  {
    id: 'desk-setup-pov-handheld',
    title: 'Handheld POV walkthrough',
    kind: 'format',
    category: 'tech',
    platforms: ['tiktok', 'youtube'],
    description:
      'Phone-camera handheld POV walking through a workspace / studio / shop. No cuts. Persona narrates over.',
    why: 'Single-take handhelds feel "real" to algorithms — average completion rate is 78% vs. 41% for edited cuts.',
    trendingSince: '2026-05-03',
    prefill: {
      brief:
        'Handheld single-take walkthrough of the workspace. Persona narrates what they actually use and what was a mistake. End at the desk, sit down, look at camera, "alright let\'s get to work".',
      scene: 'home office or studio, daytime, natural light',
      outfit: 'whatever the persona wears to work',
      props: 'the actual gear on the actual desk',
      hook: 'Welcome to where the work happens (and the 2 things I regret buying).',
      postGoal: 'community',
      lighting: 'natural',
      format: 'portrait',
      brandTone: 'casual',
      cta: 'no_cta',
    },
  },
  {
    id: 'meal-prep-3x3',
    title: '3x3 meal prep grid carousel',
    kind: 'format',
    category: 'food',
    platforms: ['instagram', 'pinterest'],
    description:
      'Single hero shot composed as 9 tiles — 9 meals across the week. Caption breaks down ingredients + macros.',
    why: 'Pinterest re-pins for grid-style meal preps are up 90% as macro-counting picks up.',
    trendingSince: '2026-04-08',
    prefill: {
      brief:
        'Top-down hero of 9 prepped meal containers arranged in a 3x3 grid. Each container is visibly different. Caption lists protein/carb/veg + total cook time.',
      scene: 'overhead kitchen counter, white marble, morning light',
      outfit: '—',
      props: '9 glass meal-prep containers, varied colorful contents',
      hook: '9 meals. 90 minutes. ~$24.',
      postGoal: 'engagement',
      lighting: 'natural',
      format: 'square',
      brandTone: 'professional',
      cta: 'learn_more',
    },
  },
  {
    id: 'founder-build-in-public',
    title: 'Build-in-public weekly recap',
    kind: 'format',
    category: 'business',
    platforms: ['linkedin', 'twitter', 'youtube'],
    description:
      "Single-take selfie video summarizing the week's wins/losses/numbers. No edits, no music.",
    why: 'LinkedIn impressions for first-person founder updates are up 140% post-algorithm change.',
    trendingSince: '2026-04-19',
    prefill: {
      brief:
        'Single-take to-camera weekly recap. 3 specific numbers (revenue, signups, churn). 1 thing that broke. 1 thing that worked. No music. No cuts.',
      scene: 'home office, late afternoon, natural light',
      outfit: 'plain crewneck',
      props: 'optional: notebook with notes visible',
      hook: "Week 23: revenue is up, churn is up, here's what I'm doing about both.",
      postGoal: 'community',
      lighting: 'natural',
      format: 'square',
      brandTone: 'professional',
      cta: 'learn_more',
    },
  },
  {
    id: 'audio-quiet-life',
    title: '"quiet life" piano audio',
    kind: 'audio',
    category: 'lifestyle',
    platforms: ['tiktok', 'instagram'],
    description:
      'Slow solo piano with rain ambience. Pairs with morning routine / journaling / book recommendations.',
    why: 'Climbing fast on TikTok this week — 2.1M new uses in the last 7 days.',
    source: 'https://www.tiktok.com/music/quiet-life',
    trendingSince: '2026-05-04',
    prefill: {
      brief:
        'Slow ambient sequence set to the "quiet life" audio. Persona is alone, journaling or reading. No dialogue, no faster cuts than 3 seconds.',
      scene: 'window seat, soft afternoon light, mug of tea',
      outfit: 'cozy sweater, no makeup',
      props: 'journal + pen OR a book',
      hook: 'Sunday slowness.',
      postGoal: 'engagement',
      lighting: 'natural',
      format: 'portrait',
      brandTone: 'casual',
      cta: 'no_cta',
    },
  },
  {
    id: 'hashtag-2026core',
    title: '#2026core aesthetic',
    kind: 'hashtag',
    category: 'fashion',
    platforms: ['instagram', 'tiktok', 'pinterest'],
    description:
      'Mid-decade nostalgia revival — chrome accents, low-rise denim, futurism-but-soft.',
    why: 'Tag impressions up 230% in 30 days; brands are starting to seed product into the trend.',
    trendingSince: '2026-04-01',
    prefill: {
      brief:
        '#2026core fashion moment. Chrome-tinted backdrop, low-rise denim, soft-futurist styling. Outfit reads "this could be 2003 or 2032." Caption tags the trend explicitly.',
      scene: 'metallic chrome backdrop, slightly cool color cast',
      outfit: 'low-rise denim, mesh top, chunky chrome jewelry',
      props: '—',
      hook: '#2026core. Half nostalgia, half forecast.',
      postGoal: 'awareness',
      lighting: 'studio',
      format: 'portrait',
      brandTone: 'edgy',
      cta: 'shop_now',
    },
  },
];

/**
 * Look up a single trend by id. Used by the create-post page when it
 * receives a `?trendId=` query string for prefill.
 */
export function findTrend(id: string): Trend | null {
  return TRENDS.find((t) => t.id === id) ?? null;
}

/** Filter trends — used by the /trends page UI. */
export function filterTrends(options: {
  platform?: Platform;
  category?: TrendCategory;
  kind?: TrendKind;
}): Trend[] {
  const now = Date.now();
  return TRENDS.filter((t) => {
    if (t.expiresAt && new Date(t.expiresAt).getTime() < now) return false;
    if (options.platform && !t.platforms.includes(options.platform)) return false;
    if (options.category && t.category !== options.category) return false;
    if (options.kind && t.kind !== options.kind) return false;
    return true;
  });
}
