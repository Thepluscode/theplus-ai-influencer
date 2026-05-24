import 'server-only';
import { serverEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { CommentRow } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Comment Watcher engine — v4 of STRATEGY.md
// ---------------------------------------------------------------------------
// This module holds the LLM logic (classification + reply drafting) plus
// CRUD. Comments arrive two ways, both feeding the same `comments` table:
//   1. Auto-ingest from Zernio's `comment.received` webhook
//      (src/lib/zernio-webhooks.ts) — the default path.
//   2. Manual paste (addPastedCommentAction) — fallback for platforms/posts
//      Zernio isn't tracking.
// Approved replies post back to the platform via zernio.replyToComment when
// the row carries Zernio provenance (zernio_post_id + zernio_account_id).
// ---------------------------------------------------------------------------

export type CommentClassification = NonNullable<CommentRow['classification']>;

export interface DraftedReply {
  classification: CommentClassification;
  draftReply: string;
}

const SYSTEM_PROMPT = `You are a community manager for an AI influencer account. You triage inbound comments and draft brand-voice replies the operator can approve.

Output ONE valid JSON object:
{
  "classification": "fan" | "question" | "troll" | "spam" | "collab" | "unknown",
  "draftReply": "<reply in the persona's voice, or an empty string if the comment should be ignored/hidden>"
}

Rules:
- "spam" or "troll" → draftReply MUST be an empty string (the operator will hide or ignore).
- "fan" → warm, short reply that doesn't sound auto-generated.
- "question" → answer the question if it's general; if it asks for personal info or a price, defer politely.
- "collab" → reply with "thanks — please DM me" or similar without committing.
- Never apologize on the persona's behalf, never make medical claims, never use slurs.
- Reply length: 1–2 short sentences. No hashtags. Max 1 emoji.`;

export async function classifyAndDraft(input: {
  commentText: string;
  personaName: string;
  personaVibe?: string;
  postContext?: string;
}): Promise<DraftedReply> {
  if (serverEnv.OPENAI_STUB) {
    return stubDraft(input);
  }
  if (!serverEnv.OPENAI_API_KEY) {
    return { classification: 'unknown', draftReply: '' };
  }

  const userPrompt = `Persona: ${input.personaName} (${input.personaVibe ?? 'general'} vibe).
${input.postContext ? `Post context: ${input.postContext}\n` : ''}
Comment to triage:
"""
${input.commentText}
"""

Return JSON only.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_CAPTION_MODEL,
      temperature: 0.6,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned no draft content.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`);
  }
  return normalize(parsed);
}

const CLASS_SET = new Set<CommentClassification>([
  'fan',
  'question',
  'troll',
  'spam',
  'collab',
  'unknown',
]);

function normalize(parsed: unknown): DraftedReply {
  if (!parsed || typeof parsed !== 'object') {
    return { classification: 'unknown', draftReply: '' };
  }
  const obj = parsed as Record<string, unknown>;
  const classification = CLASS_SET.has(obj.classification as CommentClassification)
    ? (obj.classification as CommentClassification)
    : 'unknown';
  const draftReply = typeof obj.draftReply === 'string' ? obj.draftReply.trim() : '';
  return { classification, draftReply };
}

function stubDraft({
  commentText,
  personaName,
}: {
  commentText: string;
  personaName: string;
}): DraftedReply {
  const lc = commentText.toLowerCase();
  if (/\b(viagra|crypto|bitcoin|airdrop|click here|free \$|bot)\b/.test(lc)) {
    return { classification: 'spam', draftReply: '' };
  }
  if (/\b(stupid|trash|fake|hate|cringe)\b/.test(lc)) {
    return { classification: 'troll', draftReply: '' };
  }
  if (/\?|how|what|when|where|why/.test(lc)) {
    return {
      classification: 'question',
      draftReply: `great question — i'll cover this in a longer post soon, thanks for asking!`,
    };
  }
  if (/\b(collab|partnership|sponsor|brand deal|paid)\b/.test(lc)) {
    return {
      classification: 'collab',
      draftReply: `appreciate it — please DM ${personaName} so we can chat properly.`,
    };
  }
  return {
    classification: 'fan',
    draftReply: `you're the best 🙏 thanks for being here`,
  };
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

export async function getCommentById(id: string): Promise<CommentRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from('comments').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load comment: ${error.message}`);
  return data ?? null;
}

export async function listComments(workspaceId: string): Promise<CommentRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list comments: ${error.message}`);
  }
  return data ?? [];
}

export async function saveDraftedComment(input: {
  workspaceId: string;
  postId?: string | null;
  platform: string;
  authorHandle: string;
  authorAvatar?: string | null;
  commentText: string;
  classification: CommentClassification;
  draftReply: string;
}): Promise<CommentRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('comments')
    .insert({
      workspace_id: input.workspaceId,
      post_id: input.postId ?? null,
      platform: input.platform,
      author_handle: input.authorHandle,
      author_avatar: input.authorAvatar ?? null,
      comment_text: input.commentText,
      classification: input.classification,
      draft_reply: input.draftReply || null,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to save comment: ${error?.message ?? 'no row'}`);
  }
  return data;
}

export async function updateCommentStatus(
  id: string,
  status: CommentRow['status'],
  draftReply?: string,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const update: { status: CommentRow['status']; draft_reply?: string | null } = { status };
  if (draftReply !== undefined) update.draft_reply = draftReply || null;
  const { error } = await supabase.from('comments').update(update).eq('id', id);
  if (error) {
    throw new Error(`Failed to update comment: ${error.message}`);
  }
}

export async function deleteComment(id: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete comment: ${error.message}`);
  }
}
