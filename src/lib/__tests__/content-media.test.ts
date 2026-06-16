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
  isShortFormVideo,
  mediaCostForChannel,
  renderMediaImages,
} from '@/lib/content-media';
import { COSTS } from '@/lib/credits';

describe('aspectForChannel', () => {
  it('maps short-form video to 9:16 and everything else to 1:1', () => {
    expect(aspectForChannel('tiktok_reels')).toBe('9:16');
    expect(aspectForChannel('youtube_short')).toBe('9:16');
    expect(aspectForChannel('instagram_carousel')).toBe('1:1');
  });
});

describe('isShortFormVideo / mediaCostForChannel', () => {
  it('flags only short-form video channels', () => {
    expect(isShortFormVideo('tiktok_reels')).toBe(true);
    expect(isShortFormVideo('youtube_short')).toBe(true);
    expect(isShortFormVideo('instagram_carousel')).toBe(false);
  });

  it('adds the video surcharge only for short-form channels', () => {
    expect(mediaCostForChannel('instagram_carousel')).toBe(COSTS.PACK_MEDIA_RENDER);
    expect(mediaCostForChannel('tiktok_reels')).toBe(
      COSTS.PACK_MEDIA_RENDER + COSTS.PACK_VIDEO_RENDER,
    );
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
