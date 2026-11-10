// Contract tests for the v1 MCP server. The database is a FAKE that applies the
// `.eq()` filters the adapter sends — it proves the adapter scopes every query
// to the caller's workspace, NOT that Postgres RLS holds. RLS is exercised only
// against a real database (see docs/mcp.md).

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createInfluencerMcpServer, type AuditEvent, type Db, type McpIdentity } from '../server';

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';
const ME: McpIdentity = { userId: 'user-a', workspaceId: WS_A };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type Row = Record<string, unknown>;
interface Call {
  table: string;
  eq: [string, unknown][];
  range?: [number, number];
}

/** Minimal PostgREST stand-in: honours eq filters and range, records every call. */
function fakeDb(
  tables: Record<string, Row[]>,
  opts: { error?: { message: string; code?: string } } = {},
) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, eq: [] };
      calls.push(call);
      const rows = () => (tables[table] ?? []).filter((r) => call.eq.every(([k, v]) => r[k] === v));
      const result = (data: unknown) =>
        Promise.resolve(opts.error ? { data: null, error: opts.error } : { data, error: null });
      const q = {
        select: () => q,
        order: () => q,
        limit: () => q,
        eq: (k: string, v: unknown) => (call.eq.push([k, v]), q),
        range: (a: number, b: number) => ((call.range = [a, b]), result(rows().slice(a, b + 1))),
        maybeSingle: () => result(rows()[0] ?? null),
      };
      return q;
    },
  };
  return { db: db as unknown as Db, calls };
}

const model = (n: number, ws = WS_A) => ({
  id: id(n),
  workspace_id: ws,
  name: `Persona ${n}`,
  wizard_input: {
    gender: 'woman',
    ageRange: '25-34',
    vibe: 'street',
    hair: 'long brown',
    bodyType: 'athletic',
    skinTone: 'medium',
    customPrompt: '',
  },
  portrait_url: `https://cdn.example/p${n}.png`,
  full_body_url: `https://cdn.example/f${n}.png`,
  created_at: `2026-11-0${n}T00:00:00Z`,
});
const creation = (n: number, persona: string | null, ws = WS_A) => ({
  id: id(100 + n),
  workspace_id: ws,
  mode: 'picture',
  prompt: `prompt ${n}`,
  persona_id: persona,
  source_creation_id: null,
  aspect_ratio: '9:16',
  asset_url: `https://cdn.example/c${n}.png`,
  credits_spent: 4,
  created_at: '2026-11-09T00:00:00Z',
});
const post = (n: number, ws = WS_A, zernio: string | null = null) => ({
  id: id(200 + n),
  workspace_id: ws,
  name: `Post ${n}`,
  status: zernio ? 'scheduled' : 'draft',
  platforms: ['instagram'],
  scheduled_for: zernio ? '2026-11-20T10:00:00Z' : null,
  zernio_post_id: zernio,
  review_status: 'approved',
  approved_at: null,
  updated_at: '2026-11-09T00:00:00Z',
});

async function connect(db: Db, identity: McpIdentity | null = ME) {
  const audit: AuditEvent[] = [];
  const server = createInfluencerMcpServer(db, identity, (e) => audit.push(e));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'contract-test', version: '0' });
  await client.connect(b);
  await client.listTools(); // like a real client: caches output schemas, which then validate every result
  return { client, audit };
}

type Body = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; retryable: boolean };
};
const bodyOf = (r: unknown) => (r as { structuredContent: Body }).structuredContent;

const TABLES = {
  ai_models: [model(3), model(2), model(1), model(9, WS_B)],
  creations: [creation(1, id(1)), creation(2, null), creation(3, id(9), WS_B)],
  posts: [post(1), post(2, WS_A, 'zp_1'), post(3, WS_B)],
};

describe('MCP server v1 — discovery', () => {
  it('lists exactly the four read-only tools with strict input and an output schema', async () => {
    const { client } = await connect(fakeDb(TABLES).db);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_influencer',
      'get_post_status',
      'list_generated_assets',
      'list_influencers',
    ]);
    for (const t of tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.outputSchema?.type).toBe('object');
    }
  });
});

describe('MCP server v1 — reads, scoped to the caller', () => {
  it('lists only the caller workspace influencers, paged', async () => {
    const { db, calls } = fakeDb(TABLES);
    const { client } = await connect(db);
    const first = bodyOf(
      await client.callTool({ name: 'list_influencers', arguments: { limit: 2 } }),
    );
    expect(first.success).toBe(true);
    expect((first.data!.influencers as { name: string }[]).map((i) => i.name)).toEqual([
      'Persona 3',
      'Persona 2',
    ]);
    expect(first.data!.next_cursor).toBe('o:2');
    expect(calls[0]).toMatchObject({
      table: 'ai_models',
      eq: [['workspace_id', WS_A]],
      range: [0, 2],
    });

    const second = bodyOf(
      await client.callTool({ name: 'list_influencers', arguments: { limit: 2, cursor: 'o:2' } }),
    );
    expect((second.data!.influencers as { name: string }[]).map((i) => i.name)).toEqual([
      'Persona 1',
    ]);
    expect(second.data!.next_cursor).toBeNull();
  });

  it('returns a full profile, and NOT_FOUND for another workspace id (no existence leak)', async () => {
    const { client } = await connect(fakeDb(TABLES).db);
    const mine = bodyOf(
      await client.callTool({ name: 'get_influencer', arguments: { influencer_id: id(1) } }),
    );
    expect(mine.data).toMatchObject({
      influencer_id: id(1),
      gender: 'woman',
      age_range: '25-34',
      hair: 'long brown',
    });

    const theirs = await client.callTool({
      name: 'get_influencer',
      arguments: { influencer_id: id(9) },
    });
    expect(theirs.isError).toBe(true);
    expect(bodyOf(theirs).error).toMatchObject({ code: 'RESOURCE_NOT_FOUND', retryable: false });
    const missing = bodyOf(
      await client.callTool({ name: 'get_influencer', arguments: { influencer_id: id(77) } }),
    );
    expect(missing.error!.message).toBe(bodyOf(theirs).error!.message);
  });

  it('lists generated assets, filtered by influencer when asked', async () => {
    const { db, calls } = fakeDb(TABLES);
    const { client } = await connect(db);
    const all = bodyOf(await client.callTool({ name: 'list_generated_assets', arguments: {} }));
    expect((all.data!.assets as unknown[]).length).toBe(2);
    const one = bodyOf(
      await client.callTool({ name: 'list_generated_assets', arguments: { influencer_id: id(1) } }),
    );
    expect(one.data!.assets).toEqual([
      expect.objectContaining({ asset_id: id(101), kind: 'image', influencer_id: id(1) }),
    ]);
    expect(calls[1].eq).toEqual([
      ['workspace_id', WS_A],
      ['persona_id', id(1)],
    ]);
  });

  it('reports post status without exposing the provider id', async () => {
    const { client } = await connect(fakeDb(TABLES).db);
    const s = bodyOf(
      await client.callTool({ name: 'get_post_status', arguments: { post_id: id(202) } }),
    );
    expect(s.data).toMatchObject({
      status: 'scheduled',
      submitted_to_scheduler: true,
      platforms: ['instagram'],
    });
    expect(JSON.stringify(s)).not.toContain('zp_1');
    const other = bodyOf(
      await client.callTool({ name: 'get_post_status', arguments: { post_id: id(203) } }),
    );
    expect(other.error!.code).toBe('RESOURCE_NOT_FOUND');
  });
});

describe('MCP server v1 — rejections', () => {
  it('rejects every tool without a session, before touching the database', async () => {
    const { db, calls } = fakeDb(TABLES);
    const { client, audit } = await connect(db, null);
    for (const [name, args] of [
      ['list_influencers', {}],
      ['get_influencer', { influencer_id: id(1) }],
      ['list_generated_assets', {}],
      ['get_post_status', { post_id: id(201) }],
    ] as const) {
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError).toBe(true);
      expect(bodyOf(r).error!.code).toBe('UNAUTHENTICATED');
    }
    expect(calls).toHaveLength(0);
    expect(audit.every((e) => e.outcome === 'rejected' && e.user_id === null)).toBe(true);
  });

  it('rejects unknown arguments, a forged workspace field, bad ids and out-of-range limits', async () => {
    const { db, calls } = fakeDb(TABLES);
    const { client } = await connect(db);
    for (const [args, says] of [
      [
        { name: 'list_influencers', arguments: { workspace_id: WS_B } },
        /Unrecognized key: "workspace_id"/,
      ],
      [{ name: 'get_influencer', arguments: { influencer_id: 'not-a-uuid' } }, /influencer_id/],
      [{ name: 'list_influencers', arguments: { limit: 51 } }, /limit/],
      [{ name: 'list_influencers', arguments: { cursor: 'o:-1' } }, /cursor/],
    ] as const) {
      const r = await client.callTool(args);
      // The SDK rejects these before the handler: isError + a message naming the field.
      expect(r.isError, JSON.stringify(args)).toBe(true);
      expect((r.content as { text: string }[])[0].text).toMatch(/-32602: Input validation error/);
      expect((r.content as { text: string }[])[0].text).toMatch(says);
    }
    expect(calls).toHaveLength(0);
  });

  it('maps an expired JWT to UNAUTHENTICATED and other failures to a non-leaking INTERNAL_ERROR', async () => {
    const jwt = await connect(
      fakeDb(TABLES, { error: { message: 'JWT expired', code: 'PGRST301' } }).db,
    );
    const a = await jwt.client.callTool({ name: 'list_influencers', arguments: {} });
    expect(bodyOf(a).error!.code).toBe('UNAUTHENTICATED');

    const boom = await connect(
      fakeDb(TABLES, { error: { message: 'relation "secret_table" leaked detail' } }).db,
    );
    const b = await boom.client.callTool({ name: 'list_influencers', arguments: {} });
    expect(bodyOf(b).error).toMatchObject({ code: 'INTERNAL_ERROR', retryable: true });
    expect(JSON.stringify(b)).not.toContain('secret_table');
    expect(boom.audit.at(-1)).toMatchObject({
      tool: 'list_influencers',
      outcome: 'failed',
      error_code: 'INTERNAL_ERROR',
    });
  });

  it('writes one audit event per call with a unique request id', async () => {
    const { client, audit } = await connect(fakeDb(TABLES).db);
    await client.callTool({ name: 'list_influencers', arguments: {} });
    await client.callTool({ name: 'get_influencer', arguments: { influencer_id: id(77) } });
    expect(audit.map((e) => [e.tool, e.outcome, e.user_id])).toEqual([
      ['list_influencers', 'succeeded', 'user-a'],
      ['get_influencer', 'rejected', 'user-a'],
    ]);
    expect(new Set(audit.map((e) => e.request_id)).size).toBe(2);
  });
});

describe('MCP server v1 — authority boundary in source', () => {
  it('no MCP module can reach the service-role key or a write', () => {
    const dir = path.resolve(__dirname, '..');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.sort()).toEqual(['server.ts', 'session.ts', 'stdio.ts']);
    for (const f of files) {
      const src = readFileSync(path.join(dir, f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/supabase\/admin|SERVICE_ROLE|getSupabaseAdminClient/);
      expect(src, f).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    }
  });
});

describe('MCP server v1 — real stdio process', () => {
  it('starts with `pnpm mcp`, is discoverable, and fails closed without credentials', async () => {
    const root = path.resolve(__dirname, '../../..');
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !/^(THEPLUS_MCP_|NEXT_PUBLIC_SUPABASE_)/.test(k)),
    ) as Record<string, string>;
    const transport = new StdioClientTransport({
      command: 'pnpm', // the documented launch command, banner suppressed
      args: ['--silent', 'mcp'],
      cwd: root,
      env,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'stdio-smoke', version: '0' });
    await client.connect(transport);
    try {
      expect(client.getServerVersion()).toMatchObject({ name: 'theplus-influencers' });
      expect((await client.listTools()).tools).toHaveLength(4);
      const r = await client.callTool({ name: 'list_influencers', arguments: {} });
      expect(bodyOf(r).error!.code).toBe('UNAUTHENTICATED');
    } finally {
      await client.close();
    }
  }, 30_000);
});
