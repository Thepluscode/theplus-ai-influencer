'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { listAiModels } from '@/lib/ai-models';
import {
  deleteContentPlan as removePlan,
  getContentPlan,
  saveContentPlan,
} from '@/lib/content-plans';
import { consumeCredits, COSTS, refundCredits } from '@/lib/credits';
import {
  BRAND_ENTITIES,
  CAMPAIGN_VISUAL_MODES,
  CONTENT_DELIVERABLES,
  CONTENT_STYLES,
  generateSeriesPlan,
  type PlanInput,
} from '@/lib/series-planner';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { PLATFORMS, POST_GOALS, type Platform } from '@/types/post';

export type SeriesPlanState =
  | { status: 'idle' }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> }
  | { status: 'insufficient_credits'; balance: number; required: number };

const PlanFormSchema = z.object({
  modelId: z.string().uuid('Pick a saved influencer'),
  name: z.string().min(1, 'Plan name required').max(120),
  campaign: z.string().min(1, 'Describe the campaign').max(800),
  topics: z.array(z.string().min(1).max(120)).min(1, 'Add at least one topic').max(12),
  audience: z.string().min(1, 'Describe the target audience').max(240),
  brandEntity: z.enum(BRAND_ENTITIES),
  deliverables: z.array(z.enum(CONTENT_DELIVERABLES)).min(1, 'Pick at least one output'),
  contentStyles: z.array(z.enum(CONTENT_STYLES)).min(1, 'Pick at least one style'),
  visualMode: z.enum(CAMPAIGN_VISUAL_MODES),
  goal: z.enum(POST_GOALS),
  durationDays: z.coerce.number().int().min(3).max(60),
  cadencePerWeek: z.coerce.number().int().min(1).max(14),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date'),
  platforms: z.array(z.enum(PLATFORMS)).min(1, 'Select at least one platform'),
});

function readForm(formData: FormData): Record<string, unknown> {
  const rawTopics = String(formData.get('topics') ?? '');
  return {
    modelId: formData.get('modelId'),
    name: formData.get('name'),
    campaign: formData.get('campaign'),
    topics: rawTopics
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean),
    audience: formData.get('audience'),
    brandEntity: formData.get('brandEntity') ?? 'individual',
    deliverables: formData.getAll('deliverables'),
    contentStyles: formData.getAll('contentStyles'),
    visualMode: formData.get('visualMode') ?? 'face_carousel',
    goal: formData.get('goal'),
    durationDays: formData.get('durationDays'),
    cadencePerWeek: formData.get('cadencePerWeek'),
    startDate: formData.get('startDate'),
    platforms: formData.getAll('platforms'),
  };
}

export async function generateSeriesPlanAction(
  _prev: SeriesPlanState | null,
  formData: FormData,
): Promise<SeriesPlanState> {
  const parsed = PlanFormSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      status: 'error',
      error: 'Please fix the highlighted fields.',
      fieldErrors,
    };
  }

  let newId: string;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);
    const models = await listAiModels(ws.id);
    const model = models.find((m) => m.id === parsed.data.modelId);
    if (!model) {
      return {
        status: 'error',
        error: 'Model not found.',
        fieldErrors: { modelId: 'Pick an influencer from your roster.' },
      };
    }

    const consume = await consumeCredits({
      workspaceId: ws.id,
      amount: COSTS.SERIES_PLAN_GENERATION,
      reason: 'series_plan_generation',
      refKind: 'series_plan',
    });
    if (!consume.ok) {
      return {
        status: 'insufficient_credits',
        balance: consume.balance,
        required: consume.required,
      };
    }

    const seed: PlanInput = {
      model: { name: model.name, wizard_input: model.wizard_input },
      campaign: parsed.data.campaign,
      goal: parsed.data.goal,
      durationDays: parsed.data.durationDays,
      cadencePerWeek: parsed.data.cadencePerWeek,
      startDate: parsed.data.startDate,
      platforms: parsed.data.platforms as Platform[],
      topics: parsed.data.topics,
      audience: parsed.data.audience,
      brandEntity: parsed.data.brandEntity,
      deliverables: parsed.data.deliverables,
      contentStyles: parsed.data.contentStyles,
      visualMode: parsed.data.visualMode,
    };

    let result;
    try {
      result = await generateSeriesPlan(seed);
    } catch (err) {
      await refundCredits({
        workspaceId: ws.id,
        amount: COSTS.SERIES_PLAN_GENERATION,
        refKind: 'series_plan',
      });
      throw err;
    }

    const saved = await saveContentPlan({
      workspaceId: ws.id,
      modelId: model.id,
      name: parsed.data.name,
      seed,
      items: result.items,
      summary: result.summary ?? null,
    });
    newId = saved.id;
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Plan generation failed.',
    };
  }

  revalidatePath('/series');
  revalidatePath('/studio');
  redirect(`/series/${newId}`);
}

export async function deleteContentPlanAction(formData: FormData): Promise<void> {
  const id = formData.get('planId');
  if (typeof id !== 'string' || !id) {
    throw new Error('planId required');
  }
  try {
    const ws = await getOrCreateCurrentWorkspaceFromCookies();
    const plan = await getContentPlan(id);
    if (!plan || plan.workspace_id !== ws.id) {
      throw new Error('Content plan not found.');
    }
    await removePlan(id);
    revalidatePath('/series');
  } catch (err) {
    // Surface via redirect so the list page can flash an error if needed.
    redirect(
      `/series?error=${encodeURIComponent(err instanceof Error ? err.message : 'delete failed')}`,
    );
  }
  redirect('/series');
}

async function getOrCreateCurrentWorkspaceFromCookies() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  return getOrCreateCurrentWorkspace(user);
}
