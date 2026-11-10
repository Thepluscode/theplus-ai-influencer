'use server';

import { revalidatePath } from 'next/cache';
import { listAiModels } from '@/lib/ai-models';
import { consumeCredits, COSTS, refundCredits } from '@/lib/credits';
import { getCreation, insertCreation, renderCreation, toCreationView } from '@/lib/creations';
import { getDemoModels, isDemoMode } from '@/lib/demo-mode';
import { mentionErrorMessage, resolveMention } from '@/lib/handles';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { CreateInput, type CreationView } from '@/types/creation';

export type CreateState =
  | { status: 'idle' }
  | { status: 'error'; error: string; fieldErrors?: Record<string, string> }
  | { status: 'insufficient_credits'; balance: number; required: number }
  | { status: 'success'; creation: CreationView };

function readInput(formData: FormData) {
  const source = formData.get('sourceCreationId');
  return {
    mode: formData.get('mode'),
    prompt: formData.get('prompt'),
    aspect: formData.get('aspect') ?? undefined,
    sourceCreationId: typeof source === 'string' && source ? source : undefined,
  };
}

/**
 * Renders one picture or edit. Order matters:
 * 1. resolve @mentions against the workspace's personas — an unknown handle is
 *    refused before any credit moves, never rendered without the face lock;
 * 2. for an edit, load the source by id from this workspace (never a URL);
 * 3. charge, render, refund on failure — one fresh id is the ref for both, so a
 *    retried refund is deduplicated by the 0021 index;
 * 4. record the result; if recording fails the paid asset is still returned.
 */
export async function createAction(
  _prev: CreateState | null,
  formData: FormData,
): Promise<CreateState> {
  const parsed = CreateInput.safeParse(readInput(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: 'error', error: 'Please fix the highlighted fields.', fieldErrors };
  }
  const input = parsed.data;
  const cost = input.mode === 'edit' ? COSTS.CREATE_EDIT : COSTS.CREATE_PICTURE;

  if (isDemoMode()) {
    const personas = getDemoModels();
    const resolved = resolveMention(input.prompt, personas);
    if (!resolved.ok) {
      return {
        status: 'error',
        error: mentionErrorMessage(resolved),
        fieldErrors: { prompt: mentionErrorMessage(resolved) },
      };
    }
    const asset = await renderCreation({
      mode: input.mode,
      prompt: input.prompt,
      aspect: input.aspect,
      persona: resolved.persona,
      sourceUrl:
        input.mode === 'edit' ? 'https://picsum.photos/seed/demo-edit-source/768/1024' : undefined,
    });
    return {
      status: 'success',
      creation: {
        id: crypto.randomUUID(),
        mode: input.mode,
        prompt: input.prompt,
        personaName: resolved.persona?.name ?? null,
        aspect: input.aspect,
        assetUrl: asset.url,
        creditsSpent: 0,
        createdAt: new Date().toISOString(),
        saved: false,
      },
    };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);

    const personas = await listAiModels(ws.id);
    const resolved = resolveMention(input.prompt, personas);
    if (!resolved.ok) {
      const message = mentionErrorMessage(resolved);
      return { status: 'error', error: message, fieldErrors: { prompt: message } };
    }

    let sourceUrl: string | undefined;
    let persona = resolved.persona;
    if (input.mode === 'edit') {
      const source = await getCreation(ws.id, input.sourceCreationId!);
      if (!source) {
        return {
          status: 'error',
          error: 'That result is not in this workspace.',
          fieldErrors: { sourceCreationId: 'Pick one of your results to edit.' },
        };
      }
      sourceUrl = source.asset_url;
      // An edit with no @mention keeps the source's face lock; editing a
      // persona's picture must not quietly turn into a stranger.
      persona ??= personas.find((p) => p.id === source.persona_id) ?? null;
    }

    const id = crypto.randomUUID();
    const consume = await consumeCredits({
      workspaceId: ws.id,
      amount: cost,
      reason: 'post_variant_render',
      refKind: 'creation',
      refId: id,
    });
    if (!consume.ok) {
      return {
        status: 'insufficient_credits',
        balance: consume.balance,
        required: consume.required,
      };
    }

    let asset: { url: string; generationId: string };
    try {
      asset = await renderCreation({
        mode: input.mode,
        prompt: input.prompt,
        aspect: input.aspect,
        persona,
        sourceUrl,
      });
    } catch (renderErr) {
      await refundCredits({ workspaceId: ws.id, amount: cost, refKind: 'creation', refId: id });
      throw renderErr;
    }

    const record = {
      id,
      workspaceId: ws.id,
      mode: input.mode,
      prompt: input.prompt,
      personaId: persona?.id ?? null,
      sourceCreationId: input.mode === 'edit' ? input.sourceCreationId! : null,
      aspect: input.aspect,
      assetUrl: asset.url,
      generationId: asset.generationId,
      creditsSpent: cost,
    };
    try {
      const row = await insertCreation(record);
      revalidatePath('/create');
      return { status: 'success', creation: toCreationView(row, personas) };
    } catch (saveErr) {
      // The render is paid for and the asset exists: hand it back rather than
      // lose it, and leave a loud trail for manual reconciliation.
      console.error(
        '[create] render succeeded but the record was not saved',
        { ...record },
        saveErr,
      );
      return {
        status: 'success',
        creation: {
          id,
          mode: input.mode,
          prompt: input.prompt,
          personaName: persona?.name ?? null,
          aspect: input.aspect,
          assetUrl: asset.url,
          creditsSpent: cost,
          createdAt: new Date().toISOString(),
          saved: false,
        },
      };
    }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Unknown render error' };
  }
}
