import 'server-only';
import { serverEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { DmThreadRow } from '@/lib/supabase/types';

export type DmClassification = DmThreadRow['classification'];

export interface DmTriage {
  classification: DmClassification;
  summary: string;
  suggestedReply: string;
}

const SYSTEM_PROMPT = `You are an inbox manager for an AI influencer DM inbox. You triage inbound DMs and draft brand-voice replies.

Output ONE valid JSON object:
{
  "classification": "collab" | "lead" | "fan" | "support" | "spam" | "other",
  "summary": "one-line summary of what the sender wants",
  "suggestedReply": "<reply in the persona's voice OR empty string for spam>"
}

Classification rules:
- "collab" — brand / agency proposing a partnership
- "lead" — potential customer asking about a product the persona promotes
- "fan" — appreciation / casual chat / DM-only Q&A
- "support" — bug / complaint / billing / "I bought and it broke"
- "spam" — bot / scam / phishing / unsolicited offer. suggestedReply MUST be empty.
- "other" — anything that doesn't fit

Reply rules:
- For "collab" → polite "thanks, please email <persona>@example.com with the brief" type response without committing.
- For "lead" → answer the practical question; if it needs human follow-up, say so.
- For "fan" → warm, short, doesn't sound auto-generated.
- For "support" → acknowledge + ask for specific info (order id, screenshot).
- Never apologize on the brand's behalf, never offer refunds.
- Max 2 short sentences. Max 1 emoji.`;

export async function triageDm(input: {
  messageText: string;
  personaName: string;
  personaVibe?: string;
}): Promise<DmTriage> {
  if (serverEnv.OPENAI_STUB) {
    return stubTriage(input);
  }
  if (!serverEnv.OPENAI_API_KEY) {
    return { classification: 'other', summary: 'No OpenAI key — triage skipped.', suggestedReply: '' };
  }

  const userPrompt = `Persona: ${input.personaName} (${input.personaVibe ?? 'general'} vibe).
Inbound DM:
"""
${input.messageText}
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
      temperature: 0.5,
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
  if (!raw) throw new Error('OpenAI returned no triage content.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`);
  }
  return normalize(parsed);
}

const CLASS_SET = new Set<DmClassification>([
  'collab',
  'lead',
  'fan',
  'support',
  'spam',
  'other',
]);

function normalize(parsed: unknown): DmTriage {
  if (!parsed || typeof parsed !== 'object') {
    return { classification: 'other', summary: '', suggestedReply: '' };
  }
  const obj = parsed as Record<string, unknown>;
  const classification = CLASS_SET.has(obj.classification as DmClassification)
    ? (obj.classification as DmClassification)
    : 'other';
  const summary = typeof obj.summary === 'string' ? obj.summary : '';
  const suggestedReply =
    typeof obj.suggestedReply === 'string' ? obj.suggestedReply.trim() : '';
  return { classification, summary, suggestedReply };
}

function stubTriage({
  messageText,
  personaName,
}: {
  messageText: string;
  personaName: string;
}): DmTriage {
  const lc = messageText.toLowerCase();
  if (/\b(viagra|crypto|airdrop|click here|free \$|investment)\b/.test(lc)) {
    return { classification: 'spam', summary: 'Crypto / scam DM', suggestedReply: '' };
  }
  if (/\b(brand|sponsor|partnership|collab|paid)\b/.test(lc)) {
    return {
      classification: 'collab',
      summary: 'Brand pitching a partnership',
      suggestedReply: `thanks for reaching out — please email ${personaName.toLowerCase().replace(/\s+/g, '')}@example.com with the brief and we'll review.`,
    };
  }
  if (/\b(buy|purchase|price|cost|order|where can i)\b/.test(lc)) {
    return {
      classification: 'lead',
      summary: 'Potential customer asking about a product',
      suggestedReply: `link is in my bio — let me know if you have a specific size / variant question 🙌`,
    };
  }
  if (/\b(broken|refund|complaint|help|issue|problem)\b/.test(lc)) {
    return {
      classification: 'support',
      summary: 'Support request — needs human follow-up',
      suggestedReply: `so sorry about that — could you share your order number and a photo? i'll get this sorted.`,
    };
  }
  return {
    classification: 'fan',
    summary: 'Fan saying hi',
    suggestedReply: `means a lot 🙏 thanks for being here`,
  };
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

export async function listDmThreads(workspaceId: string): Promise<DmThreadRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('dm_threads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list DMs: ${error.message}`);
  return data ?? [];
}

export async function saveTriagedDm(input: {
  workspaceId: string;
  platform: string;
  authorHandle: string;
  authorAvatar?: string | null;
  lastMessage: string;
  triage: DmTriage;
}): Promise<DmThreadRow> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('dm_threads')
    .insert({
      workspace_id: input.workspaceId,
      platform: input.platform,
      author_handle: input.authorHandle,
      author_avatar: input.authorAvatar ?? null,
      last_message: input.lastMessage,
      classification: input.triage.classification,
      summary: input.triage.summary || null,
      suggested_reply: input.triage.suggestedReply || null,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to save DM: ${error?.message ?? 'no row'}`);
  }
  return data;
}

export async function updateDmStatus(
  id: string,
  status: DmThreadRow['status'],
  suggestedReply?: string,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const update: { status: DmThreadRow['status']; suggested_reply?: string | null } = {
    status,
  };
  if (suggestedReply !== undefined) update.suggested_reply = suggestedReply || null;
  const { error } = await supabase.from('dm_threads').update(update).eq('id', id);
  if (error) throw new Error(`Failed to update DM: ${error.message}`);
}

export async function deleteDm(id: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from('dm_threads').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete DM: ${error.message}`);
}
