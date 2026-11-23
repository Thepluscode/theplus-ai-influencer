import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { publicEnv } from '@/lib/env';
import { createInfluencerMcpServer } from '@/mcp/server';
import { openSession } from '@/mcp/session';

// Remote MCP endpoint. Supabase Auth is the OAuth 2.1 authorization server
// (PKCE + dynamic client registration); this route is only the resource
// server: it reads the Bearer token, asks Supabase who it belongs to, and acts
// through an anon-key client carrying that token, so RLS decides visibility.
// The service-role key is never reachable from here (same rule as src/mcp).
//
// Stateless: a new server + transport per request, no session ids to track.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/api/mcp';
// ponytail: per-instance window; move to a shared store if we run >1 instance under load.
const RATE_LIMIT = { windowMs: 60_000, max: 120 };
const hits = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
export async function DELETE(req: Request) {
  return handle(req);
}

async function handle(req: Request): Promise<Response> {
  const appOrigin = new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin;
  // Browsers send Origin; server-side MCP clients do not. A foreign Origin is
  // a cross-site page trying to use a visitor's token (DNS-rebinding class).
  const origin = req.headers.get('origin');
  if (origin && origin !== appOrigin) {
    return jsonError(403, 'forbidden_origin', 'Cross-origin MCP requests are not allowed.');
  }

  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) return unauthorized(appOrigin, 'Sign in with OAuth to use this MCP server.');

  if (!allow(token)) {
    return jsonError(429, 'rate_limited', 'Too many MCP requests; slow down.', {
      'Retry-After': String(Math.ceil(RATE_LIMIT.windowMs / 1000)),
    });
  }

  const session = await openSession({
    url: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    accessToken: token,
  });
  if (!session.identity) {
    return unauthorized(appOrigin, 'The access token is invalid, expired, or has no workspace.');
  }

  const server = createInfluencerMcpServer(session.db, session.identity, (event) =>
    console.info(JSON.stringify({ mcp_audit: event, transport: 'http' })),
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}

function allow(token: string): boolean {
  const now = Date.now();
  const entry = hits.get(token);
  if (!entry || entry.resetAt <= now) {
    if (hits.size > 10_000) hits.clear();
    hits.set(token, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT.max;
}

function unauthorized(appOrigin: string, description: string): Response {
  return jsonError(401, 'invalid_token', description, {
    'WWW-Authenticate': `Bearer error="invalid_token", error_description="${description}", resource_metadata="${appOrigin}${RESOURCE_METADATA_PATH}"`,
  });
}

function jsonError(
  status: number,
  error: string,
  description: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json({ error, error_description: description }, { status, headers });
}
