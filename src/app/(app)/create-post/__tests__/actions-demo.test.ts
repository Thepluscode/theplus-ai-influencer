import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostBriefInput } from '@/types/post';

const DEMO_MODEL_ID = '00000000-0000-4000-8000-000000000101';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/env', () => ({
  serverEnv: {
    THEPLUS_DEMO_MODE: true,
    ZERNIO_API_KEY: 'must-not-be-used',
    ZERNIO_API_BASE_URL: 'https://zernio.test/api/v1',
  },
}));

const getSupabaseServerClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: (...args: unknown[]) => getSupabaseServerClient(...args),
}));

const listAiModels = vi.fn();
vi.mock('@/lib/ai-models', () => ({
  listAiModels: (...args: unknown[]) => listAiModels(...args),
}));

const consumeCredits = vi.fn();
vi.mock('@/lib/credits', () => ({
  consumeCredits: (...args: unknown[]) => consumeCredits(...args),
  refundCredits: vi.fn(),
  COSTS: {
    POST_VARIANT_RENDER: 25,
    CAPTION_GENERATION: 5,
  },
}));

const generatePostVariants = vi.fn();
vi.mock('@/lib/luma-post', () => ({
  generatePostVariants: (...args: unknown[]) => generatePostVariants(...args),
}));

const generateCaptions = vi.fn();
const reformatForPlatforms = vi.fn();
vi.mock('@/lib/captions', () => ({
  generateCaptions: (...args: unknown[]) => generateCaptions(...args),
  reformatForPlatforms: (...args: unknown[]) => reformatForPlatforms(...args),
}));

const runPublishBrandSafetyGate = vi.fn();
vi.mock('@/lib/publish-safety', () => ({
  runPublishBrandSafetyGate: (...args: unknown[]) => runPublishBrandSafetyGate(...args),
}));

const saveDraftPost = vi.fn();
const updatePostSchedule = vi.fn();
const getPostById = vi.fn();
vi.mock('@/lib/posts', () => ({
  saveDraftPost: (...args: unknown[]) => saveDraftPost(...args),
  updatePostSchedule: (...args: unknown[]) => updatePostSchedule(...args),
  getPostById: (...args: unknown[]) => getPostById(...args),
}));

const getZernioClient = vi.fn();
vi.mock('@/lib/zernio', () => ({
  getDefaultZernioProfileId: vi.fn(),
  getZernioClient: (...args: unknown[]) => getZernioClient(...args),
  pickAccountsForPlatforms: vi.fn(),
}));

vi.mock('@/lib/workspace', () => ({
  getOrCreateCurrentWorkspace: vi.fn(),
}));

vi.mock('@/lib/workspace-webhooks', () => ({
  dispatchWorkspaceWebhookEvent: vi.fn(),
}));

import {
  generateCaptionsAction,
  generatePostVariantsAction,
  reformatCaptionAction,
  scheduleAndPublishAction,
} from '../actions';

const brief: PostBriefInput = {
  modelId: DEMO_MODEL_ID,
  name: 'Demo launch',
  platforms: ['instagram', 'tiktok'],
  format: 'portrait',
  brief: 'Launch a demo campaign.',
  scene: 'rooftop',
  outfit: 'black activewear',
  props: 'citrus can',
  brandTone: 'luxe',
  brandVibe: 'premium',
  brandPalette: 'black and blue',
  cta: 'learn_more',
  productRefUrls: [],
  postGoal: 'launch',
  lighting: 'golden_hour',
};

function generationForm(overrides: Record<string, string | string[]> = {}) {
  const fd = new FormData();
  fd.set('modelId', brief.modelId);
  fd.set('name', brief.name);
  fd.set('format', brief.format);
  fd.set('brief', brief.brief);
  fd.set('scene', brief.scene);
  fd.set('outfit', brief.outfit);
  fd.set('props', brief.props);
  fd.set('brandTone', brief.brandTone);
  fd.set('brandVibe', brief.brandVibe ?? '');
  fd.set('brandPalette', brief.brandPalette ?? '');
  fd.set('cta', brief.cta);
  fd.set('postGoal', brief.postGoal);
  fd.set('lighting', brief.lighting);
  for (const platform of brief.platforms) fd.append('platforms', platform);
  for (const [key, value] of Object.entries(overrides)) {
    fd.delete(key);
    if (Array.isArray(value)) {
      for (const item of value) fd.append(key, item);
    } else {
      fd.set(key, value);
    }
  }
  return fd;
}

function payloadForm(mode = 'now') {
  const fd = new FormData();
  fd.set('brief', JSON.stringify(brief));
  fd.set('variants', JSON.stringify([{ url: 'https://example.com/demo.png' }]));
  fd.set('caption', 'Demo caption');
  fd.set('mode', mode);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('demo create-post actions', () => {
  it('keeps validation active before returning demo variants', async () => {
    const result = await generatePostVariantsAction(null, generationForm({ name: '' }));

    expect(result.status).toBe('error');
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(generatePostVariants).not.toHaveBeenCalled();
  });

  it('returns generated variants without Supabase, credits, or Luma', async () => {
    const result = await generatePostVariantsAction(null, generationForm());

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.variants).toHaveLength(2);
    }
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(consumeCredits).not.toHaveBeenCalled();
    expect(generatePostVariants).not.toHaveBeenCalled();
  });

  it('returns demo captions and platform reformats without OpenAI', async () => {
    const captionsForm = new FormData();
    captionsForm.set('brief', JSON.stringify(brief));
    const captions = await generateCaptionsAction(null, captionsForm);

    const reformatForm = new FormData();
    reformatForm.set('brief', JSON.stringify(brief));
    reformatForm.set('caption', 'Chosen caption');
    reformatForm.set('hashtags', JSON.stringify(['Demo']));
    const reformat = await reformatCaptionAction(null, reformatForm);

    expect(captions.status).toBe('success');
    expect(reformat.status).toBe('success');
    expect(generateCaptions).not.toHaveBeenCalled();
    expect(reformatForPlatforms).not.toHaveBeenCalled();
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('schedules a demo post without Supabase, brand safety, webhooks, or Zernio', async () => {
    const result = await scheduleAndPublishAction(null, payloadForm('now'));

    expect(result.status).toBe('scheduled');
    expect(saveDraftPost).not.toHaveBeenCalled();
    expect(updatePostSchedule).not.toHaveBeenCalled();
    expect(runPublishBrandSafetyGate).not.toHaveBeenCalled();
    expect(getZernioClient).not.toHaveBeenCalled();
  });
});
