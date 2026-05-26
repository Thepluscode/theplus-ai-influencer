import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubInfluencerVisuals, stubPostVariants } from '../luma-stub';
import type { InfluencerWizardInput } from '@/types/influencer';
import type { PostBriefInput } from '@/types/post';

const input: InfluencerWizardInput = {
  name: 'Aria Vance',
  gender: 'woman',
  bodyType: 'slim',
  skinTone: 'olive',
  ageRange: '25-34',
  hair: 'long brown wavy',
  vibe: 'editorial',
  customPrompt: '',
};

const brief: PostBriefInput = {
  modelId: '00000000-0000-0000-0000-000000000000',
  name: 'Energy drink launch',
  platforms: ['instagram'],
  format: 'square',
  productRefUrls: [],
  postGoal: 'engagement',
  lighting: 'natural',
  brief: 'Launching our new citrus energy drink.',
  scene: 'rooftop at golden hour',
  outfit: '',
  props: '',
  brandTone: 'playful',
  cta: 'shop_now',
};

describe('stubInfluencerVisuals', () => {
  // Stub random+user-API access so tests don't depend on network.
  const PORTRAIT_URL = 'https://randomuser.me/api/portraits/men/42.jpg';
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ results: [{ picture: { large: PORTRAIT_URL } }] }), {
            status: 200,
          }),
      ),
    );
  });

  it('returns valid HTTPS URLs for both portrait and full body', async () => {
    const v = await stubInfluencerVisuals(input);
    expect(v.portraitUrl).toMatch(/^https:\/\//);
    expect(v.fullBodyUrl).toMatch(/^https:\/\//);
    expect(v.generationIds.portrait).toMatch(/^stub_/);
    expect(v.generationIds.fullBody).toMatch(/^stub_/);
  });

  it('passes the wizard gender as a randomuser filter (man → male)', async () => {
    const spy = global.fetch as ReturnType<typeof vi.fn>;
    await stubInfluencerVisuals({ ...input, gender: 'man' });
    const calledUrl = spy.mock.calls[0]?.[0] as string;
    expect(calledUrl).toMatch(/gender=male/);
  });

  it('passes the wizard gender as a randomuser filter (woman → female)', async () => {
    const spy = global.fetch as ReturnType<typeof vi.fn>;
    await stubInfluencerVisuals({ ...input, gender: 'woman' });
    const calledUrl = spy.mock.calls[0]?.[0] as string;
    expect(calledUrl).toMatch(/gender=female/);
  });

  it('omits the gender filter for non-binary so randomuser can return either', async () => {
    const spy = global.fetch as ReturnType<typeof vi.fn>;
    await stubInfluencerVisuals({ ...input, gender: 'non-binary' });
    const calledUrl = spy.mock.calls[0]?.[0] as string;
    expect(calledUrl).not.toMatch(/gender=/);
  });

  it('falls back to pravatar when randomuser fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    const v = await stubInfluencerVisuals(input);
    expect(v.portraitUrl).toMatch(/^https:\/\/i\.pravatar\.cc/);
  });

  it('full-body URL is deterministic across calls (picsum-seeded by wizard input)', async () => {
    const a = await stubInfluencerVisuals(input);
    const b = await stubInfluencerVisuals(input);
    expect(a.fullBodyUrl).toBe(b.fullBodyUrl);
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
