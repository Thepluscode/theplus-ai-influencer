import 'server-only';
import { serverEnv } from '@/lib/env';
import type { InfluencerVisuals, InfluencerWizardInput } from '@/types/influencer';
import type { PostBriefInput, PostVariant } from '@/types/post';

/**
 * Deterministic picture URLs that mimic Luma output shape so the whole
 * Studio → Create-post → Calendar flow can run without burning credits.
 *
 * Portraits use pravatar.cc (real-looking face avatars, 1–70 pool).
 * Full-body / scene shots use picsum.photos (generic photos, sized to
 * the requested aspect ratio).
 *
 * Same wizard input ⇒ same images, so a saved model still "matches" itself
 * across the gallery + post composer.
 */

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pravatarUrl(seed: string): string {
  // pravatar.cc has 70 distinct images — wrap into [1, 70].
  const idx = (hashSeed(seed) % 70) + 1;
  return `https://i.pravatar.cc/600?img=${idx}`;
}

function picsumUrl(seed: string, w: number, h: number): string {
  // Use the seed-hash so long seeds can't get truncated and collide.
  const slug = hashSeed(seed).toString(36);
  return `https://picsum.photos/seed/${slug}/${w}/${h}`;
}

const FORMAT_DIMS: Record<PostBriefInput['format'], { w: number; h: number }> = {
  square: { w: 720, h: 720 },
  portrait: { w: 540, h: 960 },
  landscape: { w: 1280, h: 720 },
};

export function stubInfluencerVisuals(input: InfluencerWizardInput): InfluencerVisuals {
  const seed = `${input.name}|${input.gender}|${input.bodyType}|${input.skinTone}|${input.ageRange}|${input.hair}|${input.vibe}|${input.customPrompt}`;
  return {
    portraitUrl: pravatarUrl(seed),
    fullBodyUrl: picsumUrl(`${seed}|fullbody`, 540, 960),
    generationIds: { portrait: `stub_${hashSeed(seed)}_p`, fullBody: `stub_${hashSeed(seed)}_fb` },
  };
}

export function stubPostVariants(
  brief: PostBriefInput,
  modelName: string,
  count = 2,
): PostVariant[] {
  const dims = FORMAT_DIMS[brief.format];
  const baseSeed = `${modelName}|${brief.name}|${brief.brief}|${brief.scene}|${brief.outfit}|${brief.props}|${brief.brandTone}|${brief.cta}|${brief.format}`;
  // Aware that picsum will only return one photo per seed, so vary per-variant.
  return Array.from({ length: count }, (_, i) => {
    const seed = `${baseSeed}|v${i + 1}`;
    return {
      url: picsumUrl(seed, dims.w, dims.h),
      generationId: `stub_${hashSeed(seed)}`,
      generatedAt: new Date().toISOString(),
    };
  });
}

// Used by UI banners to surface "stub mode is on".
export function isLumaStubbed(): boolean {
  return serverEnv.LUMA_STUB === true;
}
