import { describe, expect, it, vi } from 'vitest';

// Each shot animates to a 5s clip, so a 30-60s reel needs 6-11 shots (twelve
// export at 60.02s; see storyboard-reel-duration.test.ts). The
// ceiling used to be 6 (30s exactly, the very edge of the target).

vi.mock('@/lib/env', () => ({ serverEnv: { OPENAI_STUB: '1' } }));
vi.mock('@/lib/luma', () => ({ getLumaClient: () => ({}) }));

const { clampShotCount, generateStoryboardScript, MAX_STORYBOARD_SHOTS } =
  await import('@/lib/storyboard');

describe('storyboard shot count', () => {
  it('allows up to 11 shots and clamps outside 3..11', () => {
    expect(MAX_STORYBOARD_SHOTS).toBe(11);
    expect(clampShotCount(11)).toBe(11);
    expect(clampShotCount(12)).toBe(11);
    expect(clampShotCount(2)).toBe(3);
    expect(clampShotCount(Number.NaN)).toBe(4);
  });

  it('returns every requested shot from the stub script, with distinct indices', async () => {
    const script = await generateStoryboardScript({
      brief: 'launch reel',
      format: 'portrait',
      model: { name: 'Ada', wizard_input: {} } as never,
      shotCount: 11,
    });
    expect(script.shots).toHaveLength(11);
    expect(script.shots.map((s) => s.index)).toEqual([...Array(11).keys()]);
  });
});
