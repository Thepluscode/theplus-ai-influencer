'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { listAiModels } from '@/lib/ai-models';
import {
  deleteDm as removeDm,
  getDmThreadById,
  saveTriagedDm,
  triageDm,
  updateDmStatus,
} from '@/lib/dm-engine';
import { consumeCredits, COSTS, refundCredits } from '@/lib/credits';
import { isDemoMode } from '@/lib/demo-mode';
import { serverEnv } from '@/lib/env';
import { getZernioClient } from '@/lib/zernio';
import { PLATFORMS } from '@/types/post';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';

export type AddDmState =
  | { status: 'idle' }
  | { status: 'error'; error: string }
  | { status: 'insufficient_credits'; balance: number; required: number }
  | { status: 'saved'; id: string };

const AddDmSchema = z.object({
  modelId: z.string().uuid().optional().or(z.literal('')),
  platform: z.enum(PLATFORMS),
  authorHandle: z.string().min(1, 'Author handle is required').max(60),
  messageText: z.string().min(1, 'Paste the DM').max(4000),
});

export async function addPastedDmAction(
  _prev: AddDmState | null,
  formData: FormData,
): Promise<AddDmState> {
  const parsed = AddDmSchema.safeParse({
    modelId: formData.get('modelId') ?? '',
    platform: formData.get('platform'),
    authorHandle: formData.get('authorHandle'),
    messageText: formData.get('messageText'),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
    };
  }
  if (isDemoMode()) {
    revalidatePath('/inbox');
    return { status: 'saved', id: '00000000-0000-4000-8000-000000000699' };
  }
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'Not signed in.' };
    const ws = await getOrCreateCurrentWorkspace(user);

    const consume = await consumeCredits({
      workspaceId: ws.id,
      amount: COSTS.DM_TRIAGE,
      reason: 'dm_triage',
      refKind: 'dm',
    });
    if (!consume.ok) {
      return {
        status: 'insufficient_credits',
        balance: consume.balance,
        required: consume.required,
      };
    }

    const models = parsed.data.modelId ? await listAiModels(ws.id) : [];
    const model = parsed.data.modelId
      ? models.find((m) => m.id === parsed.data.modelId)
      : undefined;

    let triage;
    try {
      triage = await triageDm({
        messageText: parsed.data.messageText,
        personaName: model?.name ?? 'the persona',
        personaVibe: model?.wizard_input?.vibe,
      });
    } catch (err) {
      await refundCredits({
        workspaceId: ws.id,
        amount: COSTS.DM_TRIAGE,
        refKind: 'dm',
      });
      throw err;
    }

    const saved = await saveTriagedDm({
      workspaceId: ws.id,
      platform: parsed.data.platform,
      authorHandle: parsed.data.authorHandle,
      lastMessage: parsed.data.messageText,
      triage,
    });
    revalidatePath('/inbox');
    return { status: 'saved', id: saved.id };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Could not triage DM.',
    };
  }
}

export async function markDmRepliedAction(formData: FormData): Promise<void> {
  const id = formData.get('id');
  const replyRaw = formData.get('reply');
  if (typeof id !== 'string' || !id) return;
  const reply = typeof replyRaw === 'string' ? replyRaw : undefined;
  if (isDemoMode()) {
    revalidatePath('/inbox');
    return;
  }

  const thread = await getDmThreadById(id);
  if (!thread) return;
  const message = (reply ?? thread.suggested_reply ?? '').trim();

  // Webhook-ingested DMs carry Zernio provenance — send the reply back to the
  // conversation. Fail loudly so a failed send never gets marked "replied".
  if (serverEnv.ZERNIO_API_KEY && thread.zernio_conversation_id && thread.zernio_account_id) {
    if (!message) {
      throw new Error('Write a reply before sending — empty replies are not sent.');
    }
    try {
      await getZernioClient().sendDmReply({
        conversationId: thread.zernio_conversation_id,
        accountId: thread.zernio_account_id,
        message,
      });
    } catch (err) {
      throw new Error(
        `DM not sent on ${thread.platform}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await updateDmStatus(id, 'replied', reply);
  revalidatePath('/inbox');
}

export async function archiveDmAction(formData: FormData): Promise<void> {
  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return;
  if (isDemoMode()) {
    revalidatePath('/inbox');
    return;
  }
  await updateDmStatus(id, 'archived');
  revalidatePath('/inbox');
}

export async function snoozeDmAction(formData: FormData): Promise<void> {
  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return;
  if (isDemoMode()) {
    revalidatePath('/inbox');
    return;
  }
  await updateDmStatus(id, 'snoozed');
  revalidatePath('/inbox');
}

export async function deleteDmAction(formData: FormData): Promise<void> {
  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return;
  if (isDemoMode()) {
    revalidatePath('/inbox');
    return;
  }
  await removeDm(id);
  revalidatePath('/inbox');
}
