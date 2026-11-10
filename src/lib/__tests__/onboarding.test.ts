import { describe, expect, it } from 'vitest';
import {
  campaignPrefillHref,
  parseCampaignPrefill,
  parseStudioPrefill,
  studioPrefillHref,
} from '../onboarding';

describe('Studio prefill', () => {
  it('round-trips name, vibe and the niche brief', () => {
    const href = studioPrefillHref({ name: '  Audrey Lane ', niche: 'tech', vibe: 'street' });
    const params = Object.fromEntries(new URL(href, 'https://app.test').searchParams);
    expect(href.startsWith('/studio/new?')).toBe(true);
    expect(parseStudioPrefill(params)).toEqual({
      name: 'Audrey Lane',
      vibe: 'street',
      customPrompt: 'gaming and tech creator',
    });
  });

  it('drops unknown or hostile values instead of passing them on', () => {
    expect(parseStudioPrefill({ vibe: 'cinematic', niche: 'nope', name: '   ' })).toEqual({});
    expect(parseStudioPrefill({ vibe: '<script>', niche: 'other' })).toEqual({});
    expect(parseStudioPrefill({ name: 'x'.repeat(500) }).name).toHaveLength(80);
    expect(parseStudioPrefill({ name: ['First', 'Second'] }).name).toBe('First');
  });
});

describe('campaign prefill', () => {
  it('maps cadence to posts per week and keeps known platforms', () => {
    const href = campaignPrefillHref({ cadence: 'few', platforms: ['instagram', 'tiktok'] });
    const params = Object.fromEntries(new URL(href, 'https://app.test').searchParams);
    expect(parseCampaignPrefill(params)).toEqual({
      cadencePerWeek: 4,
      platforms: ['instagram', 'tiktok'],
    });
    expect(parseCampaignPrefill({ cadence: 'daily' }).cadencePerWeek).toBe(7);
    expect(parseCampaignPrefill({ cadence: 'weekly' }).cadencePerWeek).toBe(1);
  });

  it('ignores unknown cadences and platforms, and dedupes', () => {
    expect(
      parseCampaignPrefill({ cadence: '99', platforms: 'myspace,,instagram,instagram' }),
    ).toEqual({
      platforms: ['instagram'],
    });
    expect(parseCampaignPrefill({ platforms: 'myspace' })).toEqual({});
  });
});
