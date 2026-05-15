import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@/lib/supabase/types';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/posts', () => ({
  getPostByShareToken: vi.fn(),
}));

vi.mock('@/lib/review-comments', () => ({
  createPublicPostReviewComment: vi.fn(),
}));

vi.mock('@/lib/review-approvals', () => ({
  recordPublicPostReviewDecision: vi.fn(),
}));

vi.mock('@/lib/workspace-webhooks', () => ({
  dispatchWorkspaceWebhookEvent: vi.fn(),
}));

import { revalidatePath } from 'next/cache';
import { getPostByShareToken } from '@/lib/posts';
import { recordPublicPostReviewDecision } from '@/lib/review-approvals';
import { createPublicPostReviewComment } from '@/lib/review-comments';
import { dispatchWorkspaceWebhookEvent } from '@/lib/workspace-webhooks';
import { addPublicReviewCommentAction, setPublicReviewDecisionAction } from '../actions';

const getPostByShareTokenMock = vi.mocked(getPostByShareToken);
const createPublicPostReviewCommentMock = vi.mocked(createPublicPostReviewComment);
const recordPublicPostReviewDecisionMock = vi.mocked(recordPublicPostReviewDecision);
const dispatchWorkspaceWebhookEventMock = vi.mocked(dispatchWorkspaceWebhookEvent);
const revalidatePathMock = vi.mocked(revalidatePath);

const TOKEN = '11111111-1111-4111-8111-111111111111';

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  data.set('token', TOKEN);
  data.set('authorName', 'Reviewer');
  data.set('authorEmail', '');
  data.set('body', 'Tighten the product close-up.');
  data.set('shotIndex', '');
  data.set('variantIndex', '0');
  data.set('timeMs', '0');
  data.set('anchorX', '50');
  data.set('anchorY', '50');
  for (const [key, value] of Object.entries(overrides)) {
    data.set(key, value);
  }
  return data;
}

function sharedPost(): PostRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    workspace_id: '33333333-3333-4333-8333-333333333333',
    model_id: null,
    name: 'Launch cut',
    status: 'draft',
    platforms: ['instagram'],
    format: 'portrait',
    prompt_inputs: {} as PostRow['prompt_inputs'],
    variants: [
      {
        url: 'https://example.com/variant.jpg',
        generationId: 'gen_1',
        generatedAt: '2026-05-14T00:00:00.000Z',
      },
    ],
    caption: null,
    scheduled_for: null,
    zernio_post_id: null,
    share_token: TOKEN,
    review_status: 'needs_changes',
    review_version: 1,
    approved_at: null,
    finalized_at: null,
    created_at: '2026-05-14T00:00:00.000Z',
    updated_at: '2026-05-14T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dispatchWorkspaceWebhookEventMock.mockResolvedValue({ attempted: 0, delivered: 0, failed: 0 });
});

describe('addPublicReviewCommentAction', () => {
  it('rejects malformed share tokens before loading a post', async () => {
    const result = await addPublicReviewCommentAction(null, form({ token: 'bad-token' }));

    expect(result.status).toBe('error');
    expect(getPostByShareTokenMock).not.toHaveBeenCalled();
    expect(createPublicPostReviewCommentMock).not.toHaveBeenCalled();
  });

  it('rejects stale variant indexes before inserting', async () => {
    getPostByShareTokenMock.mockResolvedValue(sharedPost());

    const result = await addPublicReviewCommentAction(null, form({ variantIndex: '2' }));

    expect(result).toMatchObject({ status: 'error' });
    expect(createPublicPostReviewCommentMock).not.toHaveBeenCalled();
  });

  it('creates a review comment for a resolved share token', async () => {
    const post = sharedPost();
    getPostByShareTokenMock.mockResolvedValue(post);
    createPublicPostReviewCommentMock.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      workspace_id: post.workspace_id,
      subject_type: 'post',
      post_id: post.id,
      storyboard_id: null,
      author_name: 'Reviewer',
      author_email: null,
      body: 'Tighten the product close-up.',
      status: 'open',
      shot_index: null,
      variant_index: 0,
      time_ms: 0,
      anchor_x: 50,
      anchor_y: 50,
      created_at: '2026-05-14T00:00:00.000Z',
      updated_at: '2026-05-14T00:00:00.000Z',
    });

    const result = await addPublicReviewCommentAction(null, form());

    expect(result).toEqual({ status: 'success', message: 'Review comment sent.' });
    expect(createPublicPostReviewCommentMock).toHaveBeenCalledWith({
      workspaceId: post.workspace_id,
      postId: post.id,
      comment: expect.objectContaining({
        authorName: 'Reviewer',
        body: 'Tighten the product close-up.',
        variantIndex: 0,
      }),
    });
    expect(dispatchWorkspaceWebhookEventMock).toHaveBeenCalledWith({
      workspaceId: post.workspace_id,
      event: 'comment.created',
      payload: expect.objectContaining({
        subjectType: 'post',
        postId: post.id,
        commentId: '44444444-4444-4444-8444-444444444444',
      }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/p/${TOKEN}`);
  });
});

describe('setPublicReviewDecisionAction', () => {
  it('rejects public finalization', async () => {
    const result = await setPublicReviewDecisionAction(
      null,
      form({
        reviewerName: 'Ada',
        reviewerEmail: '',
        summary: 'Approved for campaign use.',
        decision: 'final',
      }),
    );

    expect(result).toEqual({
      status: 'error',
      error: 'Only the workspace owner can mark work final.',
    });
    expect(recordPublicPostReviewDecisionMock).not.toHaveBeenCalled();
  });

  it('records an approved decision for a valid share link', async () => {
    const post = sharedPost();
    getPostByShareTokenMock.mockResolvedValue(post);
    recordPublicPostReviewDecisionMock.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      workspace_id: post.workspace_id,
      subject_type: 'post',
      post_id: post.id,
      storyboard_id: null,
      version_number: 1,
      decision: 'approved',
      reviewer_name: 'Ada',
      reviewer_email: null,
      summary: 'Approved for campaign use.',
      created_at: '2026-05-14T00:00:00.000Z',
    });

    const result = await setPublicReviewDecisionAction(
      null,
      form({
        reviewerName: 'Ada',
        reviewerEmail: '',
        summary: 'Approved for campaign use.',
        decision: 'approved',
      }),
    );

    expect(result).toEqual({ status: 'success', message: 'Review decision sent.' });
    expect(recordPublicPostReviewDecisionMock).toHaveBeenCalledWith({
      workspaceId: post.workspace_id,
      postId: post.id,
      decision: expect.objectContaining({
        decision: 'approved',
        reviewerName: 'Ada',
        summary: 'Approved for campaign use.',
      }),
    });
    expect(dispatchWorkspaceWebhookEventMock).toHaveBeenCalledWith({
      workspaceId: post.workspace_id,
      event: 'review.approved',
      payload: expect.objectContaining({
        subjectType: 'post',
        postId: post.id,
        decisionId: '55555555-5555-4555-8555-555555555555',
      }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/p/${TOKEN}`);
  });
});
