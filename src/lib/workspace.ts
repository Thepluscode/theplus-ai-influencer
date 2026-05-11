import 'server-only';
import type { User } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { WorkspaceRow } from '@/lib/supabase/types';

/**
 * Resolve the user's workspace, creating one on the fly if the auth-trigger
 * didn't fire (e.g. the user existed before the migration was applied).
 *
 * For v1 every user has exactly one workspace; this returns it. When we add
 * multi-workspace support, callers should pass an explicit workspaceId.
 */
export async function getOrCreateCurrentWorkspace(
  user: Pick<User, 'id' | 'email' | 'user_metadata'>,
): Promise<WorkspaceRow> {
  const supabase = await getSupabaseServerClient();

  const { data: existing, error: selectErr } = await supabase
    .from('workspaces')
    .select('*')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectErr) {
    throw new Error(`Failed to look up workspace: ${selectErr.message}`);
  }
  if (existing) return existing;

  const fallbackName =
    (user.user_metadata?.workspace_name as string | undefined) ??
    (user.email ? `${user.email.split('@')[0]}'s workspace` : 'My workspace');

  const { data: created, error: insertErr } = await supabase
    .from('workspaces')
    .insert({ owner_user_id: user.id, name: fallbackName })
    .select('*')
    .single();

  if (insertErr || !created) {
    throw new Error(
      `Failed to bootstrap workspace: ${insertErr?.message ?? 'no row returned'}`,
    );
  }
  return created;
}
