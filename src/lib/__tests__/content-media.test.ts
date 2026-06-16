import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  serverEnv: { LUMA_STUB: true, OPENAI_STUB: true },
}));

// If a real Luma call slipped through, fetch/network would be hit — fail loud.
const fetchSpy = vi.fn(() => {
  throw new Error('renderMediaImages must not hit the network in stub mode');
});
vi.stubGlobal('fetch', fetchSpy);

import {
  MEDIA_IMAGE_CAP,
  aspectForChannel,
  renderMediaImages,
} from '@/lib/content-media';

describe('aspectForChannel', () => {
  it('maps short-form video to 9:16 and everything else to 1:1', () => {
    expect(aspectForChannel('tiktok_reels')).toBe('9:16');
    expect(aspectForChannel('youtube_short')).toBe('9:16');
    expect(aspectForChannel('instagram_carousel')).toBe('1:1');
  });
});

describe('renderMediaImages (LUMA_STUB)', () => {
  const scenes = Array.from({ length: 6 }, (_, i) => ({ direction: `Scene ${i + 1} direction` }));

  it('renders deterministic placeholder URLs without touching the network', async () => {
    const urls = await renderMediaImages(scenes, '1:1');
    expect(urls.length).toBe(MEDIA_IMAGE_CAP);
    expect(urls.every((u) => u.startsWith('https://'))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await renderMediaImages(scenes, '1:1')).toEqual(urls);
  });

  it('returns an empty array when there are no scenes', async () => {
    expect(await renderMediaImages([], '1:1')).toEqual([]);
  });
});
