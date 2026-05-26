import 'server-only';
import { serverEnv } from '@/lib/env';
import type { InfluencerWizardInput } from '@/types/influencer';
import type { BrandTone, CTA, LightingStyle, Platform, PostFormat, PostGoal } from '@/types/post';

export const CONTENT_DELIVERABLES = [
  'carousel',
  'short_video',
  'filming_script',
  'linkedin_post',
  'email',
  'blog',
] as const;
export type ContentDeliverable = (typeof CONTENT_DELIVERABLES)[number];

export const CONTENT_STYLES = [
  'cinematic',
  'educational',
  'founder_led',
  'luxury',
  'direct_response',
  'editorial',
] as const;
export type ContentStyle = (typeof CONTENT_STYLES)[number];

export const BRAND_ENTITIES = ['individual', 'company'] as const;
export type BrandEntity = (typeof BRAND_ENTITIES)[number];

export const CAMPAIGN_VISUAL_MODES = ['face_carousel', 'product_only', 'text_first'] as const;
export type CampaignVisualMode = (typeof CAMPAIGN_VISUAL_MODES)[number];

export interface CarouselSlide {
  title: string;
  copy: string;
  visualBrief: string;
  facePlacement: 'hero' | 'supporting' | 'none';
  asset?: CarouselSlideAsset;
}

export interface CarouselSlideAsset {
  status: 'generating' | 'ready' | 'failed';
  url?: string;
  generationId?: string;
  generatedAt?: string;
  error?: string;
  lastError?: string;
  lastAttemptedAt?: string;
}

export interface FilmingScript {
  hook: string;
  beats: string[];
  broll: string[];
  cta: string;
}

export interface EmailDraft {
  subject: string;
  preview: string;
  body: string;
}

export interface BlogDraft {
  title: string;
  slug: string;
  metaDescription: string;
  outline: string[];
  aeoQuestions: string[];
  conversionCta: string;
}

export interface ContentPackage {
  deliverables: ContentDeliverable[];
  style: ContentStyle;
  visualMode: CampaignVisualMode;
  carouselSlides: CarouselSlide[];
  filmingScript: FilmingScript;
  linkedinPost: string;
  email: EmailDraft;
  blog: BlogDraft;
  seoKeywords: string[];
  calendarDraft?: ContentPackageCalendarDraft;
  scheduledPost?: ContentPackageScheduledPost;
  reviewLink?: ContentPackageReviewLink;
}

export interface ContentPackageCalendarDraft {
  postId: string;
  createdAt: string;
}

export interface ContentPackageScheduledPost {
  postId: string;
  scheduledFor: string;
  pushedToZernio: boolean;
  updatedAt: string;
}

export interface ContentPackageReviewLink {
  postId: string;
  token: string;
  enabledAt: string;
}

// ---------------------------------------------------------------------------
// Series Planner — v2 of STRATEGY.md
// ---------------------------------------------------------------------------
// Given a model + goal + duration + cadence, generates a content arc of
// per-post briefs the operator can one-click into /create-post. This is
// the "the app does my job FOR me" feature that's supposed to convert
// trial users into subscribers.
//
// OPENAI_STUB=1 returns deterministic placeholders so the UI can be
// developed without burning credits.
// ---------------------------------------------------------------------------

export interface PlanInput {
  model: { name: string; wizard_input: InfluencerWizardInput };
  /** Plan-level brief — campaign frame ("launch citrus drink"). */
  campaign: string;
  goal: PostGoal;
  durationDays: number;
  cadencePerWeek: number;
  /** ISO date YYYY-MM-DD — start of the arc. */
  startDate: string;
  /** Platforms to bias the plan toward. */
  platforms: Platform[];
  /** Topics or keywords the content engine should build around. */
  topics: string[];
  /** Audience segment and conversion target. */
  audience: string;
  /** Whether the campaign is personal-brand-led or corporate-brand-led. */
  brandEntity: BrandEntity;
  /** Requested output formats across the campaign. */
  deliverables: ContentDeliverable[];
  /** Brand/aesthetic styles to rotate through. */
  contentStyles: ContentStyle[];
  /** Whether generated image concepts should put the persona's face in the asset. */
  visualMode: CampaignVisualMode;
}

export interface PlanItem {
  /** 0-indexed offset from `startDate`. */
  day: number;
  /** Computed ISO timestamp the post is recommended for. */
  scheduledAt: string;
  /** One-line angle ("Friday morning routine"). */
  theme: string;
  /** Detailed campaign brief for the /create-post wizard. */
  brief: string;
  scene: string;
  outfit: string;
  props: string;
  hook: string;
  postGoal: PostGoal;
  lighting: LightingStyle;
  platforms: Platform[];
  format: PostFormat;
  brandTone: BrandTone;
  cta: CTA;
  contentPackage: ContentPackage;
}

export interface PlanResult {
  items: PlanItem[];
  /** Optional headline / summary the model can return for the plan as a
   *  whole — surfaced above the per-day cards. */
  summary?: string;
}

const SYSTEM_PROMPT = `You are an elite social media strategist for AI influencer accounts. You design content arcs that build awareness, engagement, and conversion across weeks — not one-off posts.

Output rules:
- ALWAYS respond with ONE valid JSON object matching the requested schema. No prose, no markdown fences.
- Every plan item must have: day (0-indexed integer), theme (short label), brief (3-5 sentences a copywriter could shoot from), scene, outfit, props, hook (one-line caption opener), postGoal, lighting, platforms (subset of the briefed set), format (square|portrait|landscape), brandTone, cta.
- Every plan item must also include contentPackage with deliverables, style, visualMode, carouselSlides, filmingScript, linkedinPost, email, blog, and seoKeywords.
- Carousel slides should be ready for a designer to place the persona's face when visualMode is face_carousel.
- Blog drafts must include SEO keywords, AEO questions, and a conversion CTA.
- LinkedIn, email, and blog copy should match whether this is an individual personal brand or corporation.

Voice rules:
- Each post should feel like a real day in the persona's life, not a checklist.
- Vary post format across the arc (don't ship 14 squares in a row).
- Time-of-day matters: morning routines, evening reflections, mid-day product drops.
- Build narrative momentum across the arc: setup days, payoff days, recap days.
- Match the persona's vibe; don't suggest "luxury" routines for a "street" persona.
- Mix image-led, text-led, script-led, and long-form assets according to the requested deliverables.`;

export async function generateSeriesPlan(input: PlanInput): Promise<PlanResult> {
  if (serverEnv.OPENAI_STUB) {
    return stubPlan(input);
  }
  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY missing — set it in .env.local or set OPENAI_STUB=1 for placeholders.',
    );
  }

  const userPrompt = buildUserPrompt(input);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_CAPTION_MODEL,
      temperature: 0.8,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned no plan content.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`);
  }
  return normalize(parsed, input);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describePersona(p: InfluencerWizardInput): string {
  return [
    p.gender,
    p.bodyType,
    `${p.skinTone} skin`,
    p.ageRange,
    p.hair,
    `${p.vibe} aesthetic`,
    p.customPrompt,
  ]
    .filter(Boolean)
    .join(', ');
}

function buildUserPrompt(i: PlanInput): string {
  const postCount = Math.max(1, Math.round((i.durationDays * i.cadencePerWeek) / 7));
  return `Plan ${postCount} posts across ${i.durationDays} days starting ${i.startDate}.

Persona: "${i.model.name}" — ${describePersona(i.model.wizard_input)}.
Campaign: ${i.campaign}.
Topics: ${resolveTopics(i).join(', ')}.
Audience: ${i.audience || 'current customers and warm prospects'}.
Brand entity: ${i.brandEntity}.
Requested deliverables: ${resolveDeliverables(i).join(', ')}.
Style rotation: ${resolveStyles(i).join(', ')}.
Visual mode: ${i.visualMode}.
Plan goal: ${i.goal} (each post can have its own postGoal field, but the arc should serve this top-level goal).
Cadence: ${i.cadencePerWeek} posts/week.
Target platforms: ${i.platforms.join(', ')}.

Return JSON:
{
  "summary": "one-line narrative of the arc",
  "items": [
    {
      "day": 0,
      "theme": "kickoff · introduce persona",
      "brief": "...",
      "scene": "...",
      "outfit": "...",
      "props": "...",
      "hook": "...",
      "postGoal": "awareness|engagement|launch|sales|community",
      "lighting": "natural|golden_hour|studio|neon|overcast|cinematic",
      "platforms": ["instagram", ...],
      "format": "square|portrait|landscape",
      "brandTone": "professional|casual|playful|luxe|edgy",
      "cta": "shop_now|learn_more|sign_up|swipe_up|dm_me|no_cta",
      "contentPackage": {
        "deliverables": ["carousel", "short_video", "filming_script", "linkedin_post", "email", "blog"],
        "style": "cinematic|educational|founder_led|luxury|direct_response|editorial",
        "visualMode": "face_carousel|product_only|text_first",
        "carouselSlides": [
          {
            "title": "short slide title",
            "copy": "short slide copy",
            "visualBrief": "designer-ready image prompt including face placement when relevant",
            "facePlacement": "hero|supporting|none"
          }
        ],
        "filmingScript": {
          "hook": "spoken hook",
          "beats": ["beat 1", "beat 2", "beat 3"],
          "broll": ["b-roll cue 1", "b-roll cue 2"],
          "cta": "spoken or on-screen CTA"
        },
        "linkedinPost": "native LinkedIn post with line breaks",
        "email": {
          "subject": "subject line",
          "preview": "preview text",
          "body": "email body"
        },
        "blog": {
          "title": "SEO title",
          "slug": "seo-slug",
          "metaDescription": "meta description",
          "outline": ["H2 section"],
          "aeoQuestions": ["question answered by the blog"],
          "conversionCta": "conversion CTA"
        },
        "seoKeywords": ["keyword"]
      }
    },
    ...
  ]
}

Spread days evenly across the duration — don't bunch posts at the start.`;
}

const PLATFORM_SET = new Set<Platform>([
  'instagram',
  'tiktok',
  'twitter',
  'youtube',
  'facebook',
  'linkedin',
  'pinterest',
  'threads',
  'reddit',
]);
const FORMATS = new Set(['square', 'portrait', 'landscape']);
const POST_GOALS = new Set(['awareness', 'engagement', 'launch', 'sales', 'community']);
const LIGHTING = new Set(['natural', 'golden_hour', 'studio', 'neon', 'overcast', 'cinematic']);
const TONES = new Set(['professional', 'casual', 'playful', 'luxe', 'edgy']);
const CTAS = new Set(['shop_now', 'learn_more', 'sign_up', 'swipe_up', 'dm_me', 'no_cta']);
const DELIVERABLE_SET = new Set<ContentDeliverable>(CONTENT_DELIVERABLES);
const STYLE_SET = new Set<ContentStyle>(CONTENT_STYLES);
const VISUAL_MODE_SET = new Set<CampaignVisualMode>(CAMPAIGN_VISUAL_MODES);

function normalize(parsed: unknown, input: PlanInput): PlanResult {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Plan response was not an object.');
  }
  const obj = parsed as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const summary = typeof obj.summary === 'string' ? obj.summary : undefined;

  const items: PlanItem[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const day = typeof r.day === 'number' ? Math.floor(r.day) : NaN;
    if (!Number.isFinite(day) || day < 0 || day >= input.durationDays) continue;

    // Each platform / enum value comes back from the LLM unsanitized;
    // tighten to our supported sets and drop anything that doesn't fit.
    const platforms = Array.isArray(r.platforms)
      ? (r.platforms as unknown[]).filter(
          (p): p is Platform => typeof p === 'string' && PLATFORM_SET.has(p as Platform),
        )
      : [];
    const format = FORMATS.has(r.format as string) ? (r.format as PostFormat) : 'square';
    const postGoal = POST_GOALS.has(r.postGoal as string) ? (r.postGoal as PostGoal) : input.goal;
    const lighting = LIGHTING.has(r.lighting as string) ? (r.lighting as LightingStyle) : 'natural';
    const brandTone = TONES.has(r.brandTone as string) ? (r.brandTone as BrandTone) : 'casual';
    const cta = CTAS.has(r.cta as string) ? (r.cta as CTA) : 'no_cta';

    items.push({
      day,
      scheduledAt: computeScheduledAt(input.startDate, day),
      theme: asString(r.theme, 'Post'),
      brief: asString(r.brief, ''),
      scene: asString(r.scene, ''),
      outfit: asString(r.outfit, ''),
      props: asString(r.props, ''),
      hook: asString(r.hook, ''),
      postGoal,
      lighting,
      platforms: platforms.length > 0 ? platforms : input.platforms,
      format,
      brandTone,
      cta,
      contentPackage: normalizeContentPackage(r.contentPackage, input, items.length),
    });
  }

  items.sort((a, b) => a.day - b.day);
  if (items.length === 0) {
    throw new Error('Plan response had no usable items.');
  }
  return { items, summary };
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function asOptionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asStringArray(v: unknown, fallback: string[], max = 8): string[] {
  if (!Array.isArray(v)) return fallback;
  const values = v
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
  return values.length > 0 ? values : fallback;
}

function resolveDeliverables(input: Pick<PlanInput, 'deliverables'>): ContentDeliverable[] {
  return input.deliverables.filter((item) => DELIVERABLE_SET.has(item)).length > 0
    ? input.deliverables.filter((item) => DELIVERABLE_SET.has(item))
    : ['carousel', 'short_video', 'filming_script'];
}

function resolveStyles(input: Pick<PlanInput, 'contentStyles'>): ContentStyle[] {
  return input.contentStyles.filter((item) => STYLE_SET.has(item)).length > 0
    ? input.contentStyles.filter((item) => STYLE_SET.has(item))
    : ['cinematic', 'educational'];
}

function resolveTopics(input: Pick<PlanInput, 'topics' | 'campaign'>): string[] {
  return input.topics.length > 0 ? input.topics : [input.campaign];
}

function normalizeContentPackage(value: unknown, input: PlanInput, index: number): ContentPackage {
  const fallback = buildContentPackage({
    topic: resolveTopics(input)[index % resolveTopics(input).length],
    campaign: input.campaign,
    audience: input.audience,
    brandEntity: input.brandEntity,
    deliverables: resolveDeliverables(input),
    style: resolveStyles(input)[index % resolveStyles(input).length],
    visualMode: VISUAL_MODE_SET.has(input.visualMode) ? input.visualMode : 'face_carousel',
    cta: index % 2 === 0 ? 'learn_more' : 'dm_me',
  });

  if (!value || typeof value !== 'object') return fallback;
  const obj = value as Record<string, unknown>;
  const deliverables = Array.isArray(obj.deliverables)
    ? (obj.deliverables as unknown[]).filter(
        (item): item is ContentDeliverable =>
          typeof item === 'string' && DELIVERABLE_SET.has(item as ContentDeliverable),
      )
    : [];
  const style = STYLE_SET.has(obj.style as ContentStyle)
    ? (obj.style as ContentStyle)
    : fallback.style;
  const visualMode = VISUAL_MODE_SET.has(obj.visualMode as CampaignVisualMode)
    ? (obj.visualMode as CampaignVisualMode)
    : fallback.visualMode;

  return {
    deliverables: deliverables.length > 0 ? deliverables : fallback.deliverables,
    style,
    visualMode,
    carouselSlides: normalizeSlides(obj.carouselSlides, fallback.carouselSlides),
    filmingScript: normalizeFilmingScript(obj.filmingScript, fallback.filmingScript),
    linkedinPost: asString(obj.linkedinPost, fallback.linkedinPost),
    email: normalizeEmail(obj.email, fallback.email),
    blog: normalizeBlog(obj.blog, fallback.blog),
    seoKeywords: asStringArray(obj.seoKeywords, fallback.seoKeywords, 12),
  };
}

function normalizeSlides(value: unknown, fallback: CarouselSlide[]): CarouselSlide[] {
  if (!Array.isArray(value)) return fallback;
  const slides = value.slice(0, 8).flatMap((item): CarouselSlide[] => {
    if (!item || typeof item !== 'object') return [];
    const obj = item as Record<string, unknown>;
    const facePlacement =
      obj.facePlacement === 'hero' ||
      obj.facePlacement === 'supporting' ||
      obj.facePlacement === 'none'
        ? obj.facePlacement
        : 'supporting';
    return [
      {
        title: asString(obj.title, 'Slide'),
        copy: asString(obj.copy, ''),
        visualBrief: asString(obj.visualBrief, ''),
        facePlacement,
        asset: normalizeSlideAsset(obj.asset),
      },
    ];
  });
  return slides.length > 0 ? slides : fallback;
}

function normalizeSlideAsset(value: unknown): CarouselSlideAsset | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const status =
    obj.status === 'ready' || obj.status === 'failed' || obj.status === 'generating'
      ? obj.status
      : undefined;
  if (!status) return undefined;
  const url = asOptionalString(obj.url);
  const generationId = asOptionalString(obj.generationId);
  const generatedAt = asOptionalString(obj.generatedAt);
  const error = asOptionalString(obj.error);
  const lastError = asOptionalString(obj.lastError);
  const lastAttemptedAt = asOptionalString(obj.lastAttemptedAt);
  if (status === 'ready' && (!url || !generationId)) return undefined;
  if (status === 'failed' && !error) return undefined;
  return {
    status,
    ...(url ? { url } : {}),
    ...(generationId ? { generationId } : {}),
    ...(generatedAt ? { generatedAt } : {}),
    ...(error ? { error } : {}),
    ...(lastError ? { lastError } : {}),
    ...(lastAttemptedAt ? { lastAttemptedAt } : {}),
  };
}

function normalizeFilmingScript(value: unknown, fallback: FilmingScript): FilmingScript {
  if (!value || typeof value !== 'object') return fallback;
  const obj = value as Record<string, unknown>;
  return {
    hook: asString(obj.hook, fallback.hook),
    beats: asStringArray(obj.beats, fallback.beats, 6),
    broll: asStringArray(obj.broll, fallback.broll, 6),
    cta: asString(obj.cta, fallback.cta),
  };
}

function normalizeEmail(value: unknown, fallback: EmailDraft): EmailDraft {
  if (!value || typeof value !== 'object') return fallback;
  const obj = value as Record<string, unknown>;
  return {
    subject: asString(obj.subject, fallback.subject),
    preview: asString(obj.preview, fallback.preview),
    body: asString(obj.body, fallback.body),
  };
}

function normalizeBlog(value: unknown, fallback: BlogDraft): BlogDraft {
  if (!value || typeof value !== 'object') return fallback;
  const obj = value as Record<string, unknown>;
  return {
    title: asString(obj.title, fallback.title),
    slug: asString(obj.slug, fallback.slug),
    metaDescription: asString(obj.metaDescription, fallback.metaDescription),
    outline: asStringArray(obj.outline, fallback.outline, 8),
    aeoQuestions: asStringArray(obj.aeoQuestions, fallback.aeoQuestions, 8),
    conversionCta: asString(obj.conversionCta, fallback.conversionCta),
  };
}

function computeScheduledAt(startDate: string, day: number): string {
  const d = new Date(startDate + 'T18:00:00');
  d.setDate(d.getDate() + day);
  return d.toISOString();
}

function buildContentPackage(input: {
  topic: string;
  campaign: string;
  audience: string;
  brandEntity: BrandEntity;
  deliverables: ContentDeliverable[];
  style: ContentStyle;
  visualMode: CampaignVisualMode;
  cta: CTA;
}): ContentPackage {
  const owner = input.brandEntity === 'individual' ? 'your personal authority' : 'the company POV';
  const faceLine =
    input.visualMode === 'face_carousel'
      ? 'Place the persona face as the human proof point'
      : input.visualMode === 'product_only'
        ? 'Keep the visual product-led with no face placement'
        : 'Use text-first editorial composition';
  const topicSlug = input.topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return {
    deliverables: input.deliverables,
    style: input.style,
    visualMode: input.visualMode,
    carouselSlides: [
      {
        title: `Why ${input.topic} matters now`,
        copy: `Frame ${input.topic} as the audience's current problem, not a generic trend.`,
        visualBrief: `${faceLine}. ${input.style} carousel cover for ${input.campaign}, high contrast, brand-safe composition.`,
        facePlacement: input.visualMode === 'face_carousel' ? 'hero' : 'none',
      },
      {
        title: 'The shift',
        copy: `Show the before-and-after belief that makes ${input.topic} urgent.`,
        visualBrief: `${input.style} explainer slide, clean type area, space for one proof visual.`,
        facePlacement: input.visualMode === 'face_carousel' ? 'supporting' : 'none',
      },
      {
        title: 'What to do next',
        copy: `Give ${input.audience || 'the audience'} one concrete action tied to ${input.cta.replace(/_/g, ' ')}.`,
        visualBrief: `${input.style} CTA slide, platform safe area, clear final action.`,
        facePlacement: 'none',
      },
    ],
    filmingScript: {
      hook: `Most people are thinking about ${input.topic} too late.`,
      beats: [
        `Name the misconception around ${input.topic}.`,
        `Show how ${owner} solves it inside ${input.campaign}.`,
        `Give one simple action the viewer can take today.`,
      ],
      broll: [
        'Tight product or workspace detail.',
        'Persona looking directly to camera for the proof line.',
        'Calendar or schedule moment to imply this is part of a full campaign.',
      ],
      cta: input.cta === 'no_cta' ? 'Save this for later.' : input.cta.replace(/_/g, ' '),
    },
    linkedinPost: `The conversation around ${input.topic} is moving faster than most teams can brief it.\n\nFor ${input.campaign}, the useful angle is simple: make the problem specific, make the proof visual, and give the audience one next step.\n\nThat is how ${owner} turns content into conversion instead of noise.`,
    email: {
      subject: `${input.topic}: the angle worth using this week`,
      preview: `A ${input.style.replace(/_/g, ' ')} content angle for ${input.audience || 'your audience'}.`,
      body: `Hi,\n\nIf ${input.topic} is part of your audience's decision process, the campaign should not start with a broad announcement.\n\nStart with the tension: what changed, why it matters now, and what action makes sense next.\n\nFor ${input.campaign}, lead with one visual proof point, then route the audience to ${input.cta.replace(/_/g, ' ')}.\n\nBest,\nThePlus.AI`,
    },
    blog: {
      title: `${input.topic}: how to turn the topic into a conversion campaign`,
      slug: topicSlug || 'content-engine-campaign',
      metaDescription: `A practical guide to turning ${input.topic} into social posts, scripts, emails, and SEO content for ${input.audience || 'your audience'}.`,
      outline: [
        `Why ${input.topic} matters now`,
        'The audience problem to name first',
        'The carousel angle',
        'The filming script angle',
        'The conversion CTA',
      ],
      aeoQuestions: [
        `What is the best way to create content about ${input.topic}?`,
        `How should ${input.topic} be adapted for social, email, and blog content?`,
      ],
      conversionCta:
        input.cta === 'no_cta' ? 'Save the campaign brief.' : input.cta.replace(/_/g, ' '),
    },
    seoKeywords: [
      input.topic,
      `${input.topic} campaign`,
      `${input.topic} content strategy`,
      `${input.topic} social media`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Stub plan — deterministic, structurally identical to a real plan.
// ---------------------------------------------------------------------------

function stubPlan({
  model,
  campaign,
  goal,
  durationDays,
  cadencePerWeek,
  startDate,
  platforms,
  topics,
  audience,
  brandEntity,
  deliverables,
  contentStyles,
  visualMode,
}: PlanInput): PlanResult {
  const targetCount = Math.max(1, Math.round((durationDays * cadencePerWeek) / 7));
  const stride = Math.max(1, Math.floor(durationDays / targetCount));
  const items: PlanItem[] = [];
  const themes = [
    'Kickoff · introduce the persona',
    'Lifestyle · morning routine',
    'Product first look',
    'Behind-the-scenes B-roll',
    'Engagement · ask the audience',
    'Story · how we got here',
    'Launch day · the drop',
    'Reaction recap',
    'User-generated showcase',
    'Closing CTA / encore',
  ];
  for (let i = 0; i < targetCount; i++) {
    const day = Math.min(durationDays - 1, i * stride);
    const theme = themes[i % themes.length];
    const topic = resolveTopics({ topics, campaign })[
      i % resolveTopics({ topics, campaign }).length
    ];
    const style = resolveStyles({ contentStyles })[i % resolveStyles({ contentStyles }).length];
    const resolvedDeliverables = resolveDeliverables({ deliverables });
    items.push({
      day,
      scheduledAt: computeScheduledAt(startDate, day),
      theme,
      brief: `${theme} — ${model.name} carries the ${campaign} arc around ${topic}. Frame it as a slice of a real day, not an ad.`,
      scene: i % 2 === 0 ? 'rooftop at golden hour' : 'minimalist studio backdrop',
      outfit: model.wizard_input.vibe === 'luxury' ? 'tailored neutrals' : 'streetwear staples',
      props: i === 2 ? 'the product, held casually in frame' : '',
      hook: `Day ${day + 1}: ${theme}.`,
      postGoal: goal,
      lighting: i % 3 === 0 ? 'golden_hour' : i % 3 === 1 ? 'natural' : 'studio',
      platforms,
      format: i % 3 === 0 ? 'portrait' : 'square',
      brandTone: model.wizard_input.vibe === 'luxury' ? 'luxe' : 'casual',
      cta: i === targetCount - 1 ? 'shop_now' : 'no_cta',
      contentPackage: buildContentPackage({
        topic,
        campaign,
        audience,
        brandEntity,
        deliverables: resolvedDeliverables,
        style,
        visualMode,
        cta: i === targetCount - 1 ? 'shop_now' : 'learn_more',
      }),
    });
  }
  return {
    summary: `${targetCount}-post arc for "${campaign}" over ${durationDays} days — placeholder content, OPENAI_STUB=1 active.`,
    items,
  };
}
