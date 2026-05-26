import { describe, expect, it } from 'vitest';
import {
  buildCarouselCalendarDraft,
  buildCarouselAssetBrief,
  getCarouselAssetTargets,
  getReadyCarouselVariants,
  mergeCarouselDraftPost,
  mergeCarouselAssetResults,
  mergeCarouselReviewLink,
  mergeCarouselScheduledPost,
} from '@/lib/carousel-assets';
import type { PlanItem } from '@/lib/series-planner';

const baseItem: PlanItem = {
  day: 0,
  scheduledAt: '2026-05-20T10:00:00.000Z',
  theme: 'AI compliance launch',
  brief: 'Turn AI compliance into a trust-building campaign for security buyers.',
  scene: 'studio desk with product screenshots',
  outfit: 'black blazer',
  props: 'laptop and compliance checklist',
  hook: 'Compliance is becoming the new growth channel.',
  postGoal: 'awareness',
  lighting: 'cinematic',
  platforms: ['instagram', 'linkedin'],
  format: 'portrait',
  brandTone: 'professional',
  cta: 'learn_more',
  contentPackage: {
    deliverables: ['carousel', 'linkedin_post'],
    style: 'cinematic',
    visualMode: 'face_carousel',
    carouselSlides: [
      {
        title: 'The risk',
        copy: 'Your AI output is only as trusted as your controls.',
        visualBrief: 'high-contrast founder-led portrait with compliance UI in the background',
        facePlacement: 'hero',
      },
      {
        title: 'The fix',
        copy: 'Turn every claim into a proof point.',
        visualBrief: 'clean product screenshot wall with blue verification accents',
        facePlacement: 'supporting',
        asset: {
          status: 'ready',
          url: 'https://example.com/ready.png',
          generationId: 'gen-ready',
          generatedAt: '2026-05-15T12:00:00.000Z',
        },
      },
    ],
    filmingScript: {
      hook: 'Compliance is becoming the new growth channel.',
      beats: ['Name the risk', 'Show the proof'],
      broll: ['dashboard closeup'],
      cta: 'learn more',
    },
    linkedinPost: 'Compliance is becoming the new growth channel.',
    email: {
      subject: 'AI compliance can sell',
      preview: 'Turn controls into proof.',
      body: 'Use compliance as a conversion asset.',
    },
    blog: {
      title: 'AI compliance as a conversion system',
      slug: 'ai-compliance-conversion',
      metaDescription: 'A practical guide.',
      outline: ['Risk', 'Proof'],
      aeoQuestions: ['How do I prove AI compliance?'],
      conversionCta: 'learn more',
    },
    seoKeywords: ['ai compliance'],
  },
};

describe('carousel asset helpers', () => {
  it('targets only unrendered slides unless regeneration is requested', () => {
    expect(getCarouselAssetTargets(baseItem.contentPackage.carouselSlides, 'missing')).toEqual([0]);
    expect(getCarouselAssetTargets(baseItem.contentPackage.carouselSlides, 'regenerate')).toEqual([
      0, 1,
    ]);
  });

  it('builds a valid post brief for a single carousel slide', () => {
    const brief = buildCarouselAssetBrief({
      modelId: '00000000-0000-0000-0000-000000000000',
      item: baseItem,
      slide: baseItem.contentPackage.carouselSlides[0],
      slideIndex: 0,
    });

    expect(brief.name).toBe('AI compliance launch · carousel 1');
    expect(brief.platforms).toEqual(['instagram', 'linkedin']);
    expect(brief.format).toBe('portrait');
    expect(brief.brief).toContain('The risk');
    expect(brief.productRefUrls).toEqual([]);
  });

  it('persists successful slide results without overwriting unrelated slides', () => {
    const [updated] = mergeCarouselAssetResults([baseItem], 0, [
      {
        status: 'ready',
        slideIndex: 0,
        url: 'https://example.com/new.png',
        generationId: 'gen-new',
        generatedAt: '2026-05-15T13:00:00.000Z',
      },
    ]);

    expect(updated.contentPackage.carouselSlides[0].asset).toMatchObject({
      status: 'ready',
      url: 'https://example.com/new.png',
      generationId: 'gen-new',
    });
    expect(updated.contentPackage.carouselSlides[1].asset?.generationId).toBe('gen-ready');
  });

  it('keeps an existing ready asset when a regeneration attempt fails', () => {
    const [updated] = mergeCarouselAssetResults([baseItem], 0, [
      {
        status: 'failed',
        slideIndex: 1,
        error: 'rate limited',
        attemptedAt: '2026-05-15T13:00:00.000Z',
      },
    ]);

    expect(updated.contentPackage.carouselSlides[1].asset).toMatchObject({
      status: 'ready',
      url: 'https://example.com/ready.png',
      lastError: 'rate limited',
    });
  });

  it('builds a calendar draft from ready carousel assets', () => {
    const variants = getReadyCarouselVariants(baseItem.contentPackage.carouselSlides);
    const draft = buildCarouselCalendarDraft({
      modelId: '00000000-0000-0000-0000-000000000000',
      item: baseItem,
    });

    expect(variants).toEqual([
      {
        url: 'https://example.com/ready.png',
        generationId: 'gen-ready',
        generatedAt: '2026-05-15T12:00:00.000Z',
      },
    ]);
    expect(draft.brief.name).toBe('AI compliance launch · carousel draft');
    expect(draft.brief.brief).toContain('Slide 1: The risk');
    expect(draft.caption).toBe('Compliance is becoming the new growth channel.');
  });

  it('records the calendar draft post id on the selected package only', () => {
    const [updated] = mergeCarouselDraftPost([baseItem], 0, {
      postId: 'post-1',
      createdAt: '2026-05-15T14:00:00.000Z',
    });

    expect(updated.contentPackage.calendarDraft).toEqual({
      postId: 'post-1',
      createdAt: '2026-05-15T14:00:00.000Z',
    });
  });

  it('records scheduled package status and preserves the draft pointer', () => {
    const itemWithDraft: PlanItem = {
      ...baseItem,
      contentPackage: {
        ...baseItem.contentPackage,
        calendarDraft: {
          postId: 'post-1',
          createdAt: '2026-05-15T14:00:00.000Z',
        },
      },
    };
    const [updated] = mergeCarouselScheduledPost([itemWithDraft], 0, {
      postId: 'post-1',
      scheduledFor: '2026-05-20T10:00:00.000Z',
      pushedToZernio: false,
      updatedAt: '2026-05-15T15:00:00.000Z',
    });

    expect(updated.contentPackage.calendarDraft?.postId).toBe('post-1');
    expect(updated.contentPackage.scheduledPost).toEqual({
      postId: 'post-1',
      scheduledFor: '2026-05-20T10:00:00.000Z',
      pushedToZernio: false,
      updatedAt: '2026-05-15T15:00:00.000Z',
    });
  });

  it('records a package review link and backfills the draft pointer', () => {
    const [updated] = mergeCarouselReviewLink([baseItem], 0, {
      postId: 'post-reviewed',
      token: 'review-token',
      enabledAt: '2026-05-15T16:00:00.000Z',
    });

    expect(updated.contentPackage.calendarDraft).toEqual({
      postId: 'post-reviewed',
      createdAt: '2026-05-15T16:00:00.000Z',
    });
    expect(updated.contentPackage.reviewLink).toEqual({
      postId: 'post-reviewed',
      token: 'review-token',
      enabledAt: '2026-05-15T16:00:00.000Z',
    });
  });
});
