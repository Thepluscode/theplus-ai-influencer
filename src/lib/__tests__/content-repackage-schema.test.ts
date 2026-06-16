import { describe, expect, it } from 'vitest';
import { CHANNELS } from '@/lib/content-sources-schema';
import {
  CHANNEL_BODY_SCHEMA,
  packItemToPlainText,
  packResponseSchema,
} from '@/lib/content-repackage-schema';

const validResponse = {
  linkedin: { body: 'A LinkedIn post.', hashtags: ['a'] },
  x_thread: { tweets: ['t1', 't2'] },
  instagram_carousel: { caption: 'cap', slides: [{ title: 's', body: 'b' }], hashtags: [] },
  tiktok_reels: { hook: 'h', beats: ['b1'], cta: 'cta' },
  youtube_short: { hook: 'h', beats: ['b1'], cta: 'cta' },
  newsletter: { subject: 's', preview: 'p', body: 'b' },
  blog_aeo: { title: 't', metaDescription: 'm', outline: ['o'], body: 'b' },
  email_sequence: { emails: [{ subject: 's', body: 'b' }] },
  captions: { variants: ['v1'] },
  sales_snippets: { snippets: ['s1'] },
};

describe('packResponseSchema', () => {
  it('accepts a complete 10-channel response', () => {
    expect(packResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it('rejects a response missing a channel', () => {
    const partial = { ...validResponse } as Record<string, unknown>;
    delete partial.captions;
    expect(packResponseSchema.safeParse(partial).success).toBe(false);
  });

  it('rejects an empty x_thread', () => {
    expect(
      packResponseSchema.safeParse({ ...validResponse, x_thread: { tweets: [] } }).success,
    ).toBe(false);
  });

  it('has a body schema for every channel', () => {
    for (const channel of CHANNELS) {
      expect(CHANNEL_BODY_SCHEMA[channel.key]).toBeDefined();
    }
  });
});

describe('packItemToPlainText', () => {
  it('flattens a LinkedIn body with hashtags', () => {
    const text = packItemToPlainText('linkedin', validResponse.linkedin);
    expect(text).toContain('A LinkedIn post.');
    expect(text).toContain('#a');
  });

  it('joins X thread tweets', () => {
    const text = packItemToPlainText('x_thread', validResponse.x_thread);
    expect(text).toContain('t1');
    expect(text).toContain('t2');
  });

  it('renders an email sequence with separators', () => {
    const text = packItemToPlainText('email_sequence', validResponse.email_sequence);
    expect(text).toContain('s');
    expect(text).toContain('b');
  });

  it('is resilient to an unknown channel', () => {
    expect(typeof packItemToPlainText('unknown', { body: 'x' })).toBe('string');
  });
});
