import 'server-only';
import { getLumaClient } from '@/lib/luma';
import type { AiModelRow } from '@/lib/supabase/types';
import type { InfluencerWizardInput } from '@/types/influencer';
import {
  FORMAT_TO_ASPECT,
  type BrandTone,
  type CTA,
  type PostBriefInput,
  type PostVariant,
} from '@/types/post';

const TONE_DESCRIPTORS: Record<BrandTone, string> = {
  professional: 'polished, professional brand mood, refined composition',
  casual: 'relaxed candid mood, approachable energy',
  playful: 'fun playful mood, vibrant colors, energetic posing',
  luxe: 'luxury aesthetic, premium materials, glossy magazine finish',
  edgy: 'bold edgy mood, high contrast, fashion-forward styling',
};

const CTA_HINT: Record<CTA, string> = {
  shop_now: 'subject visibly engaging the product so a "Shop now" CTA reads naturally',
  learn_more: 'subject thoughtful, conversation-starter expression',
  sign_up: 'subject welcoming, gesture toward the camera as if inviting in',
  swipe_up: 'subject mid-action with directional motion suitable for a swipe-up frame',
  dm_me: 'intimate close framing, eye contact with the camera',
  no_cta: 'editorial composition, no implied call to action',
};

const NEGATIVE_TERMS =
  'no text, no logos, no watermark, no extra limbs, no deformed hands, no warped face, no plastic skin, no duplicate person';

/** Tiny helper: only joins non-empty parts. */
function joinParts(parts: Array<string | undefined | null>, sep = '. '): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(sep);
}

/**
 * Builds the post-generation prompt. Pure function — easy to unit test, no
 * Luma calls. The model's identity is locked separately via `character_ref`,
 * so we don't repeat the model's appearance in the prompt (avoids
 * over-constraining the scene).
 */
export function buildPostPrompt(
  input: PostBriefInput,
  model: { wizard_input: InfluencerWizardInput; name: string },
): string {
  const subject = `the same ${model.wizard_input.gender === 'non-binary' ? 'androgynous person' : model.wizard_input.gender} from the reference`;
  const scene = input.scene.trim() ? `Scene: ${input.scene.trim()}.` : '';
  const outfit = input.outfit.trim() ? `Outfit: ${input.outfit.trim()}.` : '';
  const props = input.props.trim() ? `Props: ${input.props.trim()}.` : '';
  const tone = TONE_DESCRIPTORS[input.brandTone];
  const ctaHint = CTA_HINT[input.cta];
  const brief = input.brief.trim();

  return joinParts([
    `Hyper-realistic ${input.format} format social media post featuring ${subject}.`,
    `Brief: ${brief}.`,
    scene,
    outfit,
    props,
    `Mood: ${tone}.`,
    `Composition: ${ctaHint}.`,
    NEGATIVE_TERMS,
  ]);
}

/**
 * Generates N visual variants for a post in parallel, using the saved model's
 * portrait as `character_ref` to lock the face. Each variant is a fresh Luma
 * call — same prompt, different seeds.
 */
export async function generatePostVariants(
  input: PostBriefInput,
  model: AiModelRow,
  variantCount = 2,
): Promise<PostVariant[]> {
  const client = getLumaClient();
  const prompt = buildPostPrompt(input, model);
  const aspect = FORMAT_TO_ASPECT[input.format];

  const calls = Array.from({ length: variantCount }, () =>
    client.generations.image.create({
      model: 'photon-1',
      prompt,
      aspect_ratio: aspect,
      sync: true,
      sync_timeout: 120,
      character_ref: { identity0: { images: [model.portrait_url] } },
    }),
  );

  const results = await Promise.all(calls);
  const variants: PostVariant[] = [];

  for (const r of results) {
    const url = r.assets?.image;
    if (!url) {
      throw new Error(
        `Luma post variant incomplete: ${r.failure_reason ?? 'no image URL returned'}`,
      );
    }
    variants.push({
      url,
      generationId: r.id ?? '',
      generatedAt: new Date().toISOString(),
    });
  }

  return variants;
}
