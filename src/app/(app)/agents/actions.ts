'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  markCreativeAgentReviewIssueFixed,
  saveCreativeAgentRun,
  sendCreativeAgentRunToStoryboard,
} from '@/lib/creative-agent-runs';
import {
  CreativeAgentRunPayloadSchema,
  type CreativeAgentRunPayload,
} from '@/lib/creative-agents-schema';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';

export type SaveCreativeAgentRunState =
  | {
      status: 'success';
      message: string;
      runId: string;
      issueIds: Record<string, string>;
      prompt: string;
    }
  | {
      status: 'error';
      error: string;
      prompt?: string;
    };

const RowIdSchema = z.string().uuid();

async function requireWorkspace() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Sign in to save creative agent runs.');
  }
  const workspace = await getOrCreateCurrentWorkspace(user);
  return workspace;
}

function parsePayload(formData: FormData): CreativeAgentRunPayload {
  const raw = formData.get('payload');
  if (typeof raw !== 'string') {
    throw new Error('Missing creative agent payload.');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Creative agent payload is not valid JSON.');
  }
  const parsed = CreativeAgentRunPayloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid creative agent payload.');
  }
  return parsed.data;
}

function parseOptionalRunId(formData: FormData): string | null {
  const raw = formData.get('runId');
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  return RowIdSchema.parse(raw);
}

export async function saveCreativeAgentRunAction(
  _prevState: SaveCreativeAgentRunState | null,
  formData: FormData,
): Promise<SaveCreativeAgentRunState> {
  let payload: CreativeAgentRunPayload;
  try {
    payload = parsePayload(formData);
    const workspace = await requireWorkspace();
    const saved = await saveCreativeAgentRun({ workspaceId: workspace.id, payload });
    revalidatePath('/agents');
    return {
      status: 'success',
      message: 'Run saved.',
      runId: saved.run.id,
      issueIds: saved.issueIds,
      prompt: payload.prompt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save creative agent run.';
    return {
      status: 'error',
      error: message,
      prompt:
        typeof formData.get('payload') === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse(formData.get('payload') as string) as {
                  prompt?: unknown;
                };
                return typeof parsed.prompt === 'string' ? parsed.prompt : undefined;
              } catch {
                return undefined;
              }
            })()
          : undefined,
    };
  }
}

export async function markCreativeAgentIssueFixedAction(formData: FormData): Promise<void> {
  const runId = RowIdSchema.parse(formData.get('runId'));
  const issueId = RowIdSchema.parse(formData.get('issueId'));
  const workspace = await requireWorkspace();
  await markCreativeAgentReviewIssueFixed({ workspaceId: workspace.id, runId, issueId });
  revalidatePath('/agents');
}

export async function sendCreativeAgentRunToStoryboardAction(formData: FormData): Promise<never> {
  let storyboardId: string;
  try {
    const payload = parsePayload(formData);
    const runId = parseOptionalRunId(formData);
    const workspace = await requireWorkspace();
    const result = await sendCreativeAgentRunToStoryboard({
      workspaceId: workspace.id,
      payload,
      runId,
    });
    storyboardId = result.storyboardId;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Could not send creative agent run to Storyboard.';
    redirect(`/agents?agentsError=${encodeURIComponent(message)}`);
  }

  revalidatePath('/agents');
  revalidatePath('/storyboard');
  redirect(`/storyboard/${storyboardId}`);
}
