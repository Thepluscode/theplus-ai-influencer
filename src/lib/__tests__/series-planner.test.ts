import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  serverEnv: { OPENAI_STUB: true },
}));

import { generateSeriesPlan, type PlanInput } from '@/lib/series-planner';

const input: PlanInput = {
  model: {
    name: 'Ada Vale',
    wizard_input: {
      name: 'Ada Vale',
      gender: 'woman',
      bodyType: 'athletic',
      skinTone: 'deep',
      ageRange: '25-34',
      hair: 'short curls',
      vibe: 'editorial',
      customPrompt: '',
    },
  },
  campaign: 'Turn AI compliance into trust-building creator content.',
  goal: 'awareness',
  durationDays: 14,
  cadencePerWeek: 4,
  startDate: '2026-05-15',
  platforms: ['instagram', 'tiktok', 'facebook', 'linkedin'],
  topics: ['AI compliance', 'creative agents'],
  audience: 'founders and CMOs',
  brandEntity: 'company',
  deliverables: ['carousel', 'filming_script', 'linkedin_post', 'email', 'blog'],
  contentStyles: ['cinematic', 'educational'],
  visualMode: 'face_carousel',
};

describe('generateSeriesPlan content engine output', () => {
  it('returns scheduled multi-format campaign packages in stub mode', async () => {
    const plan = await generateSeriesPlan(input);

    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items[0].scheduledAt).toContain('2026-05');
    expect(plan.items[0].contentPackage.deliverables).toEqual(input.deliverables);
    expect(plan.items[0].contentPackage.carouselSlides[0].facePlacement).toBe('hero');
    expect(plan.items[0].contentPackage.filmingScript.beats.length).toBeGreaterThan(1);
    expect(plan.items[0].contentPackage.linkedinPost).toContain('AI compliance');
    expect(plan.items[0].contentPackage.email.subject).toContain('AI compliance');
    expect(plan.items[0].contentPackage.blog.aeoQuestions.length).toBeGreaterThan(0);
  });
});
