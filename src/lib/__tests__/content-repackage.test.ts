import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  serverEnv: { OPENAI_STUB: true },
}));

import { generateContentPack, packResponseToItems } from '@/lib/content-repackage';
import { packResponseSchema } from '@/lib/content-repackage-schema';
import { CHANNELS } from '@/lib/content-sources-schema';

const atoms = [
  { kind: 'hook' as const, text: 'Most creators burn out treating every post as new work.' },
  { kind: 'claim' as const, text: 'Repurposing turns one source into a week of content.' },
  { kind: 'framework' as const, text: 'Capture, extract, reshape, distribute.' },
  { kind: 'proof_point' as const, text: 'Teams ship 5x more without more ideas.' },
  { kind: 'cta' as const, text: 'Drop one source into Content OS.' },
];

describe('generateContentPack (stub)', () => {
  it('returns a valid 10-channel pack', async () => {
    const pack = await generateContentPack({ sourceTitle: 'Repurposing 101', atoms });
    expect(packResponseSchema.safeParse(pack).success).toBe(true);
  });

  it('is deterministic for the same input', async () => {
    const input = { sourceTitle: 'Repurposing 101', atoms };
    expect(await generateContentPack(input)).toEqual(await generateContentPack(input));
  });

  it('preserves the source message across channels (no fabrication of new topic)', async () => {
    const pack = await generateContentPack({ sourceTitle: 'Repurposing 101', atoms });
    expect(pack.linkedin.body).toContain('Most creators burn out');
  });
});

describe('packResponseToItems', () => {
  it('flattens into one item per channel with matching keys', async () => {
    const pack = await generateContentPack({ sourceTitle: 'Repurposing 101', atoms });
    const items = packResponseToItems(pack);
    expect(items).toHaveLength(CHANNELS.length);
    expect(items.map((i) => i.channel).sort()).toEqual(CHANNELS.map((c) => c.key).sort());
    for (const item of items) {
      expect(item.body).toBeDefined();
      expect(item.format.length).toBeGreaterThan(0);
    }
  });
});
