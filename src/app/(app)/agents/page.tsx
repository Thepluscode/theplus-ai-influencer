import { publicEnv } from '@/lib/env';
import { listCreativeAgentRuns, type CreativeAgentRunSummary } from '@/lib/creative-agent-runs';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { WorkspaceBrandDefaultsRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { fallbackBrandDefaults, getWorkspaceControls } from '@/lib/workspace-controls';
import { CreativeAgentsLab, type BrandDefaultsSeed } from './creative-agents-lab';

export const dynamic = 'force-dynamic';

export default async function AgentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ agentsError?: string }>;
}) {
  let brandDefaults: WorkspaceBrandDefaultsRow = fallbackBrandDefaults(
    '00000000-0000-0000-0000-000000000000',
  );
  let recentRuns: CreativeAgentRunSummary[] = [];
  let historyError: string | null = null;
  const params = await searchParams;
  const actionError =
    typeof params?.agentsError === 'string' && params.agentsError.length > 0
      ? params.agentsError
      : null;

  if (publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const workspace = await getOrCreateCurrentWorkspace(user);
        const controls = await getWorkspaceControls(workspace.id);
        brandDefaults = controls.brandDefaults;
        try {
          recentRuns = await listCreativeAgentRuns(workspace.id);
        } catch (err) {
          historyError = 'Creative agent run history is waiting for migration 0015.';
          console.error('Failed to load creative agent run history', err);
        }
      }
    } catch (err) {
      console.error('Failed to load agent workspace brand defaults', err);
    }
  }

  const seed: BrandDefaultsSeed = {
    brandTone: brandDefaults.brand_tone,
    brandVibe: brandDefaults.brand_vibe,
    brandPalette: brandDefaults.brand_palette,
    defaultCta: brandDefaults.default_cta,
  };

  return (
    <CreativeAgentsLab
      brandDefaults={seed}
      recentRuns={recentRuns}
      historyError={historyError}
      actionError={actionError}
    />
  );
}
