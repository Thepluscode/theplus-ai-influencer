import { beforeEach, describe, expect, it, vi } from 'vitest';

// Force the real-API branch of generatePostVariants and route the SDK call
// to a configurable mock.
vi.mock('@/lib/env', () => ({
  serverEnv: { LUMA_STUB: false, LUMA_API_KEY: 'test-key' },
}));
const imageCreate = vi.fn();
vi.mock('@/lib/luma', () => ({
  getLumaClient: () => ({
    generations: { image: { create: imageCreate } },
  }),
}));

import { buildPostPrompt, generatePostVariants } from '../luma-post';
import type { AiModelRow } from '@/lib/supabase/types';
import type { InfluencerWizardInput } from '@/types/influencer';
import type { PostBriefInput } from '@/types/post';

const model: { wizard_input: InfluencerWizardInput; name: string } = {
  name: 'Aria Vance',
  wizard_input: {
    name: 'Aria Vance',
    gender: 'woman',
    bodyType: 'slim',
    skinTone: 'olive',
    ageRange: '25-34',
    hair: 'long brown wavy',
    vibe: 'editorial',
    customPrompt: '',
  },
};

const baseBrief: PostBriefInput = {
  modelId: '00000000-0000-0000-0000-000000000000',
  name: 'Energy drink launch',
  platforms: ['instagram', 'tiktok'],
  format: 'square',
  productRefUrls: [],
  postGoal: 'launch',
  lighting: 'golden_hour',
  brief: 'Launching our new citrus energy drink, target Gen-Z fitness creators.',
  scene: 'rooftop at golden hour',
  outfit: 'cropped denim jacket',
  props: 'holding the energy drink can',
  brandTone: 'playful',
  cta: 'shop_now',
};

describe('buildPostPrompt', () => {
  it('includes the brief verbatim', () => {
    const prompt = buildPostPrompt(baseBrief, model);
    expect(prompt).toContain('Launching our new citrus energy drink');
  });

  it('references the model gender so character_ref has matching cues', () => {
    expect(buildPostPrompt(baseBrief, model)).toContain('the same woman from the reference');
    const manModel = { ...model, wizard_input: { ...model.wizard_input, gender: 'man' as const } };
    expect(buildPostPrompt(baseBrief, manModel)).toContain('the same man');
    const nbModel = {
      ...model,
      wizard_input: { ...model.wizard_input, gender: 'non-binary' as const },
    };
    expect(buildPostPrompt(baseBrief, nbModel)).toContain('androgynous person');
  });

  it('includes scene/outfit/props labels when present and skips them when blank', () => {
    const full = buildPostPrompt(baseBrief, model);
    expect(full).toContain('Scene: rooftop at golden hour');
    expect(full).toContain('Outfit: cropped denim jacket');
    expect(full).toContain('Props: holding the energy drink can');

    const stripped = buildPostPrompt({ ...baseBrief, scene: '', outfit: '', props: '' }, model);
    expect(stripped).not.toContain('Scene:');
    expect(stripped).not.toContain('Outfit:');
    expect(stripped).not.toContain('Props:');
  });

  it('translates each brand tone into a different mood descriptor', () => {
    const playful = buildPostPrompt(baseBrief, model);
    const luxe = buildPostPrompt({ ...baseBrief, brandTone: 'luxe' }, model);
    expect(playful).toMatch(/playful mood/i);
    expect(luxe).toMatch(/luxury aesthetic/i);
    expect(playful).not.toBe(luxe);
  });

  it('translates the CTA into a composition hint', () => {
    const shop = buildPostPrompt(baseBrief, model);
    const dm = buildPostPrompt({ ...baseBrief, cta: 'dm_me' }, model);
    expect(shop).toMatch(/Shop now/i);
    expect(dm).toMatch(/eye contact/i);
  });

  it('always appends negative-term guards', () => {
    const prompt = buildPostPrompt(baseBrief, model);
    expect(prompt).toMatch(/no text, no logos/);
    expect(prompt).toMatch(/no duplicate person/);
  });

  it('includes the chosen format in the opening line', () => {
    expect(buildPostPrompt(baseBrief, model)).toMatch(/square format/);
    expect(buildPostPrompt({ ...baseBrief, format: 'portrait' }, model)).toMatch(/portrait format/);
    expect(buildPostPrompt({ ...baseBrief, format: 'landscape' }, model)).toMatch(/landscape format/);
  });
});

describe('generatePostVariants — SDK strictness', () => {
  // generatePostVariants reads model.name, model.wizard_input.gender, and
  // model.portrait_url. Tests only need those fields.
  const fakeModel = {
    name: 'Aria Vance',
    portrait_url: 'https://example.com/portrait.png',
    wizard_input: model.wizard_input,
  } as unknown as AiModelRow;

  beforeEach(() => imageCreate.mockReset());

  it('returns variants when every result has an image and an id', async () => {
    imageCreate
      .mockResolvedValueOnce({ id: 'gen-v1', assets: { image: 'https://example.com/v1.png' } })
      .mockResolvedValueOnce({ id: 'gen-v2', assets: { image: 'https://example.com/v2.png' } });

    const variants = await generatePostVariants(baseBrief, fakeModel, 2);

    expect(variants).toHaveLength(2);
    expect(variants[0].url).toBe('https://example.com/v1.png');
    expect(variants[0].generationId).toBe('gen-v1');
    expect(variants[1].generationId).toBe('gen-v2');
  });

  it('throws when any variant has an image but no id (no empty-string fallback)', async () => {
    imageCreate
      .mockResolvedValueOnce({ id: 'gen-v1', assets: { image: 'https://example.com/v1.png' } })
      .mockResolvedValueOnce({ assets: { image: 'https://example.com/v2.png' } }); // missing id

    await expect(generatePostVariants(baseBrief, fakeModel, 2)).rejects.toThrow(/incomplete/i);
  });
});
