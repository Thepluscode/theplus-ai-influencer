// Local MCP entry point: `pnpm mcp`. stdout carries the protocol, so every log
// line (startup problems, the audit trail) goes to stderr.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { publicEnv, serverEnv } from '../lib/env';
import { createInfluencerMcpServer } from './server';
import { openSession } from './session';

async function main() {
  const session = await openSession({
    url: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    accessToken: serverEnv.THEPLUS_MCP_ACCESS_TOKEN,
    email: serverEnv.THEPLUS_MCP_EMAIL,
    password: serverEnv.THEPLUS_MCP_PASSWORD,
  });
  if (session.problem) console.error(`[theplus-mcp] not authenticated: ${session.problem}`);

  // ponytail: audit goes to stderr as JSON lines. A durable audit table comes
  // with the first write tool, which needs a migration anyway.
  const server = createInfluencerMcpServer(session.db, session.identity, (e) =>
    console.error(JSON.stringify({ audit: e })),
  );
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  console.error('[theplus-mcp] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
