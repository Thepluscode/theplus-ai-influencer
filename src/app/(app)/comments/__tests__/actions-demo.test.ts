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

const classifyAndDraft = vi.fn();
const saveDraftedComment = vi.fn();
const updateCommentStatus = vi.fn();
const deleteComment = vi.fn();
const getCommentById = vi.fn();
vi.mock('@/lib/comments-engine', () => ({
  classifyAndDraft: (...args: unknown[]) => classifyAndDraft(...args),
  saveDraftedComment: (...args: unknown[]) => saveDraftedComment(...args),
  updateCommentStatus: (...args: unknown[]) => updateCommentStatus(...args),
  deleteComment: (...args: unknown[]) => deleteComment(...args),
  getCommentById: (...args: unknown[]) => getCommentById(...args),
}));

const consumeCredits = vi.fn();
vi.mock('@/lib/credits', () => ({
  consumeCredits: (...args: unknown[]) => consumeCredits(...args),
  refundCredits: vi.fn(),
  COSTS: { COMMENT_REPLY_DRAFT: 1 },
}));

const getZernioClient = vi.fn();
vi.mock('@/lib/zernio', () => ({
  getZernioClient: (...args: unknown[]) => getZernioClient(...args),
}));

vi.mock('@/lib/ai-models', () => ({ listAiModels: vi.fn() }));
vi.mock('@/lib/workspace', () => ({ getOrCreateCurrentWorkspace: vi.fn() }));

import {
  addPastedCommentAction,
  approveCommentAction,
  deleteCommentAction,
  dismissCommentAction,
  hideCommentAction,
} from '../actions';

function validForm() {
  const fd = new FormData();
  fd.set('platform', 'instagram');
  fd.set('authorHandle', 'demo_handle');
  fd.set('commentText', 'Where can I buy this?');
  return fd;
}

function idForm() {
  const fd = new FormData();
  fd.set('id', '00000000-0000-4000-8000-000000000501');
  fd.set('draft', 'Demo reply');
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('demo comments actions', () => {
  it('keeps validation active before returning a demo save', async () => {
    const fd = validForm();
    fd.set('commentText', '');

    const result = await addPastedCommentAction(null, fd);

    expect(result.status).toBe('error');
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(classifyAndDraft).not.toHaveBeenCalled();
  });

  it('saves a demo comment without Supabase, credits, OpenAI, or Zernio', async () => {
    const result = await addPastedCommentAction(null, validForm());

    expect(result.status).toBe('saved');
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(consumeCredits).not.toHaveBeenCalled();
    expect(classifyAndDraft).not.toHaveBeenCalled();
    expect(saveDraftedComment).not.toHaveBeenCalled();
    expect(getZernioClient).not.toHaveBeenCalled();
  });

  it('turns demo moderation actions into no-op revalidations', async () => {
    await approveCommentAction(idForm());
    await dismissCommentAction(idForm());
    await hideCommentAction(idForm());
    await deleteCommentAction(idForm());

    expect(getCommentById).not.toHaveBeenCalled();
    expect(updateCommentStatus).not.toHaveBeenCalled();
    expect(deleteComment).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/comments');
  });
});
