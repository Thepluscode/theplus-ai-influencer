import { beforeEach, describe, expect, it, vi } from 'vitest';

// The gate orchestrates three boundaries: credits (consume/refund), the
// brand-safety auditor, and the safety_audits insert. Mock all three so the
// test asserts the gate's decision logic deterministically.

const consumeCredits = vi.fn();
const refundCredits = vi.fn();
vi.mock('@/lib/credits', () => ({
  consumeCredits: (...args: unknown[]) => consumeCredits(...args),
  refundCredits: (...args: unknown[]) => refundCredits(...args),
  COSTS: { BRAND_SAFETY_CHECK: 2 },
}));

const checkBrandSafety = vi.fn();
vi.mock('@/lib/brand-safety', () => ({
  checkBrandSafety: (...args: unknown[]) => checkBrandSafety(...args),
}));

const insert = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ from: () => ({ insert }) })),
}));

import { describeSafetyBlock, runPublishBrandSafetyGate } from '../publish-safety';

const baseInput = {
  workspaceId: 'ws-1',
  postId: 'post-1',
  caption: 'hello world',
  imageUrl: 'https://example.com/v1.png',
  platforms: ['instagram'],
};

beforeEach(() => {
  consumeCredits.mockReset();
  refundCredits.mockReset();
  checkBrandSafety.mockReset();
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
  consumeCredits.mockResolvedValue({ ok: true, balanceAfter: 10 });
});

describe('runPublishBrandSafetyGate', () => {
  it('returns insufficient_credits and never calls the auditor when credits run out', async () => {
    consumeCredits.mockResolvedValue({ ok: false, insufficient: true, balance: 0, required: 2 });

    const result = await runPublishBrandSafetyGate(baseInput);

    expect(checkBrandSafety).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: 'insufficient_credits', balance: 0, required: 2 });
  });

  it('passes through and logs an audit on a clean verdict', async () => {
    checkBrandSafety.mockResolvedValue({ verdict: 'pass', summary: 'clean', issues: [] });

    const result = await runPublishBrandSafetyGate(baseInput);

    expect(result).toEqual({ ok: true, note: null });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ post_id: 'post-1', workspace_id: 'ws-1', verdict: 'pass' }),
    );
  });

  it('passes with a note on a warn verdict', async () => {
    checkBrandSafety.mockResolvedValue({
      verdict: 'warn',
      summary: 'missing #ad disclosure',
      issues: [{ severity: 'medium', code: 'undisclosed_sponsorship', message: 'no disclosure' }],
    });

    const result = await runPublishBrandSafetyGate(baseInput);

    expect(result).toEqual({ ok: true, note: 'missing #ad disclosure' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'warn' }));
  });

  it('blocks on a block verdict, surfaces issues, and keeps the credit (no refund)', async () => {
    const issues = [{ severity: 'high', code: 'hate_or_violence', message: 'violent phrasing' }];
    checkBrandSafety.mockResolvedValue({ verdict: 'block', summary: 'fix before publishing', issues });

    const result = await runPublishBrandSafetyGate(baseInput);

    expect(result).toEqual({ ok: false, reason: 'blocked', summary: 'fix before publishing', issues });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'block' }));
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it('refunds and returns an error (no audit) when the auditor throws', async () => {
    checkBrandSafety.mockRejectedValue(new Error('OpenAI 500'));

    const result = await runPublishBrandSafetyGate(baseInput);

    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2, refKind: 'safety', refId: 'post-1' }),
    );
    expect(insert).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: 'error', error: 'OpenAI 500' });
  });
});

describe('describeSafetyBlock', () => {
  it('returns the summary alone when there are no issues', () => {
    expect(describeSafetyBlock('all good', [])).toBe('all good');
  });

  it('appends up to three issues as a compact line', () => {
    const issues = [
      { severity: 'high' as const, code: 'hate_or_violence' as const, message: 'violent' },
      { severity: 'medium' as const, code: 'misleading' as const, message: 'overclaim' },
      { severity: 'low' as const, code: 'profanity' as const, message: 'mild swear' },
      { severity: 'low' as const, code: 'other' as const, message: 'ignored fourth' },
    ];
    const out = describeSafetyBlock('blocked', issues);
    expect(out).toBe('blocked (high: violent · medium: overclaim · low: mild swear)');
    expect(out).not.toMatch(/ignored fourth/);
  });
});
