import { describe, expect, it } from 'vitest';
import { cn } from '../utils';

describe('cn (class merge helper)', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('skips falsy values', () => {
    expect(cn('a', false && 'b', null, undefined, 'c')).toBe('a c');
  });

  it('lets later Tailwind classes override earlier ones from the same group', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});
