import { describe, expect, it } from 'vitest';
import { buildPostPrompt } from '../luma-post';
import type { InfluencerWizardInput } from '@/types/influencer';
import type { PostBriefInput } from '@/types/post';

const model: { wizard_input: InfluencerWizardInput; name: string } = {
  name: 'Aria Vance',
  wizard_input: {
    name: 'Aria Vance',
    gender: 'woman',
    bodyType: 'slim',
    skinTone: 'medium',
    ageRange: '25-35',
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
