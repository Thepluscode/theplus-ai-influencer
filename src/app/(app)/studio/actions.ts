'use server';

import { revalidatePath } from 'next/cache';
import { saveAiModel } from '@/lib/ai-models';
import { generateInfluencerVisuals } from '@/lib/luma-influencer';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { InfluencerWizardInput, type InfluencerVisuals } from '@/types/influencer';

export type GenerateState =
  | { status: 'idle' }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> }
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

  try {
    const visuals = await generateInfluencerVisuals(parsed.data);
    return { status: 'success', visuals, input: parsed.data };
  } catch (err) {
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
