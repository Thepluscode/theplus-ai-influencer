// @vitest-environment node
// Drives the remote MCP route with the real SDK client over HTTP semantics.
// The Supabase session is faked: these tests prove the resource-server
// contract (401 discovery, origin and rate limits, workspace-scoped tools),
// not Supabase's token validation or RLS — those need a real project.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.THEPLUS_MCP_REMOTE = '1';
});

const calls: Array<{ table: string; eq: [string, unknown][] }> = [];
vi.mock('@/mcp/session', () => ({
  openSession: vi.fn(async ({ accessToken }: { accessToken?: string }) => {
    const db = {
      from(table: string) {
        const call = { table, eq: [] as [string, unknown][] };
        calls.push(call);
        const q = {
          select: () => q,
          order: () => q,
          limit: () => q,
          eq: (k: string, v: unknown) => (call.eq.push([k, v]), q),
          range: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        };
        return q;
      },
    };
    return accessToken?.startsWith('good')
      ? { db, identity: { userId: 'user-a', workspaceId: 'ws-a' } }
      : { db, identity: null, problem: 'bad token' };
  }),
}));

import { DELETE, GET, POST } from './route';
import { openSession } from '@/mcp/session';
import { GET as metadata } from '../../.well-known/oauth-protected-resource/[[...resource]]/route';

const handlers: Record<string, (req: Request) => Promise<Response>> = { GET, POST, DELETE };
const routeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const req = new Request(input, init);
  return handlers[req.method]!(req);
}) as typeof fetch;

beforeEach(() => {
  calls.length = 0;
  vi.mocked(openSession).mockClear();
});

async function connect(token: string) {
  const client = new Client({ name: 'route-test', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://app.example/api/mcp'), {
      fetch: routeFetch,
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

describe('remote MCP route', () => {
  it('answers an anonymous request with a 401 that points at the resource metadata', async () => {
    const res = await POST(
      new Request('https://app.example/api/mcp', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://app.example/.well-known/oauth-protected-resource/api/mcp"',
    ); // Anonymous traffic is turned away before any call to Supabase Auth.
    expect(openSession).not.toHaveBeenCalled();
  });

  it('rejects a token Supabase does not recognise', async () => {
    const res = await POST(
      new Request('https://app.example/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer forged' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_token');
  });

  it('refuses a foreign browser Origin but serves its own origin and origin-less clients', async () => {
    const foreign = await POST(
      new Request('https://app.example/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer good-1', Origin: 'https://evil.example' },
        body: '{}',
      }),
    );
    expect(foreign.status).toBe(403);

    const sameOrigin = await POST(
      new Request('https://app.example/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer good-1', Origin: 'https://app.example' },
        body: '{}',
      }),
    );
    expect(sameOrigin.status).not.toBe(403);
    expect(sameOrigin.status).not.toBe(401);

    const client = await connect('good-origin');
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    await client.close();
  });

  it('exposes the four read-only tools to a signed-in client and scopes queries to its workspace', async () => {
    const client = await connect('good-2');
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_influencer',
      'get_post_status',
      'list_generated_assets',
      'list_influencers',
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);

    await client.callTool({ name: 'list_influencers', arguments: {} });
    expect(calls.some((c) => c.eq.some(([k, v]) => k === 'workspace_id' && v === 'ws-a'))).toBe(
      true,
    );
    await client.close();
  });

  it('rate-limits one token after 120 requests a minute', async () => {
    const send = () =>
      POST(
        new Request('https://app.example/api/mcp', {
          method: 'POST',
          headers: { Authorization: 'Bearer good-flood', 'content-type': 'application/json' },
          body: '{}',
        }),
      );
    for (let i = 0; i < 120; i += 1) expect((await send()).status).not.toBe(429);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
  });
});

describe('remote MCP gating', () => {
  it('is a 404 until THEPLUS_MCP_REMOTE is switched on', async () => {
    process.env.THEPLUS_MCP_REMOTE = '';
    try {
      const res = await POST(
        new Request('https://app.example/api/mcp', {
          method: 'POST',
          headers: { Authorization: 'Bearer good-gate' },
          body: '{}',
        }),
      );
      expect(res.status).toBe(404);
      expect(openSession).not.toHaveBeenCalled();
    } finally {
      process.env.THEPLUS_MCP_REMOTE = '1';
    }
  });

  it('caps one IP before any Supabase call, whatever tokens it sends', async () => {
    const send = (i: number) =>
      POST(
        new Request('https://app.example/api/mcp', {
          method: 'POST',
          headers: { Authorization: `Bearer junk-${i}`, 'x-forwarded-for': '203.0.113.9' },
          body: '{}',
        }),
      );
    for (let i = 0; i < 300; i += 1) expect((await send(i)).status).toBe(401);
    vi.mocked(openSession).mockClear();
    expect((await send(300)).status).toBe(429);
    expect(openSession).not.toHaveBeenCalled();
  });
});

describe('protected-resource metadata', () => {
  it('names this app as the resource and Supabase Auth as the authorization server', async () => {
    const body = await metadata().json();
    expect(body).toMatchObject({
      resource: 'https://app.example/api/mcp',
      authorization_servers: ['https://proj.supabase.co/auth/v1'],
      bearer_methods_supported: ['header'],
    });
  });
});
