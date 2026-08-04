'use server';

import { revalidatePath } from 'next/cache';
import { listAiModels, saveAiModel } from '@/lib/ai-models';
import { getPlan, type PlanId } from '@/lib/billing/plans';
import { consumeCredits, COSTS, refundCredits } from '@/lib/credits';
import { generateInfluencerVisuals } from '@/lib/luma-influencer';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { InfluencerWizardInput, type InfluencerVisuals } from '@/types/influencer';
import { DEMO_MODEL_ID, getDemoInfluencerVisuals, isDemoMode } from '@/lib/demo-mode';

export type GenerateState =
  | { status: 'idle' }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> }
  | {
      status: 'insufficient_credits';
      balance: number;
      required: number;
    }
  | {
      status: 'plan_limit';
      planId: PlanId;
      planName: string;
      max: number;
      current: number;
    }
  | { status: 'success'; visuals: InfluencerVisuals; input: InfluencerWizardInput };

export type SaveState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'saved'; modelId: string };

const FormSchema = InfluencerWizardInput;

export async function generateInfluencer(
  _prev: GenerateState | null,
  formData: FormData,
): Promise<GenerateState> {
  const raw = {
    name: formData.get('name'),
    gender: formData.get('gender'),
    bodyType: formData.get('bodyType'),
    skinTone: formData.get('skinTone'),
    ageRange: formData.get('ageRange'),
    hair: formData.get('hair'),
    vibe: formData.get('vibe'),
    customPrompt: formData.get('customPrompt') ?? '',
  };

  const parsed = FormSchema.safeParse(raw);
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

  if (isDemoMode()) {
    return {
      status: 'success',
      visuals: getDemoInfluencerVisuals(parsed.data),
      input: parsed.data,
    };
  }

  // Plan + credit gates must happen on the server BEFORE the Luma call.
  // The atomic credit RPC means two simultaneous tabs can't both succeed
  // when the balance is only enough for one; the plan-limit check below
  // is a soft gate (race-tolerant — at worst one extra influencer lands).
  let workspaceId: string;
  let planId: PlanId = 'free';
  let currentCount = 0;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);
    workspaceId = ws.id;

    const [planRow, existing] = await Promise.all([
      supabase.from('workspaces').select('plan').eq('id', ws.id).maybeSingle(),
      listAiModels(ws.id),
    ]);
    planId = (planRow.data?.plan as PlanId) ?? 'free';
    currentCount = existing.length;
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not load workspace.',
    };
  }

  const plan = getPlan(planId);
  if (currentCount >= plan.maxInfluencers) {
    return {
      status: 'plan_limit',
      planId,
      planName: plan.name,
      max: plan.maxInfluencers,
      current: currentCount,
    };
  }

  // One id per attempt, threaded through the debit AND its refund. It is what
  // pairs them in credit_transactions, and what lets migration 0021's unique
  // index reject a second refund for the SAME attempt while still allowing a
  // genuine retry (new attempt, new id) to be refunded on its own merits.
  const attemptId = crypto.randomUUID();
  const consume = await consumeCredits({
    workspaceId,
    amount: COSTS.INFLUENCER_RENDER,
    reason: 'influencer_render',
    refKind: 'wizard',
    refId: attemptId,
  });
  if (!consume.ok) {
    return {
      status: 'insufficient_credits',
      balance: consume.balance,
      required: consume.required,
    };
  }

  try {
    const visuals = await generateInfluencerVisuals(parsed.data);
    return { status: 'success', visuals, input: parsed.data };
  } catch (err) {
    // Luma failed after we already debited — refund the consumer so they
    // aren't punished for an upstream outage.
    await refundCredits({
      workspaceId,
      amount: COSTS.INFLUENCER_RENDER,
      refKind: 'wizard',
      refId: attemptId,
    });
    const message = err instanceof Error ? err.message : 'Unknown Luma error';
    return { status: 'error', error: message };
  }
}

export async function saveGeneratedInfluencer(
  _prev: SaveState | null,
  formData: FormData,
): Promise<SaveState> {
  const inputJson = formData.get('input');
  const visualsJson = formData.get('visuals');
  if (typeof inputJson !== 'string' || typeof visualsJson !== 'string') {
    return { status: 'error', error: 'Missing wizard payload — regenerate and try again.' };
  }

  let input: InfluencerWizardInput;
  let visuals: InfluencerVisuals;
  try {
    input = FormSchema.parse(JSON.parse(inputJson));
    visuals = JSON.parse(visualsJson) as InfluencerVisuals;
    if (!visuals.portraitUrl || !visuals.fullBodyUrl) {
      throw new Error('visuals payload incomplete');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid payload';
    return { status: 'error', error: `Could not save: ${message}` };
  }

  if (isDemoMode()) {
    return { status: 'saved', modelId: DEMO_MODEL_ID };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: 'error', error: 'Not signed in.' };
    }

    const workspace = await getOrCreateCurrentWorkspace(user);
    const saved = await saveAiModel({ workspaceId: workspace.id, input, visuals });
    revalidatePath('/studio');
    return { status: 'saved', modelId: saved.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed';
    return { status: 'error', error: message };
  }
}

// ---------------------------------------------------------------------------
// Replace a saved persona's identity image.
// ---------------------------------------------------------------------------
// The wizard only ever GENERATES a face, so an operator with their own shoot
// had no way to make it the persona. This swaps the stored URL on an existing
// model. `portrait_url` is what the whole pipeline passes to Luma as
// `character_ref` (luma-post.ts, content-media.ts, storyboard.ts,
// content-pipeline.ts), so replacing it re-points every future render.
// ---------------------------------------------------------------------------

export type ReplaceImageState =
  | { status: 'idle' }
  | { status: 'saved'; kind: 'portrait' | 'full_body' }
  | { status: 'error'; error: string };

const PERSONA_REF_PREFIX = '/storage/v1/object/public/persona-refs/';

export async function replacePersonaImage(
  _prev: ReplaceImageState | null,
  formData: FormData,
): Promise<ReplaceImageState> {
  const modelId = formData.get('modelId');
  const kind = formData.get('kind');
  const url = formData.get('url');

  if (typeof modelId !== 'string' || !modelId) {
    return { status: 'error', error: 'Missing persona id.' };
  }
  if (kind !== 'portrait' && kind !== 'full_body') {
    return { status: 'error', error: 'Unknown image kind.' };
  }
  // Only accept a URL this app just wrote. Without this the field is an open
  // redirect into Luma: any attacker-supplied URL would be fetched server-side
  // during the next render (SSRF), and would silently become the persona.
  if (typeof url !== 'string' || !url.includes(PERSONA_REF_PREFIX)) {
    return { status: 'error', error: 'Image must be uploaded through this form.' };
  }

  if (isDemoMode()) {
    return { status: 'saved', kind };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: 'error', error: 'Not signed in.' };
    }
    const workspace = await getOrCreateCurrentWorkspace(user);

    // Scope the write to the caller's workspace. RLS covers this too; the
    // explicit filter means a mismatched id updates zero rows instead of
    // relying on the policy alone.
    // Branch rather than a computed key: a `{ [column]: url }` object widens to
    // Record<string, string> and loses the Update type entirely, so a typo in a
    // column name would compile.
    const patch = kind === 'portrait' ? { portrait_url: url } : { full_body_url: url };
    const { data, error } = await supabase
      .from('ai_models')
      .update(patch)
      .eq('id', modelId)
      .eq('workspace_id', workspace.id)
      .select('id');
    if (error) {
      return { status: 'error', error: error.message };
    }
    if (!data?.length) {
      // Zero rows means the persona is not in this workspace. Do not say which.
      return { status: 'error', error: 'Persona not found.' };
    }

    revalidatePath('/studio');
    return { status: 'saved', kind };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not replace the image.',
    };
  }
}
