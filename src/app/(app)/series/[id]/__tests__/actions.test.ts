import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanItem } from '@/lib/series-planner';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/env', () => ({
  serverEnv: { ZERNIO_API_KEY: undefined },
}));

const listAiModels = vi.fn();
vi.mock('@/lib/ai-models', () => ({
  listAiModels: (...args: unknown[]) => listAiModels(...args),
}));

const getContentPlan = vi.fn();
const updateContentPlanItems = vi.fn();
vi.mock('@/lib/content-plans', () => ({
  getContentPlan: (...args: unknown[]) => getContentPlan(...args),
  updateContentPlanItems: (...args: unknown[]) => updateContentPlanItems(...args),
}));

vi.mock('@/lib/credits', () => ({
  consumeCredits: vi.fn(),
  refundCredits: vi.fn(),
  COSTS: { POST_VARIANT_RENDER: 25 },
}));

vi.mock('@/lib/luma-post', () => ({
  generatePostVariants: vi.fn(),
}));

const getPostById = vi.fn();
const saveDraftPost = vi.fn();
const updatePostSchedule = vi.fn();
const enablePostSharing = vi.fn();
vi.mock('@/lib/posts', () => ({
  enablePostSharing: (...args: unknown[]) => enablePostSharing(...args),
  getPostById: (...args: unknown[]) => getPostById(...args),
  saveDraftPost: (...args: unknown[]) => saveDraftPost(...args),
  updatePostSchedule: (...args: unknown[]) => updatePostSchedule(...args),
}));

const dispatchWorkspaceWebhookEvent = vi.fn();
vi.mock('@/lib/workspace-webhooks', () => ({
  dispatchWorkspaceWebhookEvent: (...args: unknown[]) => dispatchWorkspaceWebhookEvent(...args),
}));

vi.mock('@/lib/zernio', () => ({
  getDefaultZernioProfileId: vi.fn(),
  getZernioClient: vi.fn(),
  pickAccountsForPlatforms: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
  })),
}));

vi.mock('@/lib/workspace', () => ({
  getOrCreateCurrentWorkspace: vi.fn(async () => ({ id: 'ws-1' })),
}));

import {
  createCarouselCalendarDraftAction,
  sendCarouselPackageToReviewAction,
  scheduleCarouselRecommendedSlotAction,
} from '../actions';

const baseItem: PlanItem = {
  day: 0,
  scheduledAt: '2026-05-20T10:00:00.000Z',
  theme: 'AI compliance launch',
  brief: 'Turn compliance into visible buyer proof.',
  scene: 'dark product studio',
  outfit: 'black blazer',
  props: 'laptop and checklist',
  hook: 'Compliance can sell.',
  postGoal: 'awareness',
  lighting: 'cinematic',
  platforms: ['instagram', 'linkedin'],
  format: 'portrait',
  brandTone: 'professional',
  cta: 'learn_more',
  contentPackage: {
    deliverables: ['carousel'],
    style: 'cinematic',
    visualMode: 'face_carousel',
    carouselSlides: [
      {
        title: 'Proof beats promises',
        copy: 'Show buyers the controls behind the claim.',
        visualBrief: 'dark studio with blue compliance panels',
        facePlacement: 'hero',
        asset: {
          status: 'ready',
          url: 'https://example.com/slide-1.png',
          generationId: 'gen-1',
          generatedAt: '2026-05-15T14:00:00.000Z',
        },
      },
    ],
    filmingScript: {
      hook: 'Compliance can sell.',
      beats: ['Name the trust gap'],
      broll: ['dashboard closeup'],
      cta: 'learn more',
    },
    linkedinPost: 'AI compliance becomes useful when buyers can see the proof.',
    email: {
      subject: 'Show the proof',
      preview: 'Make compliance visible.',
      body: 'Turn controls into proof.',
    },
    blog: {
      title: 'AI compliance proof',
      slug: 'ai-compliance-proof',
      metaDescription: 'How to show the proof.',
      outline: ['Trust gap'],
      aeoQuestions: ['How do I prove AI compliance?'],
      conversionCta: 'learn more',
    },
    seoKeywords: ['ai compliance'],
  },
};

function formData() {
  const fd = new FormData();
  fd.set('planId', '11111111-1111-4111-8111-111111111111');
  fd.set('itemIndex', '0');
  return fd;
}

beforeEach(() => {
  getContentPlan.mockReset();
  updateContentPlanItems.mockReset();
  listAiModels.mockReset();
  getPostById.mockReset();
  saveDraftPost.mockReset();
  updatePostSchedule.mockReset();
  enablePostSharing.mockReset();
  dispatchWorkspaceWebhookEvent.mockReset();
  dispatchWorkspaceWebhookEvent.mockResolvedValue({ attempted: 0, delivered: 0, failed: 0 });
});

describe('createCarouselCalendarDraftAction', () => {
  it('creates a draft post from ready carousel assets and records the draft id', async () => {
    getContentPlan.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      workspace_id: 'ws-1',
      model_id: '22222222-2222-4222-8222-222222222222',
      items: [baseItem],
    });
    saveDraftPost.mockResolvedValue({ id: 'post-1' });
    updateContentPlanItems.mockResolvedValue({});

    const result = await createCarouselCalendarDraftAction(null, formData());

    expect(result).toEqual({ status: 'saved', postId: 'post-1', reused: false });
    expect(saveDraftPost).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        caption: 'AI compliance becomes useful when buyers can see the proof.',
        variants: [
          {
            url: 'https://example.com/slide-1.png',
            generationId: 'gen-1',
            generatedAt: '2026-05-15T14:00:00.000Z',
          },
        ],
      }),
    );
    expect(updateContentPlanItems).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.arrayContaining([
        expect.objectContaining({
          contentPackage: expect.objectContaining({
            calendarDraft: expect.objectContaining({ postId: 'post-1' }),
          }),
        }),
      ]),
    );
  });

  it('reuses an existing recorded draft when it still belongs to the workspace', async () => {
    getContentPlan.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      workspace_id: 'ws-1',
      model_id: '22222222-2222-4222-8222-222222222222',
      items: [
        {
          ...baseItem,
          contentPackage: {
            ...baseItem.contentPackage,
            calendarDraft: {
              postId: 'post-existing',
              createdAt: '2026-05-15T15:00:00.000Z',
            },
          },
        },
      ],
    });
    getPostById.mockResolvedValue({ id: 'post-existing', workspace_id: 'ws-1' });

    const result = await createCarouselCalendarDraftAction(null, formData());

    expect(result).toEqual({ status: 'saved', postId: 'post-existing', reused: true });
    expect(saveDraftPost).not.toHaveBeenCalled();
    expect(updateContentPlanItems).not.toHaveBeenCalled();
  });
});

describe('scheduleCarouselRecommendedSlotAction', () => {
  it('creates a package post when needed and schedules it to the recommended slot', async () => {
    getContentPlan.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      workspace_id: 'ws-1',
      model_id: '22222222-2222-4222-8222-222222222222',
      items: [baseItem],
    });
    saveDraftPost.mockResolvedValue({
      id: 'post-1',
      workspace_id: 'ws-1',
      caption: 'AI compliance becomes useful when buyers can see the proof.',
      zernio_post_id: null,
    });
    updatePostSchedule.mockResolvedValue({
      id: 'post-1',
      workspace_id: 'ws-1',
      name: 'AI compliance launch · carousel draft',
      caption: 'AI compliance becomes useful when buyers can see the proof.',
      platforms: ['instagram', 'linkedin'],
      variants: [{ url: 'https://example.com/slide-1.png' }],
    });
    updateContentPlanItems.mockResolvedValue({});

    const result = await scheduleCarouselRecommendedSlotAction(null, formData());

    expect(result).toEqual({
      status: 'partial',
      postId: 'post-1',
      scheduledFor: '2026-05-20T10:00:00.000Z',
      warning: 'ZERNIO_API_KEY not configured — scheduled locally only.',
    });
    expect(updatePostSchedule).toHaveBeenCalledWith(
      'post-1',
      new Date('2026-05-20T10:00:00.000Z'),
      expect.objectContaining({
        caption: 'AI compliance becomes useful when buyers can see the proof.',
      }),
    );
    expect(updateContentPlanItems).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.arrayContaining([
        expect.objectContaining({
          contentPackage: expect.objectContaining({
            scheduledPost: expect.objectContaining({
              postId: 'post-1',
              scheduledFor: '2026-05-20T10:00:00.000Z',
            }),
          }),
        }),
      ]),
    );
    expect(dispatchWorkspaceWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        event: 'post.scheduled',
      }),
    );
  });

  it('reuses an already recorded scheduled post', async () => {
    getContentPlan.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      workspace_id: 'ws-1',
      model_id: '22222222-2222-4222-8222-222222222222',
      items: [
        {
          ...baseItem,
          contentPackage: {
            ...baseItem.contentPackage,
            scheduledPost: {
              postId: 'post-scheduled',
              scheduledFor: '2026-05-20T10:00:00.000Z',
              pushedToZernio: false,
              updatedAt: '2026-05-15T15:00:00.000Z',
            },
          },
        },
      ],
    });
    getPostById.mockResolvedValue({
      id: 'post-scheduled',
      workspace_id: 'ws-1',
      scheduled_for: '2026-05-20T10:00:00.000Z',
      zernio_post_id: null,
    });

    const result = await scheduleCarouselRecommendedSlotAction(null, formData());

    expect(result).toEqual({
      status: 'scheduled',
      postId: 'post-scheduled',
      scheduledFor: '2026-05-20T10:00:00.000Z',
      pushedToZernio: false,
      reused: true,
    });
    expect(saveDraftPost).not.toHaveBeenCalled();
    expect(updatePostSchedule).not.toHaveBeenCalled();
  });
});

describe('sendCarouselPackageToReviewAction', () => {
  it('enables sharing for an existing package post and records the review link', async () => {
    getContentPlan.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      workspace_id: 'ws-1',
      model_id: '22222222-2222-4222-8222-222222222222',
      items: [
        {
          ...baseItem,
          contentPackage: {
            ...baseItem.contentPackage,
            scheduledPost: {
              postId: 'post-scheduled',
              scheduledFor: '2026-05-20T10:00:00.000Z',
              pushedToZernio: false,
              updatedAt: '2026-05-15T15:00:00.000Z',
            },
          },
        },
      ],
    });
    getPostById.mockResolvedValue({
      id: 'post-scheduled',
      workspace_id: 'ws-1',
      share_token: null,
    });
    enablePostSharing.mockResolvedValue('review-token');
    updateContentPlanItems.mockResolvedValue({});

    const result = await sendCarouselPackageToReviewAction(null, formData());

    expect(result).toEqual({
      status: 'ready',
      postId: 'post-scheduled',
      token: 'review-token',
      reused: false,
    });
    expect(enablePostSharing).toHaveBeenCalledWith('post-scheduled');
    expect(saveDraftPost).not.toHaveBeenCalled();
    expect(updateContentPlanItems).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.arrayContaining([
        expect.objectContaining({
          contentPackage: expect.objectContaining({
            calendarDraft: expect.objectContaining({ postId: 'post-scheduled' }),
            reviewLink: expect.objectContaining({
              postId: 'post-scheduled',
              token: 'review-token',
            }),
          }),
        }),
      ]),
    );
  });

  it('reuses a recorded review link while the post share token is still enabled', async () => {
    getContentPlan.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      workspace_id: 'ws-1',
      model_id: '22222222-2222-4222-8222-222222222222',
      items: [
        {
          ...baseItem,
          contentPackage: {
            ...baseItem.contentPackage,
            reviewLink: {
              postId: 'post-reviewed',
              token: 'review-token',
              enabledAt: '2026-05-15T16:00:00.000Z',
            },
          },
        },
      ],
    });
    getPostById.mockResolvedValue({
      id: 'post-reviewed',
      workspace_id: 'ws-1',
      share_token: 'review-token',
    });

    const result = await sendCarouselPackageToReviewAction(null, formData());

    expect(result).toEqual({
      status: 'ready',
      postId: 'post-reviewed',
      token: 'review-token',
      reused: true,
    });
    expect(enablePostSharing).not.toHaveBeenCalled();
    expect(updateContentPlanItems).not.toHaveBeenCalled();
  });
});
