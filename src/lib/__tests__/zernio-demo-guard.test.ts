import { beforeEach, describe, expect, it, vi } from 'vitest';

// THEPLUS_DEMO_MODE on + a Zernio API key set proves the guard fires on the
// demo-mode check, not on the missing-key check. NODE_ENV defaults to 'test'
// in vitest, so isDemoMode() returns true.
vi.mock('@/lib/env', () => ({
  serverEnv: {
    THEPLUS_DEMO_MODE: true,
    ZERNIO_API_KEY: 'must-not-be-used',
    ZERNIO_API_BASE_URL: 'https://zernio.example.invalid/api/v1',
  },
}));

import { DemoModeBlockedError, getZernioClient } from '@/lib/zernio';

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // Any real fetch call would mean the guard didn't fire — fail loud.
  vi.stubGlobal('fetch', fetchSpy);
});

describe('Zernio demo-mode hard block', () => {
  it('blocks createPost without touching fetch', async () => {
    const zernio = getZernioClient();
    await expect(
      zernio.createPost({
        content: 'should never publish',
        platforms: [{ platform: 'instagram', accountId: 'demo' }],
      }),
    ).rejects.toBeInstanceOf(DemoModeBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks deletePost without touching fetch', async () => {
    const zernio = getZernioClient();
    await expect(zernio.deletePost('demo_post')).rejects.toBeInstanceOf(DemoModeBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks replyToComment without touching fetch', async () => {
    const zernio = getZernioClient();
    await expect(
      zernio.replyToComment({
        zernioPostId: 'demo_post',
        accountId: 'demo_account',
        message: 'should never reply',
      }),
    ).rejects.toBeInstanceOf(DemoModeBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks sendDmReply without touching fetch', async () => {
    const zernio = getZernioClient();
    await expect(
      zernio.sendDmReply({
        conversationId: 'demo_convo',
        accountId: 'demo_account',
        message: 'should never DM',
      }),
    ).rejects.toBeInstanceOf(DemoModeBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
