import 'server-only';
import { serverEnv } from '@/lib/env';
import { getLumaClient } from '@/lib/luma';
import { stubPostVariants } from '@/lib/luma-stub';
import type { AiModelRow } from '@/lib/supabase/types';
import type { InfluencerWizardInput } from '@/types/influencer';
import {
  FORMAT_TO_ASPECT,
  type BrandTone,
  type CTA,
  type LightingStyle,
  type PostBriefInput,
  type PostGoal,
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

const GOAL_HINT: Record<PostGoal, string> = {
  awareness: 'wide framing, recognizable silhouette, scroll-stopping color',
  engagement: 'eye contact, expression that invites a reply',
  launch: 'product foregrounded, hero composition, anticipation energy',
  sales: 'product clearly readable, subject actively using or holding it',
  community: 'warm casual framing, "behind the scenes" feel, low artifice',
};

const LIGHTING_HINT: Record<LightingStyle, string> = {
  natural: 'natural daylight, soft shadows',
  golden_hour: 'golden hour, warm low sun, long shadows, magic-hour glow',
  studio: 'controlled studio lighting, soft key + fill, neutral background',
  neon: 'neon-lit, magenta and cyan ambient color, urban night',
  overcast: 'overcast soft diffuse light, even exposure, cool tones',
  cinematic: 'cinematic lighting, hard rim light, contrasted key',
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
    `Goal: ${GOAL_HINT[input.postGoal]}.`,
    `Lighting: ${LIGHTING_HINT[input.lighting]}.`,
    `Mood: ${tone}.`,
    `Composition: ${ctaHint}.`,
    NEGATIVE_TERMS,
  ]);
}

/**
 * Generates N visual variants for a post in parallel, using the saved model's
 * portrait as `character_ref` to lock the face. Each variant is a fresh Luma
 * call — same prompt, different seeds.
 *
 * If `input.productRefUrl` is set, it's passed as a second `image_ref` so
 * the persona composes the real product into the scene (DTC use case).
 */
export async function generatePostVariants(
  input: PostBriefInput,
  model: AiModelRow,
  variantCount = 2,
): Promise<PostVariant[]> {
  if (serverEnv.LUMA_STUB) {
    return stubPostVariants(input, model.name, variantCount);
  }

  const client = getLumaClient();
  const prompt = buildPostPrompt(input, model);
  const aspect = FORMAT_TO_ASPECT[input.format];

  // Each reference rides at weight 0.5 — strong enough to bias
  // composition, weak enough that the persona's character_ref dominates
  // identity. Multiple refs let the operator stack (e.g. product photo +
  // scene mood board + outfit reference) without over-constraining any
  // single one.
  const imageRef =
    input.productRefUrls.length > 0
      ? input.productRefUrls.map((url) => ({ url, weight: 0.5 }))
      : undefined;

  const calls = Array.from({ length: variantCount }, () =>
    client.generations.image.create({
      model: 'photon-1',
      prompt,
      aspect_ratio: aspect,
      sync: true,
      sync_timeout: 120,
      character_ref: { identity0: { images: [model.portrait_url] } },
      ...(imageRef ? { image_ref: imageRef } : {}),
    }),
  );

  const results = await Promise.all(calls);
  const variants: PostVariant[] = [];

  for (const r of results) {
    const url = r.assets?.image;
    if (!url || !r.id) {
      throw new Error(
        `Luma post variant incomplete: ${r.failure_reason ?? 'no image URL or generation id returned'}`,
      );
    }
    variants.push({
      url,
      generationId: r.id,
      generatedAt: new Date().toISOString(),
    });
  }

  return variants;
}
