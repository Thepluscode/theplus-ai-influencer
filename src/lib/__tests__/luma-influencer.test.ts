import { beforeEach, describe, expect, it, vi } from 'vitest';

// Force the real-API branch of generateInfluencerVisuals and route the SDK
// call to a configurable mock.
vi.mock('@/lib/env', () => ({
  serverEnv: { LUMA_STUB: false, LUMA_API_KEY: 'test-key' },
}));
const imageCreate = vi.fn();
vi.mock('@/lib/luma', () => ({
  getLumaClient: () => ({
    generations: { image: { create: imageCreate } },
  }),
}));

import { buildInfluencerPrompts, generateInfluencerVisuals } from '../luma-influencer';
import type { InfluencerWizardInput } from '@/types/influencer';

const baseInput: InfluencerWizardInput = {
  name: 'Aria Vance',
  gender: 'woman',
  bodyType: 'slim',
  skinTone: 'olive',
  ageRange: '25-34',
  hair: 'long brown wavy',
  vibe: 'editorial',
  customPrompt: '',
};

describe('buildInfluencerPrompts', () => {
  it('produces distinct portrait + full-body prompts from the same subject', () => {
    const { portrait, fullBody } = buildInfluencerPrompts(baseInput);
    expect(portrait).not.toBe(fullBody);
    expect(portrait).toMatch(/portrait headshot/i);
    expect(fullBody).toMatch(/full-body fashion shot/i);
  });

  it('encodes every wizard field into the subject string', () => {
    const { portrait } = buildInfluencerPrompts(baseInput);
    expect(portrait).toContain('25 to 34 year old woman');
    expect(portrait).toContain('slim build');
    expect(portrait).toContain('olive skin tone');
    expect(portrait).toContain('long brown wavy hair');
  });

  it('appends the custom prompt when present and skips it when empty', () => {
    const empty = buildInfluencerPrompts(baseInput);
    expect(empty.portrait).not.toMatch(/, brown eyes/);

    const filled = buildInfluencerPrompts({ ...baseInput, customPrompt: 'brown eyes, freckles' });
    expect(filled.portrait).toContain('brown eyes, freckles');
    expect(filled.fullBody).toContain('brown eyes, freckles');
  });

  it('translates each vibe into a different style descriptor', () => {
    const editorial = buildInfluencerPrompts({ ...baseInput, vibe: 'editorial' }).portrait;
    const street = buildInfluencerPrompts({ ...baseInput, vibe: 'street' }).portrait;
    const luxury = buildInfluencerPrompts({ ...baseInput, vibe: 'luxury' }).portrait;
    expect(editorial).not.toBe(street);
    expect(editorial).not.toBe(luxury);
    expect(street).toMatch(/streetwear/i);
    expect(luxury).toMatch(/luxury/i);
  });

  it('ends both prompts with negative-term guards', () => {
    const { portrait, fullBody } = buildInfluencerPrompts(baseInput);
    expect(portrait).toMatch(/no text, no logos/);
    expect(fullBody).toMatch(/no text, no logos/);
    expect(portrait).toMatch(/no warped face/);
  });
});

describe('generateInfluencerVisuals — SDK strictness', () => {
  beforeEach(() => imageCreate.mockReset());

  it('returns visuals when both generations have an image and an id', async () => {
    imageCreate
      .mockResolvedValueOnce({ id: 'gen-p', assets: { image: 'https://example.com/p.png' } })
      .mockResolvedValueOnce({ id: 'gen-fb', assets: { image: 'https://example.com/fb.png' } });

    const result = await generateInfluencerVisuals(baseInput);

    expect(result.portraitUrl).toBe('https://example.com/p.png');
    expect(result.fullBodyUrl).toBe('https://example.com/fb.png');
    expect(result.generationIds.portrait).toBe('gen-p');
    expect(result.generationIds.fullBody).toBe('gen-fb');
  });

  it('throws when the SDK returns an image but no id (no empty-string fallback)', async () => {
    imageCreate
      .mockResolvedValueOnce({ id: 'gen-p', assets: { image: 'https://example.com/p.png' } })
      .mockResolvedValueOnce({ assets: { image: 'https://example.com/fb.png' } }); // missing id

    await expect(generateInfluencerVisuals(baseInput)).rejects.toThrow(/incomplete/i);
  });
});
