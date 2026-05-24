import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { ZernioAccount } from '@/lib/zernio';

// ---------------------------------------------------------------------------
// social_accounts sync
// ---------------------------------------------------------------------------
// Maps connected Zernio accounts to a workspace so an inbound DM webhook
// (which only carries account.id, no post) can be attributed to the right
// workspace. Best-effort: failures are logged, never thrown, so they can't
// break the /accounts page render (Rule 9 — optional dependency).
// ---------------------------------------------------------------------------

export async function syncSocialAccounts(
  workspaceId: string,
  accounts: ZernioAccount[],
): Promise<void> {
  if (accounts.length === 0) return;
  try {
    const supabase = await getSupabaseServerClient();
    const rows = accounts.map((a) => ({
      workspace_id: workspaceId,
      zernio_account_id: a._id,
      platform: a.platform,
      username: a.username ?? null,
      display_name: a.displayName ?? null,
    }));
    const { error } = await supabase
      .from('social_accounts')
      .upsert(rows, { onConflict: 'zernio_account_id' });
    if (error) {
      console.error('[social-accounts] sync failed:', error.message);
    }
  } catch (err) {
    console.error('[social-accounts] sync threw:', err instanceof Error ? err.message : err);
  }
}
