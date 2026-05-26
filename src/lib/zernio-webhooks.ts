import 'server-only';
import crypto from 'node:crypto';
import { z } from 'zod';
import { classifyAndDraft } from '@/lib/comments-engine';
import { triageDm } from '@/lib/dm-engine';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Zernio inbound webhook ingest
// ---------------------------------------------------------------------------
// Turns Zernio's `comment.received` / `message.received` webhooks into drafted
// rows in our comments / dm_threads tables — replacing the old manual
// paste-in flow. Runs without a user session, so persistence goes through the
// service-role admin client (the route already authenticated the request by
// HMAC signature). The LLM draft functions (classifyAndDraft / triageDm) are
// pure API calls and don't touch the DB, so they're safe to reuse here.
//
// Workspace attribution:
//   - comments → resolved via the tracked post (posts.zernio_post_id).
//   - DMs      → resolved via social_accounts (account id → workspace).
// Idempotency: upsert on (platform, external_id) with ignoreDuplicates so a
// redelivered webhook never creates a second row.
// ---------------------------------------------------------------------------

/**
 * Verify the `X-Zernio-Signature` header: lowercase hex HMAC-SHA256 of the
 * raw request body keyed by the webhook secret. Timing-safe compare.
 */
export function verifyZernioSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type WebhookResult =
  | { handled: true; kind: 'comment' | 'dm'; externalId: string; duplicate: boolean }
  | { handled: false; reason: string };

const CommentEventSchema = z.object({
  event: z.literal('comment.received'),
  comment: z.object({
    id: z.string(),
    platformPostId: z.string().optional(),
    platform: z.string(),
    text: z.string().nullable().optional(),
    author: z.object({
      id: z.string(),
      username: z.string().optional(),
      name: z.string().optional(),
      picture: z.string().nullable().optional(),
    }),
  }),
  post: z.object({
    id: z.string().nullable().optional(),
    platformPostId: z.string().optional(),
  }),
  account: z.object({ id: z.string() }),
});

const MessageEventSchema = z.object({
  event: z.literal('message.received'),
  message: z.object({
    id: z.string(),
    platform: z.string(),
    direction: z.enum(['incoming', 'outgoing']).optional(),
    text: z.string().nullable().optional(),
    sender: z.object({
      id: z.string(),
      name: z.string().optional(),
      username: z.string().optional(),
      picture: z.string().nullable().optional(),
    }),
  }),
  conversation: z.object({
    id: z.string(),
    platformConversationId: z.string().optional(),
    participantName: z.string().optional(),
    participantUsername: z.string().optional(),
    participantPicture: z.string().nullable().optional(),
  }),
  account: z.object({ id: z.string() }),
});

export async function handleZernioWebhookEvent(payload: unknown): Promise<WebhookResult> {
  const event = (payload as { event?: unknown } | null)?.event;
  if (event === 'comment.received') return handleCommentReceived(payload);
  if (event === 'message.received') return handleMessageReceived(payload);
  return {
    handled: false,
    reason: `ignored event: ${typeof event === 'string' ? event : 'unknown'}`,
  };
}

type Admin = ReturnType<typeof getSupabaseAdminClient>;

/** Workspace persona for brand-voice drafting (most recent AI model). */
async function loadPersona(admin: Admin, workspaceId: string): Promise<{ name: string; vibe?: string }> {
  const { data } = await admin
    .from('ai_models')
    .select('name, wizard_input')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { name: 'the creator' };
  const vibe = (data.wizard_input as { vibe?: string } | null)?.vibe;
  return { name: data.name, vibe: typeof vibe === 'string' ? vibe : undefined };
}

async function handleCommentReceived(payload: unknown): Promise<WebhookResult> {
  const parsed = CommentEventSchema.safeParse(payload);
  if (!parsed.success) {
    return { handled: false, reason: `comment payload invalid: ${parsed.error.issues[0]?.message}` };
  }
  const { comment, post, account } = parsed.data;
  const admin = getSupabaseAdminClient();

  // Resolve the workspace through the tracked post. We only ingest comments
  // on posts we published through Zernio (post.id is the Zernio post _id we
  // stored as posts.zernio_post_id).
  const zernioPostId = post.id ?? comment.platformPostId ?? null;
  if (!zernioPostId) {
    return { handled: false, reason: 'comment has no resolvable post id' };
  }
  const { data: postRow, error: postErr } = await admin
    .from('posts')
    .select('id, workspace_id')
    .eq('zernio_post_id', zernioPostId)
    .maybeSingle();
  if (postErr) throw new Error(`post lookup failed: ${postErr.message}`);
  if (!postRow) {
    return { handled: false, reason: `no tracked post for zernio_post_id ${zernioPostId}` };
  }

  const persona = await loadPersona(admin, postRow.workspace_id);
  const commentText = comment.text ?? '';
  const draft = await classifyAndDraft({
    commentText,
    personaName: persona.name,
    personaVibe: persona.vibe,
  });

  const { data: inserted, error } = await admin
    .from('comments')
    .upsert(
      {
        workspace_id: postRow.workspace_id,
        post_id: postRow.id,
        platform: comment.platform,
        author_handle: comment.author.username ?? comment.author.name ?? comment.author.id,
        author_avatar: comment.author.picture ?? null,
        comment_text: commentText,
        classification: draft.classification,
        draft_reply: draft.draftReply || null,
        status: 'pending',
        external_id: comment.id,
        zernio_post_id: zernioPostId,
        zernio_account_id: account.id,
      },
      { onConflict: 'platform,external_id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw new Error(`comment insert failed: ${error.message}`);

  return { handled: true, kind: 'comment', externalId: comment.id, duplicate: (inserted?.length ?? 0) === 0 };
}

async function handleMessageReceived(payload: unknown): Promise<WebhookResult> {
  const parsed = MessageEventSchema.safeParse(payload);
  if (!parsed.success) {
    return { handled: false, reason: `message payload invalid: ${parsed.error.issues[0]?.message}` };
  }
  const { message, conversation, account } = parsed.data;

  // Never ingest our own outbound messages (e.g. the reply we just sent).
  if (message.direction === 'outgoing') {
    return { handled: false, reason: 'outgoing message ignored' };
  }

  const admin = getSupabaseAdminClient();

  // DMs carry no post, so resolve the workspace via the account → workspace map.
  const { data: acctRow, error: acctErr } = await admin
    .from('social_accounts')
    .select('workspace_id')
    .eq('zernio_account_id', account.id)
    .maybeSingle();
  if (acctErr) throw new Error(`account lookup failed: ${acctErr.message}`);
  if (!acctRow) {
    return { handled: false, reason: `account ${account.id} not mapped to a workspace` };
  }

  const persona = await loadPersona(admin, acctRow.workspace_id);
  const messageText = message.text ?? '';
  const triage = await triageDm({
    messageText,
    personaName: persona.name,
    personaVibe: persona.vibe,
  });

  const { data: inserted, error } = await admin
    .from('dm_threads')
    .upsert(
      {
        workspace_id: acctRow.workspace_id,
        platform: message.platform,
        author_handle:
          message.sender.username ??
          message.sender.name ??
          conversation.participantName ??
          message.sender.id,
        author_avatar: message.sender.picture ?? conversation.participantPicture ?? null,
        last_message: messageText || '(attachment)',
        classification: triage.classification,
        summary: triage.summary || null,
        suggested_reply: triage.suggestedReply || null,
        status: 'pending',
        external_id: message.id,
        zernio_conversation_id: conversation.platformConversationId ?? conversation.id,
        zernio_account_id: account.id,
      },
      { onConflict: 'platform,external_id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw new Error(`dm insert failed: ${error.message}`);

  return { handled: true, kind: 'dm', externalId: message.id, duplicate: (inserted?.length ?? 0) === 0 };
}
