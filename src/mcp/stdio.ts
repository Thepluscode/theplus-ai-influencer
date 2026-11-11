// Local MCP entry point: `pnpm mcp`. stdout carries the protocol, so every log
// line (startup problems, the audit trail) goes to stderr.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createInfluencerMcpServer } from './server';
import { openSession } from './session';

// Deliberately NOT '../lib/env': its serverEnv holds SUPABASE_SERVICE_ROLE_KEY,
// and this process must never have it in reach. These five are all it reads.
// (The app-wide "no process.env" rule exists to funnel config through env.ts;
// keeping the key out of this separate process is the stronger requirement.)
const blank = (v: unknown) => (v === '' ? undefined : v);
const McpEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(blank, z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(blank, z.string().min(1).optional()),
  THEPLUS_MCP_ACCESS_TOKEN: z.preprocess(blank, z.string().min(1).optional()),
  THEPLUS_MCP_EMAIL: z.preprocess(blank, z.string().email().optional()),
  THEPLUS_MCP_PASSWORD: z.preprocess(blank, z.string().min(1).optional()),
});

async function main() {
  const env = McpEnv.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    THEPLUS_MCP_ACCESS_TOKEN: process.env.THEPLUS_MCP_ACCESS_TOKEN,
    THEPLUS_MCP_EMAIL: process.env.THEPLUS_MCP_EMAIL,
    THEPLUS_MCP_PASSWORD: process.env.THEPLUS_MCP_PASSWORD,
  });
  const session = await openSession({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    accessToken: env.THEPLUS_MCP_ACCESS_TOKEN,
    email: env.THEPLUS_MCP_EMAIL,
    password: env.THEPLUS_MCP_PASSWORD,
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
