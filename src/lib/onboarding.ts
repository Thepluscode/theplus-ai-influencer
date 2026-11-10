// First-run setup (/welcome). Pure and client-safe. Every answer collected here
// feeds something real: persona answers prefill the Studio wizard, strategy
// answers prefill the campaign planner, experience decides whether the tour
// starts. Nothing is stored server-side — the wizard only builds links, and the
// receiving pages re-validate whatever arrives in the URL.

import { VIBES } from '@/types/influencer';
import { PLATFORMS, type Platform } from '@/types/post';

export const GOALS = [
  { id: 'business', label: 'Build a business', hint: 'Grow and monetise an AI persona' },
  { id: 'content', label: 'Make content', hint: 'Steady posts for your own channels' },
  { id: 'agency', label: 'Run it for clients', hint: 'Personas for brands you manage' },
  { id: 'explore', label: 'Explore', hint: 'See what the studio can do' },
] as const;
export type GoalId = (typeof GOALS)[number]['id'];

export const EXPERIENCE = [
  { id: 'new', label: 'New to AI content' },
  { id: 'some', label: 'Made some AI content' },
  { id: 'pro', label: 'Experienced with AI tools' },
] as const;
export type ExperienceId = (typeof EXPERIENCE)[number]['id'];

/** Niche → a short brief the Studio wizard puts in its custom-prompt field. */
export const NICHES = [
  { id: 'fashion', label: 'Fashion & beauty', brief: 'fashion and beauty creator' },
  { id: 'fitness', label: 'Fitness & health', brief: 'fitness and wellness creator' },
  { id: 'travel', label: 'Travel & lifestyle', brief: 'travel and lifestyle creator' },
  { id: 'tech', label: 'Gaming & tech', brief: 'gaming and tech creator' },
  { id: 'food', label: 'Food & cooking', brief: 'food and home-cooking creator' },
  { id: 'art', label: 'Art & creativity', brief: 'artist and creative' },
  { id: 'business', label: 'Business & finance', brief: 'business and personal-finance creator' },
  { id: 'other', label: 'Something else', brief: '' },
] as const;
export type NicheId = (typeof NICHES)[number]['id'];

/** Vibes the Studio wizard offers today (legacy members excluded). */
export const ONBOARDING_VIBES = VIBES.filter((v) => v !== 'cinematic' && v !== 'editorial');
export type OnboardingVibe = (typeof ONBOARDING_VIBES)[number];

export const CADENCES = [
  { id: 'daily', label: 'Daily', perWeek: 7 },
  { id: 'few', label: '3–4 a week', perWeek: 4 },
  { id: 'weekly', label: 'Weekly', perWeek: 1 },
] as const;
export type CadenceId = (typeof CADENCES)[number]['id'];

/** The platforms the campaign planner and Zernio both handle. */
export const ONBOARDING_PLATFORMS = [
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
] as const satisfies readonly Platform[];

export interface OnboardingAnswers {
  goal: GoalId;
  experience: ExperienceId;
  name: string;
  niche: NicheId;
  vibe: OnboardingVibe;
  platforms: Platform[];
  cadence: CadenceId;
}

export const NAME_MAX = 80;

export function studioPrefillHref(a: Pick<OnboardingAnswers, 'name' | 'niche' | 'vibe'>): string {
  const q = new URLSearchParams();
  if (a.name.trim()) q.set('name', a.name.trim().slice(0, NAME_MAX));
  q.set('niche', a.niche);
  q.set('vibe', a.vibe);
  return `/studio/new?${q.toString()}`;
}

export function campaignPrefillHref(a: Pick<OnboardingAnswers, 'platforms' | 'cadence'>): string {
  const q = new URLSearchParams();
  q.set('cadence', a.cadence);
  if (a.platforms.length) q.set('platforms', a.platforms.join(','));
  return `/series/new?${q.toString()}`;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export interface StudioPrefill {
  name?: string;
  vibe?: OnboardingVibe;
  customPrompt?: string;
}

/** Whitelist-parses the Studio prefill; anything unknown is dropped, not trusted. */
export function parseStudioPrefill(params: Params): StudioPrefill {
  const out: StudioPrefill = {};
  const name = one(params.name)?.trim();
  if (name) out.name = name.slice(0, NAME_MAX);
  const vibe = one(params.vibe);
  if (vibe && (ONBOARDING_VIBES as readonly string[]).includes(vibe))
    out.vibe = vibe as OnboardingVibe;
  const niche = NICHES.find((n) => n.id === one(params.niche));
  if (niche?.brief) out.customPrompt = niche.brief;
  return out;
}

export interface CampaignPrefill {
  cadencePerWeek?: number;
  platforms?: Platform[];
}

export function parseCampaignPrefill(params: Params): CampaignPrefill {
  const out: CampaignPrefill = {};
  const cadence = CADENCES.find((c) => c.id === one(params.cadence));
  if (cadence) out.cadencePerWeek = cadence.perWeek;
  const raw = one(params.platforms);
  if (raw) {
    const known = new Set<string>(PLATFORMS);
    const picked = [...new Set(raw.split(','))].filter((p): p is Platform => known.has(p));
    if (picked.length) out.platforms = picked;
  }
  return out;
}
