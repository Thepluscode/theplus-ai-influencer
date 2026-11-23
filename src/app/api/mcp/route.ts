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
//
// Any valid Supabase access token for this project is accepted — an
// OAuth-issued MCP token or the user's own app session token. Both identify
// the same user and RLS applies to both, so neither widens access.
//
// Off unless THEPLUS_MCP_REMOTE=1: the route is pointless (and only an
// auth-probing surface) until the Supabase OAuth server is switched on.
// Read directly, not via serverEnv, to keep the service-role key out of reach.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/api/mcp';
// ponytail: per-instance window; move to a shared store if we run >1 instance under load.
const RATE_LIMIT = { windowMs: 60_000, max: 120 };
// Per client IP, checked before any Supabase call, so a flood of distinct
// garbage tokens cannot turn into a flood of auth requests.
const IP_RATE_LIMIT = { windowMs: 60_000, max: 300 };
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
  if (!isRemoteMcpEnabled()) {
    return jsonError(404, 'not_found', 'Remote MCP is not enabled on this deployment.');
  }
  const appOrigin = new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin;
  // Browsers send Origin; server-side MCP clients do not. A foreign Origin is
  // a cross-site page trying to use a visitor's token (DNS-rebinding class).
  const origin = req.headers.get('origin');
  if (origin && origin !== appOrigin) {
    return jsonError(403, 'forbidden_origin', 'Cross-origin MCP requests are not allowed.');
  }

  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) return unauthorized(appOrigin, 'Sign in with OAuth to use this MCP server.');

  if (!allow(`ip:${clientIp(req)}`, IP_RATE_LIMIT) || !allow(`token:${token}`, RATE_LIMIT)) {
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

export function isRemoteMcpEnabled(): boolean {
  const flag = process.env.THEPLUS_MCP_REMOTE;
  return flag === '1' || flag?.toLowerCase() === 'true';
}

// ponytail: first X-Forwarded-For hop is only trustworthy behind our proxy
// (Railway/Cloudflare set it); direct hits can spoof it.
function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function allow(key: string, limit: { windowMs: number; max: number }): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit.max;
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
