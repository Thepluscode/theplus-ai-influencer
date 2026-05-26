import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { ContentPlanRow } from '@/lib/supabase/types';
import type { PlanInput, PlanItem } from '@/lib/series-planner';

export async function saveContentPlan(input: {
  workspaceId: string;
  modelId: string | null;
  name: string;
  seed: PlanInput;
  items: PlanItem[];
  summary: string | null;
}): Promise<ContentPlanRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_plans')
    .insert({
      workspace_id: input.workspaceId,
      model_id: input.modelId,
      name: input.name,
      goal: input.seed.goal,
      duration_days: input.seed.durationDays,
      cadence_per_week: input.seed.cadencePerWeek,
      start_date: input.seed.startDate,
      seed_inputs: {
        campaign: input.seed.campaign,
        platforms: input.seed.platforms,
        topics: input.seed.topics,
        audience: input.seed.audience,
        brandEntity: input.seed.brandEntity,
        deliverables: input.seed.deliverables,
        contentStyles: input.seed.contentStyles,
        visualMode: input.seed.visualMode,
        summary: input.summary,
      },
      items: input.items,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to save content plan: ${error?.message ?? 'no row'}`);
  }
  return data;
}

export async function listContentPlans(workspaceId: string): Promise<ContentPlanRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_plans')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list content plans: ${error.message}`);
  }
  return data ?? [];
}

export async function getContentPlan(id: string): Promise<ContentPlanRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_plans')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load content plan: ${error.message}`);
  }
  return data;
}

export async function updateContentPlanItems(
  id: string,
  items: PlanItem[],
): Promise<ContentPlanRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('content_plans')
    .update({ items })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to update content plan: ${error?.message ?? 'no row'}`);
  }
  return data;
}

export async function deleteContentPlan(id: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from('content_plans').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete content plan: ${error.message}`);
  }
}
