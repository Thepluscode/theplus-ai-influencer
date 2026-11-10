import { describe, expect, it } from 'vitest';
import {
  extractMentions,
  mentionErrorMessage,
  personaHandle,
  replaceMentions,
  resolveMention,
} from '../handles';

const aria = { id: 'p1', name: 'Aria Vance' };
const kai = { id: 'p2', name: 'Kai' };

describe('personaHandle', () => {
  it('slugs names to lowercase hyphenated handles', () => {
    expect(personaHandle('Aria Vance')).toBe('aria-vance');
    expect(personaHandle('  Kai  ')).toBe('kai');
    expect(personaHandle('Zoë O’Neill')).toBe('zoe-o-neill');
    expect(personaHandle('DJ_Nova 2')).toBe('dj-nova-2');
  });

  it('returns empty for a name with no ASCII letters or digits', () => {
    expect(personaHandle('🌸🌸')).toBe('');
    expect(personaHandle('---')).toBe('');
    expect(personaHandle('')).toBe('');
  });

  it('caps length without leaving a trailing hyphen', () => {
    const h = personaHandle(`${'a'.repeat(62)} b`);
    expect(h.length).toBeLessThanOrEqual(63);
    expect(h.endsWith('-')).toBe(false);
  });
});

describe('extractMentions', () => {
  it('finds mentions at the start, middle and after punctuation', () => {
    expect(extractMentions('@aria-vance on a rooftop')).toEqual(['aria-vance']);
    expect(extractMentions('Selfie of (@Kai) at dusk')).toEqual(['kai']);
    expect(extractMentions('with @kai, then @aria-vance.')).toEqual(['kai', 'aria-vance']);
  });

  it('ignores email addresses, doubled @ and a bare @', () => {
    expect(extractMentions('contact ana@example.com')).toEqual([]);
    expect(extractMentions('mail ana.b@x.com or ana_b@x.com')).toEqual([]);
    expect(extractMentions('@@kai and @ alone')).toEqual([]);
  });

  it('treats a mention straight after a full stop as a mention', () => {
    // Otherwise the prompt renders without the face lock and still charges.
    expect(extractMentions('On a rooftop.@kai smiling')).toEqual(['kai']);
  });

  it('drops trailing hyphens and dedupes case-insensitively', () => {
    expect(extractMentions('@kai- then @KAI')).toEqual(['kai']);
  });
});

describe('resolveMention', () => {
  it('returns no persona when nothing is mentioned', () => {
    expect(resolveMention('a beach at noon', [aria])).toEqual({ ok: true, persona: null });
  });

  it('resolves a single mention to its persona', () => {
    expect(resolveMention('@ARIA-VANCE on a beach', [aria, kai])).toEqual({
      ok: true,
      persona: aria,
    });
  });

  it('rejects an unknown handle instead of rendering without the face lock', () => {
    expect(resolveMention('@nova on a beach', [aria])).toEqual({
      ok: false,
      reason: 'unknown',
      handles: ['nova'],
    });
  });

  it('rejects a handle two personas share', () => {
    const twin = { id: 'p3', name: 'aria vance' };
    expect(resolveMention('@aria-vance', [aria, twin])).toEqual({
      ok: false,
      reason: 'ambiguous',
      handles: ['aria-vance'],
    });
  });

  it('rejects two personas in one picture', () => {
    expect(resolveMention('@kai and @aria-vance', [aria, kai])).toMatchObject({
      ok: false,
      reason: 'too_many',
    });
  });

  it('never matches a persona whose name slugs to empty', () => {
    expect(resolveMention('@x', [{ id: 'e', name: '🌸' }])).toMatchObject({ reason: 'unknown' });
  });
});

describe('replaceMentions', () => {
  it('swaps the handle for a neutral reference and keeps emails', () => {
    expect(replaceMentions('@aria-vance texting ana@example.com, smiling')).toBe(
      'the person from the reference texting ana@example.com, smiling',
    );
    expect(replaceMentions('Selfie of (@kai).')).toBe('Selfie of (the person from the reference).');
  });
});

describe('mentionErrorMessage', () => {
  it('names the offending handles', () => {
    expect(mentionErrorMessage({ ok: false, reason: 'unknown', handles: ['nova'] })).toContain(
      '@nova',
    );
  });
});
