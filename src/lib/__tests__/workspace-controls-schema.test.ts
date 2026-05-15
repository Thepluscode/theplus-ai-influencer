import { describe, expect, it } from 'vitest';
import {
  BrandDefaultsFormSchema,
  TeamInviteFormSchema,
  WebhookFormSchema,
} from '@/lib/workspace-controls-schema';

describe('workspace control schemas', () => {
  it('normalizes brand defaults', () => {
    const parsed = BrandDefaultsFormSchema.safeParse({
      brandTone: 'luxe',
      brandVibe: '  cinematic editorial  ',
      brandPalette: '  black, blue, green  ',
      defaultCta: 'learn_more',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        brandTone: 'luxe',
        brandVibe: 'cinematic editorial',
        brandPalette: 'black, blue, green',
        defaultCta: 'learn_more',
      });
    }
  });

  it('lowercases invite emails and rejects invalid roles', () => {
    const parsed = TeamInviteFormSchema.safeParse({
      email: '  ADA@EXAMPLE.COM  ',
      role: 'editor',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe('ada@example.com');
    }

    expect(
      TeamInviteFormSchema.safeParse({ email: 'ada@example.com', role: 'owner' }).success,
    ).toBe(false);
  });

  it('requires HTTPS webhook URLs and at least one event', () => {
    expect(
      WebhookFormSchema.safeParse({
        name: 'Ops',
        url: 'https://example.com/webhooks/theplus',
        events: ['post.published'],
      }).success,
    ).toBe(true);

    expect(
      WebhookFormSchema.safeParse({
        name: 'Ops',
        url: 'http://example.com/webhooks/theplus',
        events: ['post.published'],
      }).success,
    ).toBe(false);

    expect(
      WebhookFormSchema.safeParse({
        name: 'Ops',
        url: 'https://example.com/webhooks/theplus',
        events: [],
      }).success,
    ).toBe(false);
  });
});
