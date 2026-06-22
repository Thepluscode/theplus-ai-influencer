import 'server-only';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { DEMO_SOURCE_ID, isDemoMode } from '@/lib/demo-mode';
import {
  createContentSourceSchema,
  sourceTypeFromMime,
  type CreateContentSourceInput,
} from '@/lib/content-sources-schema';
import { createContentSource } from '@/lib/content-sources';
import { enqueueContentJob } from '@/lib/content-jobs';
import { COSTS } from '@/lib/credits';

export type CreateSourceState =
  | { ok: true; sourceId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function deriveTitle(input: CreateContentSourceInput): string {
  if (input.title && input.title.trim()) return input.title.trim().slice(0, 200);
  if (input.mode === 'paste' && input.text) {
    const firstLine = input.text.trim().split('\n')[0]?.trim() ?? '';
    return (firstLine.slice(0, 80) || 'Pasted source').trim();
  }
  if (input.mode === 'upload' && input.storagePath) {
    const base = input.storagePath.split('/').pop() ?? 'Uploaded source';
    return base.slice(0, 200);
  }
  return 'Untitled source';
}

export async function createContentSourceFromInput(
  input: CreateContentSourceInput,
): Promise<CreateSourceState> {
  const parsed = createContentSourceSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'Please fix the highlighted fields.', fieldErrors };
  }
  const data = parsed.data;

  if (isDemoMode()) {
    return { ok: true, sourceId: DEMO_SOURCE_ID };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Sign in to add a source.' };
  }
  const ws = await getOrCreateCurrentWorkspace(user);

  const type = data.mode === 'paste' ? 'paste' : (sourceTypeFromMime(data.mimeType ?? '') ?? 'txt');

  let source;
  try {
    source = await createContentSource({
      workspaceId: ws.id,
      title: deriveTitle(data),
      type,
      storagePath: data.mode === 'upload' ? (data.storagePath ?? null) : null,
      byteSize: data.mode === 'upload' ? (data.byteSize ?? null) : null,
      mimeType: data.mode === 'upload' ? (data.mimeType ?? null) : null,
      rawText: data.mode === 'paste' ? (data.text ?? null) : null,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save source.' };
  }

  try {
    await enqueueContentJob({
      workspaceId: ws.id,
      kind: 'extract',
      sourceId: source.id,
      costCharged:
        type === 'audio' || type === 'video'
          ? COSTS.SOURCE_TRANSCRIPTION
          : COSTS.SOURCE_EXTRACTION_TEXT,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Source saved but extraction could not start.',
    };
  }

  revalidatePath('/content-os');
  return { ok: true, sourceId: source.id };
}
