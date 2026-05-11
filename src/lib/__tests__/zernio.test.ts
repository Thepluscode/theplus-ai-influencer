import { describe, expect, it } from 'vitest';
import { pickAccountsForPlatforms, type ZernioAccount } from '../zernio';

const acct = (overrides: Partial<ZernioAccount> & Pick<ZernioAccount, '_id' | 'platform'>): ZernioAccount => ({
  isActive: true,
  ...overrides,
});

describe('pickAccountsForPlatforms', () => {
  it('matches case-insensitively and returns the first active account per platform', () => {
    const accounts: ZernioAccount[] = [
      acct({ _id: 'a1', platform: 'instagram', username: 'first' }),
      acct({ _id: 'a2', platform: 'INSTAGRAM', username: 'second' }),
      acct({ _id: 'a3', platform: 'tiktok' }),
    ];
    const { resolved, missing } = pickAccountsForPlatforms(accounts, ['instagram', 'tiktok']);
    expect(resolved).toEqual([
      { platform: 'instagram', accountId: 'a1' },
      { platform: 'tiktok', accountId: 'a3' },
    ]);
    expect(missing).toEqual([]);
  });

  it('skips inactive accounts', () => {
    const accounts: ZernioAccount[] = [
      acct({ _id: 'a1', platform: 'instagram', isActive: false }),
      acct({ _id: 'a2', platform: 'instagram', isActive: true }),
    ];
    const { resolved } = pickAccountsForPlatforms(accounts, ['instagram']);
    expect(resolved).toEqual([{ platform: 'instagram', accountId: 'a2' }]);
  });

  it('reports missing platforms separately so the caller can warn', () => {
    const accounts: ZernioAccount[] = [acct({ _id: 'a1', platform: 'instagram' })];
    const { resolved, missing } = pickAccountsForPlatforms(accounts, ['instagram', 'tiktok', 'youtube']);
    expect(resolved).toEqual([{ platform: 'instagram', accountId: 'a1' }]);
    expect(missing).toEqual(['tiktok', 'youtube']);
  });

  it('treats undefined isActive as active (Zernio sometimes omits the field)', () => {
    const accounts: ZernioAccount[] = [{ _id: 'a1', platform: 'instagram' }];
    const { resolved } = pickAccountsForPlatforms(accounts, ['instagram']);
    expect(resolved).toEqual([{ platform: 'instagram', accountId: 'a1' }]);
  });
});
