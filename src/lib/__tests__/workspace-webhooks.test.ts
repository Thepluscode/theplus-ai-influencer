import { describe, expect, it } from 'vitest';
import { buildWorkspaceWebhookBody } from '@/lib/workspace-webhooks';

describe('buildWorkspaceWebhookBody', () => {
  it('wraps event payloads with delivery metadata', () => {
    const body = buildWorkspaceWebhookBody(
      {
        workspaceId: '33333333-3333-4333-8333-333333333333',
        event: 'post.scheduled',
        payload: { postId: 'post-1', pushedToZernio: true },
      },
      'delivery-1',
    );

    expect(body).toMatchObject({
      id: 'delivery-1',
      workspaceId: '33333333-3333-4333-8333-333333333333',
      event: 'post.scheduled',
      payload: { postId: 'post-1', pushedToZernio: true },
    });
    expect(new Date(body.occurredAt).toString()).not.toBe('Invalid Date');
  });
});
