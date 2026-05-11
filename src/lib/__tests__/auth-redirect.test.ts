import { describe, expect, it } from 'vitest';
import { sanitizeReturnTo } from '../auth-redirect';

describe('sanitizeReturnTo', () => {
  it('accepts a same-origin pathname', () => {
    expect(sanitizeReturnTo('/dashboard')).toBe('/dashboard');
    expect(sanitizeReturnTo('/studio?new=1')).toBe('/studio?new=1');
  });

  it('rejects empty / null / non-string input', () => {
    expect(sanitizeReturnTo('')).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo(undefined)).toBeNull();
  });

  it('rejects absolute URLs that could bounce off-site', () => {
    expect(sanitizeReturnTo('https://evil.example/phish')).toBeNull();
    expect(sanitizeReturnTo('http://evil.example')).toBeNull();
  });

  it('rejects protocol-relative URLs (`//host/path`)', () => {
    expect(sanitizeReturnTo('//evil.example/phish')).toBeNull();
  });

  it('rejects javascript: pseudo URLs', () => {
    expect(sanitizeReturnTo('javascript:alert(1)')).toBeNull();
  });

  it('rejects values containing control characters', () => {
    expect(sanitizeReturnTo('/dashboard\nfoo')).toBeNull();
    expect(sanitizeReturnTo('/dashboard\x00bar')).toBeNull();
    expect(sanitizeReturnTo('/dashboard\x7fdel')).toBeNull();
  });
});
