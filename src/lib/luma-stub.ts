import 'server-only';
import { serverEnv } from '@/lib/env';
import type { InfluencerVisuals, InfluencerWizardInput } from '@/types/influencer';
import type { PostBriefInput, PostVariant } from '@/types/post';

/**
 * Deterministic placeholder URLs that mimic Luma's output shape so the
 * whole Studio → Create-post → Calendar flow can run without burning
 * credits.
 *
 * Portraits — fetched from randomuser.me, which supports both a `gender`
 *   filter and a `seed` parameter, so the stub respects the wizard's
 *   gender selection and stays deterministic across regenerates.
 * Full-body + post variants — picsum.photos (generic seeded photos at
 *   the requested aspect ratio). These are intentionally not on-brief;
 *   the whole reason to swap back to Luma is to get on-brief images.
 */

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function picsumUrl(seed: string, w: number, h: number): string {
  // Hash the seed so long inputs can't get truncated and collide.
  const slug = hashSeed(seed).toString(36);
  return `https://picsum.photos/seed/${slug}/${w}/${h}`;
}

function pravatarFallback(seed: string): string {
  const idx = (hashSeed(seed) % 70) + 1;
  return `https://i.pravatar.cc/600?img=${idx}`;
}

const GENDER_PARAM: Record<InfluencerWizardInput['gender'], string> = {
  woman: 'female',
  man: 'male',
  'non-binary': '', // no filter — randomuser returns either
};

async function randomUserPortrait(
  gender: InfluencerWizardInput['gender'],
  seed: string,
): Promise<string> {
  const params = new URLSearchParams({
    seed: hashSeed(seed).toString(36),
    inc: 'picture',
    nat: 'us,gb,ca,au,fr,de,es,br,nz',
  });
  const g = GENDER_PARAM[gender];
  if (g) params.set('gender', g);

  try {
    const res = await fetch(`https://randomuser.me/api/?${params.toString()}`, {
      // No-store: avoid Next.js caching a stub call as if it were a static asset.
      cache: 'no-store',
      // Don't let a slow randomuser response hang the wizard.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`randomuser ${res.status}`);
    const json = (await res.json()) as {
      results?: Array<{ picture?: { large?: string } }>;
    };
    const url = json.results?.[0]?.picture?.large;
    if (!url) throw new Error('randomuser returned no picture');
    return url;
  } catch (err) {
    // Network blip / rate-limit / API change: fall back to pravatar so the
    // stub never crashes the studio. Gender won't match here, but the flow
    // keeps working. Log so future-dev knows why the stub gender drifted.
    console.warn(
      '[luma-stub] randomuser.me lookup failed, falling back to pravatar (gender will not match):',
      err instanceof Error ? err.message : err,
    );
    return pravatarFallback(seed);
  }
}

const FORMAT_DIMS: Record<PostBriefInput['format'], { w: number; h: number }> = {
  square: { w: 720, h: 720 },
  portrait: { w: 540, h: 960 },
  landscape: { w: 1280, h: 720 },
};

export async function stubInfluencerVisuals(
  input: InfluencerWizardInput,
): Promise<InfluencerVisuals> {
  const seed = `${input.name}|${input.gender}|${input.bodyType}|${input.skinTone}|${input.ageRange}|${input.hair}|${input.vibe}|${input.customPrompt}`;
  const [portraitUrl] = await Promise.all([randomUserPortrait(input.gender, seed)]);
  return {
    portraitUrl,
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
  return Array.from({ length: count }, (_, i) => {
    const seed = `${baseSeed}|v${i + 1}`;
    return {
      url: picsumUrl(seed, dims.w, dims.h),
      generationId: `stub_${hashSeed(seed)}`,
      generatedAt: new Date().toISOString(),
    };
  });
}

export function isLumaStubbed(): boolean {
  return serverEnv.LUMA_STUB === true;
}

/**
 * Deterministic placeholder image for a single storyboard shot. Used
 * during local development when LUMA_STUB=1. Seeds the URL with the
 * model name + shot index so each shot gets a different placeholder.
 */
export function stubStoryboardImage(
  modelName: string,
  shotIndex: number,
  totalShots: number,
): string {
  const seed = encodeURIComponent(`${modelName}-${shotIndex}-${totalShots}`);
  return `https://picsum.photos/seed/${seed}/720/1280`;
}

/**
 * Placeholder video URL used when LUMA_STUB=1. We point at a known
 * CORS-friendly sample so the <video> tag actually plays — no need for
 * the operator to wait for a real Dream Machine render during dev.
 */
export function stubStoryboardVideo(shotIndex: number, totalShots: number): string {
  // Three short public sample clips that cycle by shot index so the
  // operator sees motion variety across the reel during dev.
  const samples = [
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  ];
  void totalShots;
  return samples[shotIndex % samples.length];
}
