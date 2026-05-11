import { describe, expect, it } from 'vitest';
import { buildInfluencerPrompts } from '../luma-influencer';
import type { InfluencerWizardInput } from '@/types/influencer';

const baseInput: InfluencerWizardInput = {
  name: 'Aria Vance',
  gender: 'woman',
  bodyType: 'slim',
  skinTone: 'medium',
  ageRange: '25-35',
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
    expect(portrait).toContain('25 to 35 year old woman');
    expect(portrait).toContain('slim build');
    expect(portrait).toContain('medium skin tone');
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
