'use server';

import { generateInfluencerVisuals } from '@/lib/luma-influencer';
import { InfluencerWizardInput, type InfluencerVisuals } from '@/types/influencer';

export type GenerateState =
  | { status: 'idle' }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> }
  | { status: 'success'; visuals: InfluencerVisuals; input: InfluencerWizardInput };

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
