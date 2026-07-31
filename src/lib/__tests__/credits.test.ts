import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();
const fromMock = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({ rpc: rpcMock, from: fromMock }),
}));

import { consumeCredits, refundCredits, getWorkspaceCredits } from '@/lib/credits';

// ---------------------------------------------------------------------------
// Ledger invariants — money path.
//
// SCOPE: these are unit tests at the Supabase RPC boundary. They verify what
// the TypeScript layer sends and how it interprets what comes back.
//
// They do NOT verify the invariants Postgres owns — atomicity of the
// check-and-decrement, debit-equals-credit between `workspaces.credits` and
// `credit_transactions`, or the concurrent double-spend the `credits >= amount`
// WHERE clause exists to prevent. Those live in plpgsql (0006) and need a real
// Postgres (Testcontainers / a Supabase branch) to exercise. Nothing here
// should be read as evidence that they hold.
//
// Refund idempotency is split the same way: these tests prove the audit ref is
// SENT, which is the half that can break in TypeScript. That a duplicate is
// actually rejected, and that the rolled-back subtransaction leaves no credit
// without a matching ledger row, is enforced by the partial unique index and
// the exception handler in 0021 — provable only against a real database.
// ---------------------------------------------------------------------------

const WS = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  rpcMock.mockReset();
  maybeSingleMock.mockReset();
  fromMock.mockClear();
  vi.restoreAllMocks();
});

describe('consumeCredits — debit path', () => {
  it('decrements via the atomic RPC and returns the new balance', async () => {
    rpcMock.mockResolvedValue({ data: 950, error: null });

    const result = await consumeCredits({
      workspaceId: WS,
      amount: 50,
      reason: 'influencer_render',
      refKind: 'influencer',
      refId: 'inf-1',
    });

    expect(result).toEqual({ ok: true, balanceAfter: 950 });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('consume_credits', {
      p_workspace_id: WS,
      p_amount: 50,
      p_reason: 'influencer_render',
      p_ref_kind: 'influencer',
      p_ref_id: 'inf-1',
    });
  });

  it('sends explicit nulls for the audit ref when the caller omits it', async () => {
    rpcMock.mockResolvedValue({ data: 10, error: null });

    await consumeCredits({ workspaceId: WS, amount: 5, reason: 'caption_generation' });

    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_ref_kind: null, p_ref_id: null });
  });

  it('reports insufficient (never ok) when the RPC returns the -1 sentinel', async () => {
    rpcMock.mockResolvedValue({ data: -1, error: null });
    maybeSingleMock.mockResolvedValue({ data: { credits: 12 }, error: null });

    const result = await consumeCredits({
      workspaceId: WS,
      amount: 50,
      reason: 'influencer_render',
    });

    expect(result).toEqual({ ok: false, insufficient: true, balance: 12, required: 50 });
  });

  it('fails closed when the RPC returns a non-numeric balance with no error', async () => {
    // A null/undefined `data` must never be read as a successful debit — the
    // caller would go on to spend a paid Luma/OpenAI call for free.
    rpcMock.mockResolvedValue({ data: null, error: null });
    maybeSingleMock.mockResolvedValue({ data: { credits: 400 }, error: null });

    const result = await consumeCredits({
      workspaceId: WS,
      amount: 50,
      reason: 'influencer_render',
    });

    expect(result.ok).toBe(false);
  });

  it('throws instead of acking success when the RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'deadlock detected' } });

    await expect(
      consumeCredits({ workspaceId: WS, amount: 50, reason: 'influencer_render' }),
    ).rejects.toThrow(/deadlock detected/);
  });

  it('does not touch the ledger for a zero-cost action', async () => {
    maybeSingleMock.mockResolvedValue({ data: { credits: 777 }, error: null });

    const result = await consumeCredits({
      workspaceId: WS,
      amount: 0,
      reason: 'caption_generation',
    });

    expect(result).toEqual({ ok: true, balanceAfter: 777 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('cannot mint credits through a negative amount', async () => {
    // consume_credits raises on p_amount <= 0 (0006:96). The wrapper must
    // surface that as a throw, not as a successful "debit" of -100.
    rpcMock.mockResolvedValue({ data: null, error: { message: 'amount must be positive' } });

    await expect(
      consumeCredits({ workspaceId: WS, amount: -100, reason: 'admin_adjustment' }),
    ).rejects.toThrow(/amount must be positive/);
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_amount: -100 });
  });
});

describe('refundCredits — reversal path', () => {
  it('posts a compensating entry through grant_credits', async () => {
    rpcMock.mockResolvedValue({ data: 1000, error: null });

    await refundCredits({ workspaceId: WS, amount: 50, refKind: 'influencer', refId: 'inf-1' });

    expect(rpcMock).toHaveBeenCalledWith(
      'grant_credits',
      expect.objectContaining({ p_workspace_id: WS, p_amount: 50, p_reason: 'refund' }),
    );
  });

  it('sends the audit ref, which is what the ledger deduplicates on', async () => {
    // The refKind/refId are the only thing distinguishing a retried reversal
    // from a second legitimate one. Dropping them here (as the pre-0021 code
    // did) silently disables the uniqueness guarantee in the database — the
    // call still succeeds, it just credits twice.
    rpcMock.mockResolvedValue({ data: 1000, error: null });

    await refundCredits({ workspaceId: WS, amount: 50, refKind: 'influencer', refId: 'inf-1' });

    expect(rpcMock.mock.calls[0][1]).toMatchObject({
      p_ref_kind: 'influencer',
      p_ref_id: 'inf-1',
    });
  });

  it('sends explicit nulls when the caller has no ref to deduplicate on', async () => {
    // A null ref is excluded from the partial unique index (0021), so this
    // reversal is NOT protected against double-crediting. Allowed, but the
    // payload must say so plainly rather than omitting the keys.
    rpcMock.mockResolvedValue({ data: 1000, error: null });

    await refundCredits({ workspaceId: WS, amount: 50 });

    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_ref_kind: null, p_ref_id: null });
  });

  it('does not post an entry for a zero-value reversal', async () => {
    await refundCredits({ workspaceId: WS, amount: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('survives an RPC failure without throwing, and logs it for reconciliation', async () => {
    // A refund failure must not mask the original error the caller is already
    // handling — but it must be recoverable from the logs, with enough context
    // to identify which operation lost the credits.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    await expect(
      refundCredits({ workspaceId: WS, amount: 50, refKind: 'influencer', refId: 'inf-1' }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][1]).toMatchObject({
      workspaceId: WS,
      amount: 50,
      refKind: 'influencer',
      refId: 'inf-1',
    });
  });
});

describe('getWorkspaceCredits', () => {
  it('treats a missing workspace as zero credits, not as spendable', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    expect(await getWorkspaceCredits(WS)).toBe(0);
  });

  it('throws on a read error rather than reporting a zero balance', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(getWorkspaceCredits(WS)).rejects.toThrow(/permission denied/);
  });
});
