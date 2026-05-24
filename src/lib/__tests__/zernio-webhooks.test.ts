import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

// Shared, mutable test state shared into the hoisted mock factories.
const h = vi.hoisted(() => ({
  responses: {} as Record<string, { data: unknown; error: unknown }>,
  upsertCalls: [] as { table: string; row: Record<string, unknown>; opts: unknown }[],
  classifyAndDraft: vi.fn(),
  triageDm: vi.fn(),
}));

vi.mock('@/lib/comments-engine', () => ({ classifyAndDraft: h.classifyAndDraft }));
vi.mock('@/lib/dm-engine', () => ({ triageDm: h.triageDm }));

interface QueryResult {
  data: unknown;
  error: unknown;
}
interface QB {
  select: () => QB;
  eq: () => QB;
  order: () => QB;
  limit: () => QB;
  upsert: (row: Record<string, unknown>, opts: unknown) => QB;
  maybeSingle: () => Promise<QueryResult>;
  then: (onF: (v: QueryResult) => unknown, onR?: (e: unknown) => unknown) => Promise<unknown>;
}

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string): QB => {
      const resp = (): Promise<QueryResult> =>
        Promise.resolve(h.responses[table] ?? { data: null, error: null });
      const builder: QB = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        upsert: (row, opts) => {
          h.upsertCalls.push({ table, row, opts });
          return builder;
        },
        maybeSingle: () => resp(),
        then: (onF, onR) => resp().then(onF, onR),
      };
      return builder;
    },
  }),
}));

import { handleZernioWebhookEvent, verifyZernioSignature } from '../zernio-webhooks';

const SECRET = 'whsec_test';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function commentEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    event: 'comment.received',
    comment: {
      id: 'plat-comment-1',
      platformPostId: 'plat-post-1',
      platform: 'instagram',
      text: 'love this!',
      author: { id: 'u1', username: 'fan_girl', name: 'Fan', picture: 'http://x/a.png' },
    },
    post: { id: 'zern-post-1', platformPostId: 'plat-post-1' },
    account: { id: 'acct-1' },
    timestamp: '2026-05-24T00:00:00.000Z',
    ...overrides,
  };
}

function messageEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_2',
    event: 'message.received',
    message: {
      id: 'plat-msg-1',
      conversationId: 'conv-internal-1',
      platform: 'instagram',
      direction: 'incoming',
      text: 'how much is it?',
      sender: { id: 's1', username: 'buyer', name: 'Buyer', picture: 'http://x/b.png' },
      sentAt: '2026-05-24T00:00:00.000Z',
      isRead: false,
    },
    conversation: {
      id: 'conv-internal-1',
      platformConversationId: 'plat-conv-1',
      participantName: 'Buyer',
      status: 'active',
    },
    account: { id: 'acct-1' },
    timestamp: '2026-05-24T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  h.responses = {};
  h.upsertCalls = [];
  h.classifyAndDraft.mockReset();
  h.triageDm.mockReset();
});

describe('verifyZernioSignature', () => {
  it('accepts a correct HMAC-SHA256 hex signature of the raw body', () => {
    const body = JSON.stringify(commentEvent());
    expect(verifyZernioSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const body = JSON.stringify(commentEvent());
    expect(verifyZernioSignature(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a missing signature', () => {
    const body = JSON.stringify(commentEvent());
    expect(verifyZernioSignature(body, null, SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(commentEvent());
    const sig = sign(body);
    expect(verifyZernioSignature(body + ' ', sig, SECRET)).toBe(false);
  });
});

describe('handleZernioWebhookEvent — comment.received', () => {
  it('drafts a reply and upserts the comment for the resolved workspace', async () => {
    h.responses.posts = { data: { id: 'post-uuid', workspace_id: 'ws-1' }, error: null };
    h.responses.ai_models = {
      data: { name: 'Aria', wizard_input: { vibe: 'playful' } },
      error: null,
    };
    h.responses.comments = { data: [{ id: 'c-uuid' }], error: null };
    h.classifyAndDraft.mockResolvedValue({ classification: 'fan', draftReply: 'thank you!' });

    const result = await handleZernioWebhookEvent(commentEvent());

    expect(result).toEqual({
      handled: true,
      kind: 'comment',
      externalId: 'plat-comment-1',
      duplicate: false,
    });
    expect(h.classifyAndDraft).toHaveBeenCalledWith({
      commentText: 'love this!',
      personaName: 'Aria',
      personaVibe: 'playful',
    });
    const call = h.upsertCalls.find((c) => c.table === 'comments');
    expect(call).toBeDefined();
    expect(call?.row).toMatchObject({
      workspace_id: 'ws-1',
      post_id: 'post-uuid',
      platform: 'instagram',
      author_handle: 'fan_girl',
      comment_text: 'love this!',
      classification: 'fan',
      draft_reply: 'thank you!',
      external_id: 'plat-comment-1',
      zernio_post_id: 'zern-post-1',
      zernio_account_id: 'acct-1',
    });
    expect(call?.opts).toEqual({ onConflict: 'platform,external_id', ignoreDuplicates: true });
  });

  it('skips comments on posts we do not track (no draft, no insert)', async () => {
    h.responses.posts = { data: null, error: null };

    const result = await handleZernioWebhookEvent(commentEvent());

    expect(result.handled).toBe(false);
    expect(h.classifyAndDraft).not.toHaveBeenCalled();
    expect(h.upsertCalls).toHaveLength(0);
  });

  it('reports duplicate=true when the upsert is ignored', async () => {
    h.responses.posts = { data: { id: 'post-uuid', workspace_id: 'ws-1' }, error: null };
    h.responses.ai_models = { data: null, error: null };
    h.responses.comments = { data: [], error: null };
    h.classifyAndDraft.mockResolvedValue({ classification: 'fan', draftReply: 'hi' });

    const result = await handleZernioWebhookEvent(commentEvent());

    expect(result).toMatchObject({ handled: true, duplicate: true });
    // Falls back to a generic persona when the workspace has no AI model.
    expect(h.classifyAndDraft).toHaveBeenCalledWith(
      expect.objectContaining({ personaName: 'the creator' }),
    );
  });
});

describe('handleZernioWebhookEvent — message.received', () => {
  it('triages an incoming DM and upserts the thread for the mapped workspace', async () => {
    h.responses.social_accounts = { data: { workspace_id: 'ws-2' }, error: null };
    h.responses.ai_models = { data: { name: 'Aria', wizard_input: { vibe: 'chill' } }, error: null };
    h.responses.dm_threads = { data: [{ id: 'd-uuid' }], error: null };
    h.triageDm.mockResolvedValue({
      classification: 'lead',
      summary: 'asking price',
      suggestedReply: 'link in bio 🙌',
    });

    const result = await handleZernioWebhookEvent(messageEvent());

    expect(result).toEqual({
      handled: true,
      kind: 'dm',
      externalId: 'plat-msg-1',
      duplicate: false,
    });
    const call = h.upsertCalls.find((c) => c.table === 'dm_threads');
    expect(call?.row).toMatchObject({
      workspace_id: 'ws-2',
      platform: 'instagram',
      author_handle: 'buyer',
      last_message: 'how much is it?',
      classification: 'lead',
      suggested_reply: 'link in bio 🙌',
      external_id: 'plat-msg-1',
      zernio_conversation_id: 'plat-conv-1',
      zernio_account_id: 'acct-1',
    });
  });

  it('ignores outgoing messages (our own sent replies)', async () => {
    const result = await handleZernioWebhookEvent(
      messageEvent({
        message: { ...messageEvent().message, direction: 'outgoing' },
      }),
    );
    expect(result).toEqual({ handled: false, reason: 'outgoing message ignored' });
    expect(h.triageDm).not.toHaveBeenCalled();
  });

  it('skips DMs from accounts not mapped to a workspace', async () => {
    h.responses.social_accounts = { data: null, error: null };
    const result = await handleZernioWebhookEvent(messageEvent());
    expect(result.handled).toBe(false);
    expect(h.triageDm).not.toHaveBeenCalled();
    expect(h.upsertCalls).toHaveLength(0);
  });
});

describe('handleZernioWebhookEvent — other events', () => {
  it('ignores unknown event types without touching the DB', async () => {
    const result = await handleZernioWebhookEvent({ id: 'e', event: 'review.new' });
    expect(result).toEqual({ handled: false, reason: 'ignored event: review.new' });
    expect(h.upsertCalls).toHaveLength(0);
  });
});
