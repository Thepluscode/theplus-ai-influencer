import { publicEnv } from '@/lib/env';

// RFC 9728 protected-resource metadata for the remote MCP endpoint. MCP
// clients read this after a 401 to find the authorization server: Supabase
// Auth for this project. Served at both the bare well-known path and the
// path-suffixed form (/.well-known/oauth-protected-resource/api/mcp).

export const dynamic = 'force-dynamic';

export function GET() {
  const appOrigin = new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin;
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json(
      { error: 'not_configured', error_description: 'Supabase is not configured.' },
      { status: 503 },
    );
  }
  return Response.json(
    {
      resource: `${appOrigin}/api/mcp`,
      authorization_servers: [`${new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).origin}/auth/v1`],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'email', 'profile'],
      resource_name: 'ThePlus AI Influencer',
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
