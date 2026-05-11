'use server';

import { revalidatePath } from 'next/cache';
import { listAiModels } from '@/lib/ai-models';
import { generatePostVariants } from '@/lib/luma-post';
import { saveDraftPost } from '@/lib/posts';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { PostBriefInput, type PostVariant } from '@/types/post';

export type GeneratePostState =
  | { status: 'idle' }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> }
  | { status: 'success'; brief: PostBriefInput; variants: PostVariant[] };

export type SavePostState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'saved'; postId: string };

const Schema = PostBriefInput;

function readBrief(formData: FormData): Record<string, unknown> {
  return {
    modelId: formData.get('modelId'),
    name: formData.get('name'),
    platforms: formData.getAll('platforms'),
    format: formData.get('format'),
    brief: formData.get('brief'),
    scene: formData.get('scene') ?? '',
    outfit: formData.get('outfit') ?? '',
    props: formData.get('props') ?? '',
    brandTone: formData.get('brandTone'),
    cta: formData.get('cta'),
  };
}

export async function generatePostVariantsAction(
  _prev: GeneratePostState | null,
  formData: FormData,
): Promise<GeneratePostState> {
  const parsed = Schema.safeParse(readBrief(formData));
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
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: 'error', error: 'Not signed in.' };
    }
    const ws = await getOrCreateCurrentWorkspace(user);
    const models = await listAiModels(ws.id);
    const model = models.find((m) => m.id === parsed.data.modelId);
    if (!model) {
      return {
        status: 'error',
        error: 'Selected model not found in your workspace.',
        fieldErrors: { modelId: 'Pick a model that belongs to your workspace.' },
      };
    }

    const variants = await generatePostVariants(parsed.data, model, 2);
    return { status: 'success', brief: parsed.data, variants };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Luma error';
    return { status: 'error', error: message };
  }
}

export async function saveDraftPostAction(
  _prev: SavePostState | null,
  formData: FormData,
): Promise<SavePostState> {
  const briefJson = formData.get('brief');
  const variantsJson = formData.get('variants');
  const caption = formData.get('caption');

  if (typeof briefJson !== 'string' || typeof variantsJson !== 'string') {
    return { status: 'error', error: 'Missing payload — regenerate variants and try again.' };
  }

  let brief: PostBriefInput;
  let variants: PostVariant[];
  try {
    brief = Schema.parse(JSON.parse(briefJson));
    variants = JSON.parse(variantsJson) as PostVariant[];
    if (!Array.isArray(variants) || variants.length === 0) {
      throw new Error('no variants in payload');
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
    const ws = await getOrCreateCurrentWorkspace(user);
    const saved = await saveDraftPost({
      workspaceId: ws.id,
      brief,
      variants,
      caption: typeof caption === 'string' && caption.trim() ? caption.trim() : null,
    });
    revalidatePath('/create-post');
    revalidatePath('/calendar');
    return { status: 'saved', postId: saved.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed';
    return { status: 'error', error: message };
  }
}
