import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow } from '@/lib/supabase/types';
import type { InfluencerVisuals, InfluencerWizardInput } from '@/types/influencer';

interface SaveInput {
  workspaceId: string;
  input: InfluencerWizardInput;
  visuals: InfluencerVisuals;
}

export async function saveAiModel({ workspaceId, input, visuals }: SaveInput): Promise<AiModelRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_models')
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      wizard_input: input,
      portrait_url: visuals.portraitUrl,
      full_body_url: visuals.fullBodyUrl,
      portrait_generation_id: visuals.generationIds.portrait || null,
      full_body_generation_id: visuals.generationIds.fullBody || null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save AI model: ${error?.message ?? 'no row returned'}`);
  }
  return data;
}

export async function listAiModels(workspaceId: string): Promise<AiModelRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_models')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list AI models: ${error.message}`);
  }
  return data ?? [];
}
