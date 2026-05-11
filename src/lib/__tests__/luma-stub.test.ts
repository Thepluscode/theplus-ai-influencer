import { describe, expect, it } from 'vitest';
import { stubInfluencerVisuals, stubPostVariants } from '../luma-stub';
import type { InfluencerWizardInput } from '@/types/influencer';
import type { PostBriefInput } from '@/types/post';

const input: InfluencerWizardInput = {
  name: 'Aria Vance',
  gender: 'woman',
  bodyType: 'slim',
  skinTone: 'medium',
  ageRange: '25-35',
  hair: 'long brown wavy',
  vibe: 'editorial',
  customPrompt: '',
};

const brief: PostBriefInput = {
  modelId: '00000000-0000-0000-0000-000000000000',
  name: 'Energy drink launch',
  platforms: ['instagram'],
  format: 'square',
  brief: 'Launching our new citrus energy drink.',
  scene: 'rooftop at golden hour',
  outfit: '',
  props: '',
  brandTone: 'playful',
  cta: 'shop_now',
};

describe('stubInfluencerVisuals', () => {
  it('returns valid HTTPS URLs for both portrait and full body', () => {
    const v = stubInfluencerVisuals(input);
    expect(v.portraitUrl).toMatch(/^https:\/\//);
    expect(v.fullBodyUrl).toMatch(/^https:\/\//);
    expect(v.generationIds.portrait).toMatch(/^stub_/);
    expect(v.generationIds.fullBody).toMatch(/^stub_/);
  });

  it('is deterministic — same wizard input produces the same URLs', () => {
    const a = stubInfluencerVisuals(input);
    const b = stubInfluencerVisuals(input);
    expect(a.portraitUrl).toBe(b.portraitUrl);
    expect(a.fullBodyUrl).toBe(b.fullBodyUrl);
  });

  it('changes portrait when wizard input changes', () => {
    const a = stubInfluencerVisuals(input);
    const b = stubInfluencerVisuals({ ...input, hair: 'short blonde pixie' });
    expect(a.portraitUrl).not.toBe(b.portraitUrl);
  });
});

describe('stubPostVariants', () => {
  it('returns the requested number of variants with distinct URLs', () => {
    const variants = stubPostVariants(brief, 'Aria Vance', 3);
    expect(variants).toHaveLength(3);
    const urls = new Set(variants.map((v) => v.url));
    expect(urls.size).toBe(3);
  });

  it('encodes the format dimensions in the URL', () => {
    const square = stubPostVariants(brief, 'Aria', 1)[0].url;
    const portrait = stubPostVariants({ ...brief, format: 'portrait' }, 'Aria', 1)[0].url;
    const landscape = stubPostVariants({ ...brief, format: 'landscape' }, 'Aria', 1)[0].url;
    expect(square).toMatch(/\/720\/720$/);
    expect(portrait).toMatch(/\/540\/960$/);
    expect(landscape).toMatch(/\/1280\/720$/);
  });

  it('is deterministic for the same brief + model name', () => {
    const a = stubPostVariants(brief, 'Aria', 2);
    const b = stubPostVariants(brief, 'Aria', 2);
    expect(a.map((v) => v.url)).toEqual(b.map((v) => v.url));
  });
});
