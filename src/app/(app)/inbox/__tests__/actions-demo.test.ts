import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

vi.mock('@/lib/env', () => ({
  serverEnv: {
    THEPLUS_DEMO_MODE: true,
    ZERNIO_API_KEY: 'must-not-be-used',
  },
}));

const getSupabaseServerClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: (...args: unknown[]) => getSupabaseServerClient(...args),
}));

const triageDm = vi.fn();
const saveTriagedDm = vi.fn();
const updateDmStatus = vi.fn();
const deleteDm = vi.fn();
const getDmThreadById = vi.fn();
vi.mock('@/lib/dm-engine', () => ({
  triageDm: (...args: unknown[]) => triageDm(...args),
  saveTriagedDm: (...args: unknown[]) => saveTriagedDm(...args),
  updateDmStatus: (...args: unknown[]) => updateDmStatus(...args),
  deleteDm: (...args: unknown[]) => deleteDm(...args),
  getDmThreadById: (...args: unknown[]) => getDmThreadById(...args),
}));

const consumeCredits = vi.fn();
vi.mock('@/lib/credits', () => ({
  consumeCredits: (...args: unknown[]) => consumeCredits(...args),
  refundCredits: vi.fn(),
  COSTS: { DM_TRIAGE: 2 },
}));

const getZernioClient = vi.fn();
vi.mock('@/lib/zernio', () => ({
  getZernioClient: (...args: unknown[]) => getZernioClient(...args),
}));

vi.mock('@/lib/ai-models', () => ({ listAiModels: vi.fn() }));
vi.mock('@/lib/workspace', () => ({ getOrCreateCurrentWorkspace: vi.fn() }));

import {
  addPastedDmAction,
  archiveDmAction,
  deleteDmAction,
  markDmRepliedAction,
  snoozeDmAction,
} from '../actions';

function validForm() {
  const fd = new FormData();
  fd.set('platform', 'instagram');
  fd.set('authorHandle', 'demo_sender');
  fd.set('messageText', 'Can we sponsor Aria next month?');
  return fd;
}

function idForm() {
  const fd = new FormData();
  fd.set('id', '00000000-0000-4000-8000-000000000601');
  fd.set('reply', 'Demo reply');
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('demo inbox actions', () => {
  it('keeps validation active before returning a demo save', async () => {
    const fd = validForm();
    fd.set('messageText', '');

    const result = await addPastedDmAction(null, fd);

    expect(result.status).toBe('error');
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(triageDm).not.toHaveBeenCalled();
  });

  it('saves a demo DM without Supabase, credits, OpenAI, or Zernio', async () => {
    const result = await addPastedDmAction(null, validForm());

    expect(result.status).toBe('saved');
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(consumeCredits).not.toHaveBeenCalled();
    expect(triageDm).not.toHaveBeenCalled();
    expect(saveTriagedDm).not.toHaveBeenCalled();
    expect(getZernioClient).not.toHaveBeenCalled();
  });

  it('turns demo inbox actions into no-op revalidations', async () => {
    await markDmRepliedAction(idForm());
    await archiveDmAction(idForm());
    await snoozeDmAction(idForm());
    await deleteDmAction(idForm());

    expect(getDmThreadById).not.toHaveBeenCalled();
    expect(updateDmStatus).not.toHaveBeenCalled();
    expect(deleteDm).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/inbox');
  });
});
