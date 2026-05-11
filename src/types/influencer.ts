import { z } from 'zod';

export const InfluencerWizardInput = z.object({
  name: z.string().min(1, 'Name is required').max(80),
  gender: z.enum(['woman', 'man', 'non-binary']),
  bodyType: z.enum(['slim', 'athletic', 'curvy', 'plus-size']),
  skinTone: z.enum(['light', 'medium-light', 'medium', 'medium-dark', 'dark']),
  ageRange: z.enum(['18-25', '25-35', '35-45', '45-55', '55+']),
  hair: z.string().min(1, 'Describe the hair (e.g. "long brown wavy")').max(200),
  vibe: z.enum(['street', 'minimal', 'luxury', 'cinematic', 'editorial']),
  customPrompt: z.string().max(500).default(''),
});

export type InfluencerWizardInput = z.infer<typeof InfluencerWizardInput>;

export interface InfluencerVisuals {
  portraitUrl: string;
  fullBodyUrl: string;
  generationIds: { portrait: string; fullBody: string };
}
