import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type {
  WorkspaceBrandDefaultsRow,
  WorkspaceInviteRow,
  WorkspaceWebhookRow,
} from '@/lib/supabase/types';
import { DEFAULT_BRAND_DEFAULTS } from './workspace-controls-schema';

export type WorkspaceControls = {
  brandDefaults: WorkspaceBrandDefaultsRow;
  invites: WorkspaceInviteRow[];
  webhooks: WorkspaceWebhookRow[];
};

export function fallbackBrandDefaults(workspaceId: string): WorkspaceBrandDefaultsRow {
  const now = new Date(0).toISOString();
  return {
    workspace_id: workspaceId,
    brand_tone: DEFAULT_BRAND_DEFAULTS.brand_tone,
    brand_vibe: DEFAULT_BRAND_DEFAULTS.brand_vibe,
    brand_palette: DEFAULT_BRAND_DEFAULTS.brand_palette,
    default_cta: DEFAULT_BRAND_DEFAULTS.default_cta,
    created_at: now,
    updated_at: now,
  };
}

export async function getWorkspaceControls(workspaceId: string): Promise<WorkspaceControls> {
  const supabase = await getSupabaseServerClient();

  const [brandDefaults, invites, webhooks] = await Promise.all([
    supabase
      .from('workspace_brand_defaults')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('workspace_invites')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('workspace_webhooks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
  ]);

  if (brandDefaults.error) {
    throw new Error(`Failed to load brand defaults: ${brandDefaults.error.message}`);
  }
  if (invites.error) {
    throw new Error(`Failed to load team invites: ${invites.error.message}`);
  }
  if (webhooks.error) {
    throw new Error(`Failed to load webhooks: ${webhooks.error.message}`);
  }

  return {
    brandDefaults: brandDefaults.data ?? fallbackBrandDefaults(workspaceId),
    invites: invites.data ?? [],
    webhooks: webhooks.data ?? [],
  };
}
