import { z } from 'zod';

// Taxonomy aligned to the InfluencerAI reference (BUILD_PLAN.md §4).
// Skin tones use friendly names; age buckets dropped to the 3 most-used
// brackets; vibe expanded to 8 values (6 new + cinematic/editorial kept
// as legacy so previously-saved models don't break).
//
// Legacy aliases are accepted on read via z.preprocess so existing rows
// from the previous schema don't fail validation when re-loaded — the
// wizard surfaces only the new labels.
const SKIN_TONE_ALIASES: Record<string, string> = {
  light: 'fair',
  'medium-light': 'tan',
  medium: 'olive',
  'medium-dark': 'brown',
  dark: 'deep',
};

const AGE_RANGE_ALIASES: Record<string, string> = {
  '18-25': '18-24',
  '25-35': '25-34',
  // 45-55 + 55+ also accepted as-is below (kept as legacy enum members).
};

export const SKIN_TONES = ['fair', 'tan', 'olive', 'brown', 'deep'] as const;
export const AGE_RANGES = ['18-24', '25-34', '35-45', '45-55', '55+'] as const;
export const VIBES = [
  'minimal',
  'cyber',
  'retro',
  'street',
  'luxury',
  'e-girl',
  'cinematic', // legacy
  'editorial', // legacy
] as const;

const skinTone = z.preprocess(
  (v) => (typeof v === 'string' ? (SKIN_TONE_ALIASES[v] ?? v) : v),
  z.enum(SKIN_TONES),
);

const ageRange = z.preprocess(
  (v) => (typeof v === 'string' ? (AGE_RANGE_ALIASES[v] ?? v) : v),
  z.enum(AGE_RANGES),
);

export const InfluencerWizardInput = z.object({
  name: z.string().min(1, 'Name is required').max(80),
  gender: z.enum(['woman', 'man', 'non-binary']),
  bodyType: z.enum(['slim', 'athletic', 'curvy', 'plus-size']),
  skinTone,
  ageRange,
  hair: z.string().min(1, 'Describe the hair (e.g. "long brown wavy")').max(200),
  vibe: z.enum(VIBES),
  customPrompt: z.string().max(500).default(''),
});

export type InfluencerWizardInput = z.infer<typeof InfluencerWizardInput>;

export interface InfluencerVisuals {
  portraitUrl: string;
  fullBodyUrl: string;
  generationIds: { portrait: string; fullBody: string };
}
