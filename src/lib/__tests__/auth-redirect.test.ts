import { describe, expect, it } from 'vitest';
import { landingAfterAuth, sanitizeReturnTo } from '../auth-redirect';

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

describe('landingAfterAuth', () => {
  it('sends a first sign-in (created and signed in together) to /welcome', () => {
    expect(
      landingAfterAuth({
        created_at: '2026-11-10T12:00:00Z',
        last_sign_in_at: '2026-11-10T12:00:01Z',
      }),
    ).toBe('/welcome');
  });
  it('sends a returning user to /dashboard', () => {
    expect(
      landingAfterAuth({
        created_at: '2026-10-01T12:00:00Z',
        last_sign_in_at: '2026-11-10T12:00:00Z',
      }),
    ).toBe('/dashboard');
  });
  it('treats the 60s window edge, missing or bad timestamps and no user as returning', () => {
    expect(
      landingAfterAuth({
        created_at: '2026-11-10T12:00:00Z',
        last_sign_in_at: '2026-11-10T12:01:00Z',
      }),
    ).toBe('/dashboard');
    expect(
      landingAfterAuth({
        created_at: '2026-11-10T12:00:00Z',
        last_sign_in_at: '2026-11-10T12:00:59Z',
      }),
    ).toBe('/welcome');
    expect(landingAfterAuth({ created_at: '2026-11-10T12:00:00Z' })).toBe('/dashboard');
    expect(landingAfterAuth({ created_at: 'garbage', last_sign_in_at: 'garbage' })).toBe(
      '/dashboard',
    );
    expect(landingAfterAuth(null)).toBe('/dashboard');
  });
});

describe('sanitizeReturnTo — off-origin bypasses (Codex review, 2026-11-11)', () => {
  // Each of these resolves to another host in a browser (WHATWG URL treats `\` as `/`).
  it.each([
    ['/\\evil.example/phish'],
    ['/\\/evil.example'],
    ['\\\\evil.example'],
    ['/\t/evil.example'],
    ['/\n/evil.example'],
    ['/ /evil.example'.replace(' ', '\r')],
  ])('rejects %j', (input) => {
    expect(sanitizeReturnTo(input)).toBeNull();
  });

  it('still keeps ordinary same-origin paths, including encoded characters', () => {
    expect(sanitizeReturnTo('/dashboard')).toBe('/dashboard');
    expect(sanitizeReturnTo('/create?persona=abc&mode=edit')).toBe('/create?persona=abc&mode=edit');
    expect(sanitizeReturnTo('/p/%5Cliteral')).toBe('/p/%5Cliteral');
    expect(sanitizeReturnTo('/a#frag')).toBe('/a#frag');
  });
});
