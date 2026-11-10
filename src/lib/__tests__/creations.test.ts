import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({ serverEnv: { LUMA_STUB: false } }));

const imageCreate = vi.fn();
vi.mock('@/lib/luma', () => ({
  getLumaClient: () => ({
    generations: { image: { create: (...a: unknown[]) => imageCreate(...a) } },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn() }));

import { buildRenderRequest, renderCreation, toCreationView } from '../creations';

const persona = { portrait_url: 'https://cdn.test/aria-portrait.jpg' };

describe('buildRenderRequest', () => {
  it('locks the mentioned persona through character_ref and strips the handle', () => {
    const req = buildRenderRequest({
      mode: 'picture',
      prompt: '@aria-vance on a rooftop at golden hour',
      aspect: '9:16',
      persona,
    });
    expect(req.character_ref).toEqual({ identity0: { images: [persona.portrait_url] } });
    expect(req.prompt).not.toContain('@aria-vance');
    expect(req.prompt).toContain('the person from the reference on a rooftop at golden hour');
    expect(req.aspect_ratio).toBe('9:16');
    expect(req.model).toBe('photon-1');
    expect(req).not.toHaveProperty('modify_image_ref');
  });

  it('sends no character_ref when no persona is mentioned', () => {
    const req = buildRenderRequest({
      mode: 'picture',
      prompt: 'a quiet beach',
      aspect: '1:1',
      persona: null,
    });
    expect(req).not.toHaveProperty('character_ref');
  });

  it('edits the source image at full weight and keeps the face lock', () => {
    const req = buildRenderRequest({
      mode: 'edit',
      prompt: 'make the jacket red',
      aspect: '3:4',
      persona,
      sourceUrl: 'https://cdn.test/source.jpg',
    });
    expect(req.modify_image_ref).toEqual({ url: 'https://cdn.test/source.jpg', weight: 1 });
    expect(req.character_ref).toBeDefined();
    expect(req.prompt).toMatch(/Keep everything else in the image unchanged/);
  });

  it('refuses an edit with no source', () => {
    expect(() =>
      buildRenderRequest({ mode: 'edit', prompt: 'x', aspect: '3:4', persona: null }),
    ).toThrow(/source image/);
  });
});

describe('renderCreation', () => {
  beforeEach(() => imageCreate.mockReset());

  it('sends exactly the built request to Luma and returns the asset', async () => {
    imageCreate.mockResolvedValue({ id: 'gen_1', assets: { image: 'https://cdn.test/out.jpg' } });
    const req = {
      mode: 'picture' as const,
      prompt: '@aria-vance smiling',
      aspect: '3:4' as const,
      persona,
    };
    await expect(renderCreation(req)).resolves.toEqual({
      url: 'https://cdn.test/out.jpg',
      generationId: 'gen_1',
    });
    expect(imageCreate).toHaveBeenCalledTimes(1);
    expect(imageCreate).toHaveBeenCalledWith(buildRenderRequest(req));
  });

  it('throws when Luma returns no image, so the caller refunds', async () => {
    imageCreate.mockResolvedValue({ id: 'gen_2', failure_reason: 'moderation' });
    await expect(
      renderCreation({ mode: 'picture', prompt: 'x', aspect: '1:1', persona: null }),
    ).rejects.toThrow(/moderation/);
  });
});

describe('toCreationView', () => {
  const base = {
    id: 'c2',
    workspace_id: 'ws_1',
    mode: 'edit' as const,
    prompt: 'red jacket',
    persona_id: 'p1',
    aspect_ratio: '3:4' as const,
    asset_url: 'https://cdn.test/c2.jpg',
    generation_id: 'gen_2',
    credits_spent: 25,
    created_at: '2026-11-10T12:00:00.000Z',
  };

  it('carries the source id the Canvas draws its edge from', () => {
    const view = toCreationView({ ...base, source_creation_id: 'c1' }, [
      { id: 'p1', name: 'Aria' },
    ]);
    expect(view).toMatchObject({ sourceCreationId: 'c1', personaName: 'Aria', saved: true });
  });

  it('maps a picture (no source) to null', () => {
    expect(toCreationView({ ...base, source_creation_id: null }, []).sourceCreationId).toBeNull();
  });
});
