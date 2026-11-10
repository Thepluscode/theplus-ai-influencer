import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/env', () => ({ serverEnv: { THEPLUS_DEMO_MODE: false, LUMA_STUB: false } }));

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/workspace', () => ({
  getOrCreateCurrentWorkspace: async () => ({ id: 'ws_1' }),
}));

const listAiModels = vi.fn();
vi.mock('@/lib/ai-models', () => ({ listAiModels: (...a: unknown[]) => listAiModels(...a) }));

const consumeCredits = vi.fn();
const refundCredits = vi.fn();
vi.mock('@/lib/credits', () => ({
  consumeCredits: (...a: unknown[]) => consumeCredits(...a),
  refundCredits: (...a: unknown[]) => refundCredits(...a),
  COSTS: { CREATE_PICTURE: 25, CREATE_EDIT: 25 },
}));

const renderCreation = vi.fn();
const insertCreation = vi.fn();
const getCreation = vi.fn();
vi.mock('@/lib/creations', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/creations')>()),
  renderCreation: (...a: unknown[]) => renderCreation(...a),
  insertCreation: (...a: unknown[]) => insertCreation(...a),
  getCreation: (...a: unknown[]) => getCreation(...a),
}));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock('@/lib/luma', () => ({ getLumaClient: vi.fn() }));

import { createAction } from '../actions';

const ARIA = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Aria Vance',
  portrait_url: 'https://cdn.test/aria.jpg',
};
const SOURCE_ID = '22222222-2222-4222-8222-222222222222';

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function rowFrom(record: Record<string, unknown>) {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    mode: record.mode,
    prompt: record.prompt,
    persona_id: record.personaId,
    source_creation_id: record.sourceCreationId,
    aspect_ratio: record.aspect,
    asset_url: record.assetUrl,
    generation_id: record.generationId,
    credits_spent: record.creditsSpent,
    created_at: '2026-11-10T12:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  listAiModels.mockResolvedValue([ARIA]);
  consumeCredits.mockResolvedValue({ ok: true, balanceAfter: 975 });
  renderCreation.mockResolvedValue({ url: 'https://cdn.test/out.jpg', generationId: 'gen_1' });
  insertCreation.mockImplementation(async (r: Record<string, unknown>) => rowFrom(r));
});

describe('createAction — picture', () => {
  it('charges, renders with the mentioned persona, and records under one ref', async () => {
    const res = await createAction(
      null,
      form({ mode: 'picture', prompt: '@aria-vance at dusk', aspect: '9:16' }),
    );
    expect(res).toMatchObject({
      status: 'success',
      creation: {
        personaName: 'Aria Vance',
        saved: true,
        creditsSpent: 25,
        sourceCreationId: null,
      },
    });

    const charge = consumeCredits.mock.calls[0][0];
    expect(charge).toMatchObject({
      workspaceId: 'ws_1',
      amount: 25,
      reason: 'post_variant_render',
      refKind: 'creation',
    });
    expect(renderCreation.mock.calls[0][0]).toMatchObject({
      mode: 'picture',
      aspect: '9:16',
      persona: ARIA,
    });
    expect(insertCreation.mock.calls[0][0]).toMatchObject({
      id: charge.refId,
      personaId: ARIA.id,
      creditsSpent: 25,
    });
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it('refuses an unknown handle before any credit moves', async () => {
    const res = await createAction(null, form({ mode: 'picture', prompt: '@nova at dusk' }));
    expect(res).toMatchObject({
      status: 'error',
      fieldErrors: { prompt: expect.stringContaining('@nova') },
    });
    expect(consumeCredits).not.toHaveBeenCalled();
    expect(renderCreation).not.toHaveBeenCalled();
  });

  it('does not render when credits are short', async () => {
    consumeCredits.mockResolvedValue({ ok: false, insufficient: true, balance: 10, required: 25 });
    const res = await createAction(null, form({ mode: 'picture', prompt: 'a beach' }));
    expect(res).toEqual({ status: 'insufficient_credits', balance: 10, required: 25 });
    expect(renderCreation).not.toHaveBeenCalled();
  });

  it('refunds with the same ref when the render fails', async () => {
    renderCreation.mockRejectedValue(new Error('Luma render incomplete: moderation'));
    const res = await createAction(null, form({ mode: 'picture', prompt: '@aria-vance at dusk' }));
    expect(res).toEqual({ status: 'error', error: 'Luma render incomplete: moderation' });
    const charge = consumeCredits.mock.calls[0][0];
    expect(refundCredits).toHaveBeenCalledWith({
      workspaceId: 'ws_1',
      amount: 25,
      refKind: 'creation',
      refId: charge.refId,
    });
    expect(insertCreation).not.toHaveBeenCalled();
  });

  it('returns the paid asset unsaved when recording fails, without refunding', async () => {
    insertCreation.mockRejectedValue(new Error('db down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await createAction(null, form({ mode: 'picture', prompt: 'a beach' }));
    expect(res).toMatchObject({
      status: 'success',
      creation: { assetUrl: 'https://cdn.test/out.jpg', saved: false },
    });
    expect(refundCredits).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('uses a fresh ref for every attempt', async () => {
    await createAction(null, form({ mode: 'picture', prompt: 'a beach' }));
    await createAction(null, form({ mode: 'picture', prompt: 'a beach' }));
    const [a, b] = consumeCredits.mock.calls.map((c) => c[0].refId);
    expect(a).not.toBe(b);
  });
});

describe('createAction — edit', () => {
  it('edits a source loaded from this workspace by id', async () => {
    getCreation.mockResolvedValue({ id: SOURCE_ID, asset_url: 'https://cdn.test/source.jpg' });
    const res = await createAction(
      null,
      form({ mode: 'edit', prompt: 'red jacket', aspect: '3:4', sourceCreationId: SOURCE_ID }),
    );
    expect(res).toMatchObject({
      status: 'success',
      // The Canvas draws this result as a child of its source.
      creation: { mode: 'edit', sourceCreationId: SOURCE_ID },
    });
    expect(getCreation).toHaveBeenCalledWith('ws_1', SOURCE_ID);
    expect(renderCreation.mock.calls[0][0]).toMatchObject({
      mode: 'edit',
      sourceUrl: 'https://cdn.test/source.jpg',
    });
    expect(insertCreation.mock.calls[0][0]).toMatchObject({ sourceCreationId: SOURCE_ID });
  });

  it('keeps the source persona face lock when the edit mentions nobody', async () => {
    getCreation.mockResolvedValue({
      id: SOURCE_ID,
      asset_url: 'https://cdn.test/source.jpg',
      persona_id: ARIA.id,
    });
    const res = await createAction(
      null,
      form({ mode: 'edit', prompt: 'red jacket', sourceCreationId: SOURCE_ID }),
    );
    expect(res).toMatchObject({ status: 'success', creation: { personaName: 'Aria Vance' } });
    expect(renderCreation.mock.calls[0][0]).toMatchObject({ persona: ARIA });
    expect(insertCreation.mock.calls[0][0]).toMatchObject({ personaId: ARIA.id });
  });

  it('lets an explicit mention override the source persona on edit', async () => {
    const KAI = {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Kai',
      portrait_url: 'https://cdn.test/kai.jpg',
    };
    listAiModels.mockResolvedValue([ARIA, KAI]);
    getCreation.mockResolvedValue({
      id: SOURCE_ID,
      asset_url: 'https://cdn.test/source.jpg',
      persona_id: ARIA.id,
    });
    await createAction(
      null,
      form({ mode: 'edit', prompt: '@kai in the same jacket', sourceCreationId: SOURCE_ID }),
    );
    expect(renderCreation.mock.calls[0][0]).toMatchObject({ persona: KAI });
  });

  it('refuses a source outside the workspace without charging', async () => {
    getCreation.mockResolvedValue(null);
    const res = await createAction(
      null,
      form({ mode: 'edit', prompt: 'red jacket', sourceCreationId: SOURCE_ID }),
    );
    expect(res).toMatchObject({
      status: 'error',
      fieldErrors: { sourceCreationId: expect.any(String) },
    });
    expect(consumeCredits).not.toHaveBeenCalled();
  });

  it('rejects an edit with no source, or a source that is not an id', async () => {
    expect(await createAction(null, form({ mode: 'edit', prompt: 'x' }))).toMatchObject({
      status: 'error',
      fieldErrors: { sourceCreationId: expect.any(String) },
    });
    expect(
      await createAction(
        null,
        form({ mode: 'edit', prompt: 'x', sourceCreationId: 'https://evil.test/a.jpg' }),
      ),
    ).toMatchObject({ status: 'error' });
    expect(getCreation).not.toHaveBeenCalled();
    expect(consumeCredits).not.toHaveBeenCalled();
  });
});

describe('createAction — input bounds', () => {
  it('rejects an empty prompt, an over-long prompt and an unknown aspect', async () => {
    for (const fields of <Record<string, string>[]>[
      { mode: 'picture', prompt: '   ' },
      { mode: 'picture', prompt: 'x'.repeat(2001) },
      { mode: 'picture', prompt: 'ok', aspect: '21:9' },
      { mode: 'video', prompt: 'ok' },
    ]) {
      expect(await createAction(null, form(fields))).toMatchObject({ status: 'error' });
    }
    expect(consumeCredits).not.toHaveBeenCalled();
  });

  it('refuses a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await createAction(null, form({ mode: 'picture', prompt: 'a beach' }))).toEqual({
      status: 'error',
      error: 'Not signed in.',
    });
    expect(consumeCredits).not.toHaveBeenCalled();
  });
});
