import 'server-only';
import { serverEnv } from '@/lib/env';
import { getLumaClient } from '@/lib/luma';
import { stubInfluencerVisuals } from '@/lib/luma-stub';
import type { InfluencerVisuals, InfluencerWizardInput } from '@/types/influencer';

const VIBE_DESCRIPTORS: Record<InfluencerWizardInput['vibe'], string> = {
  street: 'streetwear styling, urban backdrop, candid composition',
  minimal: 'minimal styling, clean studio backdrop, soft diffused lighting',
  luxury: 'luxury fashion editorial, premium fabrics, refined glamour',
  cinematic: 'cinematic color grade, film grain, moody key light',
  editorial: 'high-fashion editorial, magazine cover composition',
};

const GENDER_NOUN: Record<InfluencerWizardInput['gender'], string> = {
  woman: 'woman',
  man: 'man',
  'non-binary': 'androgynous person',
};

const NEGATIVE_TERMS =
  'no text, no logos, no watermark, no extra limbs, no deformed hands, no warped face, no plastic skin';

/**
 * Builds the two prompts (portrait + full body) for a single influencer model.
 * Pure function — easy to unit test, no Luma calls.
 */
export function buildInfluencerPrompts(input: InfluencerWizardInput): {
  portrait: string;
  fullBody: string;
} {
  const subject = `${input.ageRange.replace('-', ' to ')} year old ${GENDER_NOUN[input.gender]}, ${input.bodyType} build, ${input.skinTone} skin tone, ${input.hair} hair`;
  const style = VIBE_DESCRIPTORS[input.vibe];
  const extra = input.customPrompt.trim() ? `, ${input.customPrompt.trim()}` : '';

  const portrait = `Hyper-realistic portrait headshot of a ${subject}${extra}. ${style}. Sharp focus on face, professional skin retouching, natural micro-expressions. ${NEGATIVE_TERMS}.`;
  const fullBody = `Hyper-realistic full-body fashion shot of a ${subject}${extra}. ${style}. Standing pose, full figure visible head to toe, environment-aware framing. ${NEGATIVE_TERMS}.`;

  return { portrait, fullBody };
}

/**
 * Generates portrait + full-body visuals for an AI influencer model in parallel.
 * Uses Luma's `sync: true` so the call blocks until the images are ready —
 * no polling required. Both calls share the same `model` and `aspect_ratio`
 * so the two outputs feel like the same person from two angles.
 *
 * Throws if LUMA_API_KEY is missing or if either generation fails.
 */
export async function generateInfluencerVisuals(
  input: InfluencerWizardInput,
): Promise<InfluencerVisuals> {
  if (serverEnv.LUMA_STUB) {
    return await stubInfluencerVisuals(input);
  }

  const client = getLumaClient();
  const prompts = buildInfluencerPrompts(input);

  const [portrait, fullBody] = await Promise.all([
    client.generations.image.create({
      model: 'photon-1',
      prompt: prompts.portrait,
      aspect_ratio: '3:4',
      sync: true,
      sync_timeout: 120,
    }),
    client.generations.image.create({
      model: 'photon-1',
      prompt: prompts.fullBody,
      aspect_ratio: '9:16',
      sync: true,
      sync_timeout: 120,
    }),
  ]);

  const portraitUrl = portrait.assets?.image;
  const fullBodyUrl = fullBody.assets?.image;

  if (!portraitUrl || !fullBodyUrl) {
    const reason =
      portrait.failure_reason ?? fullBody.failure_reason ?? 'Luma returned no image URL';
    throw new Error(`Luma generation incomplete: ${reason}`);
  }

  return {
    portraitUrl,
    fullBodyUrl,
    generationIds: {
      portrait: portrait.id ?? '',
      fullBody: fullBody.id ?? '',
    },
  };
}
