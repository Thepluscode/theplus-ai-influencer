// Claude MCP server, v1: read-only tools over the caller's own workspace.
//
// Authority model (see docs/mcp.md):
// - The caller is the Supabase user whose JWT the client was built with. Tenant
//   and user come from that identity, never from tool arguments.
// - Postgres RLS is the enforcement point. Every query also filters by the
//   caller's workspace_id as defence in depth; neither is skipped.
// - This module never sees the service-role key and never writes.
//
// Not in v1, on purpose: anything that creates, spends credits, or schedules.
// Those need a durable idempotency store and a revision-bound approval record
// that the schema does not have yet.

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../lib/supabase/types';

export type Db = SupabaseClient<Database>;

/** Who the server acts for. Null = no valid session; every tool rejects. */
export interface McpIdentity {
  userId: string;
  workspaceId: string;
}

// Argument validation is the SDK's, before a handler runs: a bad call gets
// isError with a message naming the field, and no envelope (see docs/mcp.md).
export type ErrorCode = 'UNAUTHENTICATED' | 'RESOURCE_NOT_FOUND' | 'INTERNAL_ERROR';

export interface AuditEvent {
  at: string;
  request_id: string;
  tool: string;
  user_id: string | null;
  outcome: 'succeeded' | 'rejected' | 'failed';
  error_code?: ErrorCode;
}

class ToolError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export const MAX_PAGE = 50;

// ponytail: offset cursor ("o:<n>"), capped at 100k rows. Switch to a
// (created_at, id) keyset cursor if a workspace ever pages that deep.
const pageArgs = {
  cursor: z
    .string()
    .regex(/^o:\d{1,5}$/, 'Use the next_cursor value from a previous page.')
    .optional()
    .describe('Opaque cursor from a previous response; omit for the first page.'),
  limit: z.number().int().min(1).max(MAX_PAGE).default(20).describe(`Page size, 1-${MAX_PAGE}.`),
};
const offsetOf = (cursor?: string) => (cursor ? Number(cursor.slice(2)) : 0);

const meta = z.object({ request_id: z.string(), timestamp: z.string() });
const errorShape = z.object({
  code: z.enum(['UNAUTHENTICATED', 'RESOURCE_NOT_FOUND', 'INTERNAL_ERROR']),
  message: z.string(),
  retryable: z.boolean(),
});
// One schema for both outcomes: a client that cached it from tools/list
// validates error results against it too (caught by the stdio test).
const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.boolean(), data: data.optional(), error: errorShape.optional(), meta });

const influencerSummary = z.object({
  influencer_id: z.string(),
  name: z.string(),
  gender: z.string().nullable(),
  age_range: z.string().nullable(),
  vibe: z.string().nullable(),
  portrait_url: z.string(),
  created_at: z.string(),
});
const influencerProfile = influencerSummary.extend({
  hair: z.string().nullable(),
  body_type: z.string().nullable(),
  skin_tone: z.string().nullable(),
  custom_prompt: z.string().nullable(),
  full_body_url: z.string(),
});
const asset = z.object({
  asset_id: z.string(),
  kind: z.literal('image'),
  mode: z.enum(['picture', 'edit']),
  prompt: z.string(),
  influencer_id: z.string().nullable(),
  source_asset_id: z.string().nullable(),
  aspect_ratio: z.string(),
  asset_url: z.string(),
  credits_spent: z.number(),
  created_at: z.string(),
});
const postStatus = z.object({
  post_id: z.string(),
  name: z.string(),
  status: z.enum(['draft', 'scheduled', 'published']),
  platforms: z.array(z.string()),
  scheduled_for: z.string().nullable(),
  submitted_to_scheduler: z.boolean(),
  review_status: z.string(),
  approved_at: z.string().nullable(),
  updated_at: z.string(),
});

type Wizard = Database['public']['Tables']['ai_models']['Row']['wizard_input'];
type ModelRow = Pick<
  Database['public']['Tables']['ai_models']['Row'],
  'id' | 'name' | 'wizard_input' | 'portrait_url' | 'full_body_url' | 'created_at'
>;

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const toSummary = (m: ModelRow) => {
  const w = (m.wizard_input ?? {}) as Partial<Wizard>;
  return {
    influencer_id: m.id,
    name: m.name,
    gender: str(w.gender),
    age_range: str(w.ageRange),
    vibe: str(w.vibe),
    portrait_url: m.portrait_url,
    created_at: m.created_at,
  };
};

/** PostgREST answers 401 / PGRST301 when the JWT is missing, expired or forged. */
function fromDb(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === 'PGRST301' || /jwt/i.test(error.message)) {
    throw new ToolError(
      'UNAUTHENTICATED',
      'The session expired. Mint a new token and restart the server.',
    );
  }
  throw new ToolError('INTERNAL_ERROR', 'The database query failed.', true);
}

export function createInfluencerMcpServer(
  db: Db,
  identity: McpIdentity | null,
  audit: (e: AuditEvent) => void,
): McpServer {
  const server = new McpServer({ name: 'theplus-influencers', version: '1.0.0' });

  function register<S extends z.ZodRawShape, O extends z.ZodType>(
    name: string,
    description: string,
    input: S,
    output: O,
    run: (args: z.infer<z.ZodObject<S>>, who: McpIdentity) => Promise<z.infer<O>>,
  ) {
    server.registerTool(
      name,
      {
        description,
        inputSchema: z.object(input).strict(),
        outputSchema: envelope(output),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: unknown): Promise<CallToolResult> => {
        const request_id = `req_${randomUUID()}`;
        const m = { request_id, timestamp: new Date().toISOString() };
        const log = (outcome: AuditEvent['outcome'], error_code?: ErrorCode) =>
          audit({
            at: m.timestamp,
            request_id,
            tool: name,
            user_id: identity?.userId ?? null,
            outcome,
            error_code,
          });
        try {
          if (!identity) {
            throw new ToolError(
              'UNAUTHENTICATED',
              'No valid ThePlus session. Set THEPLUS_MCP_ACCESS_TOKEN (or email and password) and restart.',
            );
          }
          const data = await run(args as z.infer<z.ZodObject<S>>, identity);
          const body = { success: true as const, data, meta: m };
          log('succeeded');
          return {
            content: [{ type: 'text', text: JSON.stringify(body) }],
            structuredContent: body,
          };
        } catch (err) {
          const e =
            err instanceof ToolError
              ? err
              : new ToolError('INTERNAL_ERROR', 'Unexpected server error.', true);
          log(e.code === 'INTERNAL_ERROR' ? 'failed' : 'rejected', e.code);
          const body = {
            success: false,
            error: { code: e.code, message: e.message, retryable: e.retryable },
            meta: m,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(body) }],
            structuredContent: body,
            isError: true,
          };
        }
      },
    );
  }

  register(
    'list_influencers',
    "List the AI influencers (personas) in the caller's workspace, newest first.",
    pageArgs,
    z.object({ influencers: z.array(influencerSummary), next_cursor: z.string().nullable() }),
    async ({ cursor, limit }, who) => {
      const from = offsetOf(cursor);
      const { data, error } = await db
        .from('ai_models')
        .select('id,name,wizard_input,portrait_url,full_body_url,created_at')
        .eq('workspace_id', who.workspaceId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + limit); // one extra row says whether a next page exists
      fromDb(error);
      const rows = (data ?? []) as ModelRow[];
      return {
        influencers: rows.slice(0, limit).map(toSummary),
        next_cursor: rows.length > limit ? `o:${from + limit}` : null,
      };
    },
  );

  register(
    'get_influencer',
    "Get one influencer's full profile. Unknown ids and ids outside the caller's workspace both return RESOURCE_NOT_FOUND.",
    { influencer_id: z.uuid().describe('influencer_id from list_influencers.') },
    influencerProfile,
    async ({ influencer_id }, who) => {
      const { data, error } = await db
        .from('ai_models')
        .select('id,name,wizard_input,portrait_url,full_body_url,created_at')
        .eq('workspace_id', who.workspaceId)
        .eq('id', influencer_id)
        .maybeSingle();
      fromDb(error);
      if (!data)
        throw new ToolError('RESOURCE_NOT_FOUND', 'No influencer with that id in this workspace.');
      const m = data as ModelRow;
      const w = (m.wizard_input ?? {}) as Partial<Wizard>;
      return {
        ...toSummary(m),
        hair: str(w.hair),
        body_type: str(w.bodyType),
        skin_tone: str(w.skinTone),
        custom_prompt: str(w.customPrompt),
        full_body_url: m.full_body_url,
      };
    },
  );

  register(
    'list_generated_assets',
    "List generated images (pictures and edits) in the caller's workspace, newest first. Optionally only those that used one influencer.",
    {
      influencer_id: z.uuid().optional().describe('Only assets that used this influencer.'),
      ...pageArgs,
    },
    z.object({ assets: z.array(asset), next_cursor: z.string().nullable() }),
    async ({ influencer_id, cursor, limit }, who) => {
      const from = offsetOf(cursor);
      let q = db
        .from('creations')
        .select(
          'id,mode,prompt,persona_id,source_creation_id,aspect_ratio,asset_url,credits_spent,created_at',
        )
        .eq('workspace_id', who.workspaceId);
      if (influencer_id) q = q.eq('persona_id', influencer_id);
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + limit);
      fromDb(error);
      const rows = data ?? [];
      return {
        assets: rows.slice(0, limit).map((c) => ({
          asset_id: c.id,
          kind: 'image' as const,
          mode: c.mode,
          prompt: c.prompt,
          influencer_id: c.persona_id,
          source_asset_id: c.source_creation_id,
          aspect_ratio: c.aspect_ratio,
          asset_url: c.asset_url,
          credits_spent: c.credits_spent,
          created_at: c.created_at,
        })),
        next_cursor: rows.length > limit ? `o:${from + limit}` : null,
      };
    },
  );

  register(
    'get_post_status',
    "Get a post's publishing status. The app stores one status per post, not per platform.",
    { post_id: z.uuid().describe('Post id from the app.') },
    postStatus,
    async ({ post_id }, who) => {
      const { data, error } = await db
        .from('posts')
        .select(
          'id,name,status,platforms,scheduled_for,zernio_post_id,review_status,approved_at,updated_at',
        )
        .eq('workspace_id', who.workspaceId)
        .eq('id', post_id)
        .maybeSingle();
      fromDb(error);
      if (!data)
        throw new ToolError('RESOURCE_NOT_FOUND', 'No post with that id in this workspace.');
      return {
        post_id: data.id,
        name: data.name,
        status: data.status,
        platforms: data.platforms,
        scheduled_for: data.scheduled_for,
        submitted_to_scheduler: data.zernio_post_id !== null,
        review_status: data.review_status,
        approved_at: data.approved_at,
        updated_at: data.updated_at,
      };
    },
  );

  return server;
}
