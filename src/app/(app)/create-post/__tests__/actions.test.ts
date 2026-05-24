import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostBriefInput } from '@/types/post';

// All imports below need to be mocked BEFORE the action module is imported.
// scheduleAndPublishAction reads `serverEnv.ZERNIO_API_KEY`, calls Supabase
// auth, posts CRUD, workspace bootstrap, and the Zernio client. Other action
// imports (ai-models / captions / credits / luma-post) aren't exercised by
// this function but live at module top-level, so we stub them too to avoid
// transitive server-only / SDK side effects at import time.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/env', () => ({
  serverEnv: { ZERNIO_API_KEY: 'test-zernio-key' },
}));

vi.mock('@/lib/ai-models', () => ({
  listAiModels: vi.fn(),
}));

vi.mock('@/lib/captions', () => ({
  generateCaptions: vi.fn(),
  reformatForPlatforms: vi.fn(),
}));

vi.mock('@/lib/credits', () => ({
  consumeCredits: vi.fn(),
  refundCredits: vi.fn(),
  COSTS: {},
}));

vi.mock('@/lib/luma-post', () => ({
  generatePostVariants: vi.fn(),
}));

// The brand-safety gate is a dependency here — tested in its own unit suite
// (src/lib/__tests__/publish-safety.test.ts). Default it to "pass" so the
// Zernio-path tests below exercise publishing, and override per-test to
// assert how this action reacts to each gate outcome.
const runPublishBrandSafetyGate = vi.fn();
vi.mock('@/lib/publish-safety', () => ({
  runPublishBrandSafetyGate: (...args: unknown[]) => runPublishBrandSafetyGate(...args),
  describeSafetyBlock: (summary: string) => summary,
}));

vi.mock('@/lib/workspace', () => ({
  getOrCreateCurrentWorkspace: vi.fn(async () => ({ id: 'ws-1' })),
}));

const dispatchWorkspaceWebhookEvent = vi.fn();
vi.mock('@/lib/workspace-webhooks', () => ({
  dispatchWorkspaceWebhookEvent: (...args: unknown[]) => dispatchWorkspaceWebhookEvent(...args),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
  })),
}));

const saveDraftPost = vi.fn();
const updatePostSchedule = vi.fn();
const getPostById = vi.fn();
vi.mock('@/lib/posts', () => ({
  saveDraftPost: (...args: unknown[]) => saveDraftPost(...args),
  updatePostSchedule: (...args: unknown[]) => updatePostSchedule(...args),
  getPostById: (...args: unknown[]) => getPostById(...args),
}));

const getDefaultZernioProfileId = vi.fn();
const listAccounts = vi.fn();
const createPost = vi.fn();
const deletePost = vi.fn();
const pickAccountsForPlatforms = vi.fn();
vi.mock('@/lib/zernio', () => ({
  getDefaultZernioProfileId: (...args: unknown[]) => getDefaultZernioProfileId(...args),
  getZernioClient: () => ({ listAccounts, createPost, deletePost }),
  pickAccountsForPlatforms: (...args: unknown[]) => pickAccountsForPlatforms(...args),
}));

// Imported AFTER vi.mock() declarations so the action picks up mocked deps.
import { scheduleAndPublishAction } from '../actions';

const baseBrief: PostBriefInput = {
  modelId: '00000000-0000-0000-0000-000000000000',
  name: 'Energy drink launch',
  platforms: ['instagram'],
  format: 'square',
  productRefUrls: [],
  postGoal: 'launch',
  lighting: 'golden_hour',
  brief: 'Launch the new citrus energy drink.',
  scene: 'rooftop',
  outfit: 'denim jacket',
  props: 'energy drink can',
  brandTone: 'playful',
  cta: 'shop_now',
};

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('brief', JSON.stringify(baseBrief));
  fd.set('variants', JSON.stringify([{ url: 'https://example.com/v1.png' }]));
  fd.set('mode', 'now');
  fd.set('caption', 'hello world');
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  saveDraftPost.mockReset();
  updatePostSchedule.mockReset();
  getPostById.mockReset();
  getDefaultZernioProfileId.mockReset();
  listAccounts.mockReset();
  createPost.mockReset();
  deletePost.mockReset();
  pickAccountsForPlatforms.mockReset();
  dispatchWorkspaceWebhookEvent.mockReset();
  dispatchWorkspaceWebhookEvent.mockResolvedValue({ attempted: 0, delivered: 0, failed: 0 });
  runPublishBrandSafetyGate.mockReset();
  runPublishBrandSafetyGate.mockResolvedValue({ ok: true, note: null });
});

describe('scheduleAndPublishAction — rollback on DB failure after Zernio succeeds', () => {
  it('dispatches scheduled and published webhooks when schedule-now reaches Zernio', async () => {
    saveDraftPost.mockResolvedValue({ id: 'post-1', zernio_post_id: null });
    updatePostSchedule
      .mockResolvedValueOnce({ id: 'post-1' })
      .mockResolvedValueOnce({ id: 'post-1', zernio_post_id: 'zern-remote-1' });

    getDefaultZernioProfileId.mockResolvedValue('profile-1');
    listAccounts.mockResolvedValue([{ _id: 'a1', platform: 'instagram', isActive: true }]);
    pickAccountsForPlatforms.mockReturnValue({
      resolved: [{ _id: 'a1', platform: 'instagram' }],
      missing: [],
    });
    createPost.mockResolvedValue({ _id: 'zern-remote-1' });

    const result = await scheduleAndPublishAction(null, makeFormData());

    expect(result.status).toBe('scheduled');
    expect(dispatchWorkspaceWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        event: 'post.scheduled',
        payload: expect.objectContaining({ postId: 'post-1' }),
      }),
    );
    expect(dispatchWorkspaceWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        event: 'post.published',
        payload: expect.objectContaining({ postId: 'post-1' }),
      }),
    );
  });

  it('calls zernio.deletePost when the zernio_post_id write fails, returns partial', async () => {
    saveDraftPost.mockResolvedValue({ id: 'post-1', zernio_post_id: null });
    updatePostSchedule
      .mockResolvedValueOnce({ id: 'post-1' }) // schedule promotion succeeds
      .mockRejectedValueOnce(new Error('supabase RLS update failed')); // zernioPostId write fails

    getDefaultZernioProfileId.mockResolvedValue('profile-1');
    listAccounts.mockResolvedValue([{ _id: 'a1', platform: 'instagram', isActive: true }]);
    pickAccountsForPlatforms.mockReturnValue({
      resolved: [{ _id: 'a1', platform: 'instagram' }],
      missing: [],
    });
    createPost.mockResolvedValue({ _id: 'zern-remote-1' });
    deletePost.mockResolvedValue(undefined);

    const result = await scheduleAndPublishAction(null, makeFormData());

    expect(createPost).toHaveBeenCalledTimes(1);
    expect(deletePost).toHaveBeenCalledTimes(1);
    expect(deletePost).toHaveBeenCalledWith('zern-remote-1');
    expect(dispatchWorkspaceWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        event: 'post.scheduled',
        payload: expect.objectContaining({ postId: 'post-1' }),
      }),
    );
    expect(result.status).toBe('partial');
    if (result.status === 'partial') {
      expect(result.postId).toBe('post-1');
      expect(result.warning).toMatch(/rolled it back/i);
      expect(result.warning).toMatch(/supabase RLS update failed/);
    }
  });

  it('surfaces a clear warning when both the DB write and the Zernio rollback fail', async () => {
    saveDraftPost.mockResolvedValue({ id: 'post-1', zernio_post_id: null });
    updatePostSchedule
      .mockResolvedValueOnce({ id: 'post-1' })
      .mockRejectedValueOnce(new Error('db down'));

    getDefaultZernioProfileId.mockResolvedValue('profile-1');
    listAccounts.mockResolvedValue([{ _id: 'a1', platform: 'instagram', isActive: true }]);
    pickAccountsForPlatforms.mockReturnValue({
      resolved: [{ _id: 'a1', platform: 'instagram' }],
      missing: [],
    });
    createPost.mockResolvedValue({ _id: 'zern-remote-2' });
    deletePost.mockRejectedValue(new Error('zernio 502'));

    const result = await scheduleAndPublishAction(null, makeFormData());

    expect(deletePost).toHaveBeenCalledWith('zern-remote-2');
    expect(result.status).toBe('partial');
    if (result.status === 'partial') {
      expect(result.warning).toMatch(/zern-remote-2/);
      expect(result.warning).toMatch(/check \/accounts/i);
      expect(result.warning).toMatch(/db down/);
      expect(result.warning).toMatch(/zernio 502/);
    }
  });
});

describe('scheduleAndPublishAction — brand-safety gate', () => {
  beforeEach(() => {
    saveDraftPost.mockResolvedValue({ id: 'post-1', zernio_post_id: null });
    updatePostSchedule.mockResolvedValue({ id: 'post-1' });
    getDefaultZernioProfileId.mockResolvedValue('profile-1');
    listAccounts.mockResolvedValue([{ _id: 'a1', platform: 'instagram', isActive: true }]);
    pickAccountsForPlatforms.mockReturnValue({
      resolved: [{ _id: 'a1', platform: 'instagram' }],
      missing: [],
    });
  });

  it('blocks publish and never calls Zernio when the gate returns blocked', async () => {
    runPublishBrandSafetyGate.mockResolvedValue({
      ok: false,
      reason: 'blocked',
      summary: 'High-severity issue — fix before publishing.',
      issues: [{ severity: 'high', code: 'hate_or_violence', message: 'violent phrasing' }],
    });

    const result = await scheduleAndPublishAction(null, makeFormData());

    expect(createPost).not.toHaveBeenCalled();
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.postId).toBe('post-1');
      expect(result.issues).toHaveLength(1);
      expect(result.summary).toMatch(/fix before publishing/i);
    }
  });

  it('returns insufficient_credits without publishing when the gate cannot be paid', async () => {
    runPublishBrandSafetyGate.mockResolvedValue({
      ok: false,
      reason: 'insufficient_credits',
      balance: 0,
      required: 2,
    });

    const result = await scheduleAndPublishAction(null, makeFormData());

    expect(createPost).not.toHaveBeenCalled();
    expect(result.status).toBe('insufficient_credits');
    if (result.status === 'insufficient_credits') {
      expect(result.postId).toBe('post-1');
      expect(result.required).toBe(2);
    }
  });

  it('surfaces a clear error (and skips Zernio) when the gate check fails', async () => {
    runPublishBrandSafetyGate.mockResolvedValue({
      ok: false,
      reason: 'error',
      error: 'OpenAI 500',
    });

    const result = await scheduleAndPublishAction(null, makeFormData());

    expect(createPost).not.toHaveBeenCalled();
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toMatch(/nothing was published/i);
      expect(result.error).toMatch(/OpenAI 500/);
    }
  });

  it('publishes but attaches a safety note on a warn verdict', async () => {
    runPublishBrandSafetyGate.mockResolvedValue({ ok: true, note: 'Missing #ad disclosure.' });
    updatePostSchedule
      .mockResolvedValueOnce({ id: 'post-1' })
      .mockResolvedValueOnce({ id: 'post-1', zernio_post_id: 'zern-1' });
    createPost.mockResolvedValue({ _id: 'zern-1' });

    const result = await scheduleAndPublishAction(null, makeFormData());

    expect(createPost).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('scheduled');
    if (result.status === 'scheduled') {
      expect(result.safetyNote).toBe('Missing #ad disclosure.');
    }
  });

  it('does not run the gate for a draft (nothing is published)', async () => {
    const result = await scheduleAndPublishAction(null, makeFormData({ mode: 'draft' }));

    expect(runPublishBrandSafetyGate).not.toHaveBeenCalled();
    expect(createPost).not.toHaveBeenCalled();
    expect(result.status).toBe('saved_draft');
  });
});

describe('scheduleAndPublishAction — idempotency via retry postId', () => {
  it('returns scheduled without republishing when the existing row already has a zernio_post_id', async () => {
    getPostById.mockResolvedValue({
      id: 'post-existing',
      zernio_post_id: 'zern-existing',
      scheduled_for: '2026-01-01T12:00:00.000Z',
    });

    const result = await scheduleAndPublishAction(null, makeFormData({ postId: 'post-existing' }));

    expect(getPostById).toHaveBeenCalledWith('post-existing');
    expect(saveDraftPost).not.toHaveBeenCalled();
    expect(updatePostSchedule).not.toHaveBeenCalled();
    expect(createPost).not.toHaveBeenCalled();
    expect(deletePost).not.toHaveBeenCalled();
    expect(dispatchWorkspaceWebhookEvent).not.toHaveBeenCalled();
    expect(result.status).toBe('scheduled');
    if (result.status === 'scheduled') {
      expect(result.postId).toBe('post-existing');
      expect(result.scheduledFor).toBe('2026-01-01T12:00:00.000Z');
      expect(result.pushedToZernio).toBe(true);
    }
  });

  it('returns an error if the retry postId points to a missing row', async () => {
    getPostById.mockResolvedValue(null);

    const result = await scheduleAndPublishAction(null, makeFormData({ postId: 'post-missing' }));

    expect(saveDraftPost).not.toHaveBeenCalled();
    expect(createPost).not.toHaveBeenCalled();
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toMatch(/not found/i);
    }
  });
});
