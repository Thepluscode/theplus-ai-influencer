// Builds the user-scoped Supabase client the MCP server acts through.
// Anon key + the user's own JWT: RLS decides what is visible. The service-role
// key is deliberately not reachable from here (src/mcp/__tests__ asserts it).

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/types';
import type { Db, McpIdentity } from './server';

export interface SessionConfig {
  url?: string;
  anonKey?: string;
  accessToken?: string;
  email?: string;
  password?: string;
}

export interface Session {
  db: Db;
  identity: McpIdentity | null;
  /** Why identity is null; written to stderr, never to the protocol stream. */
  problem?: string;
}

const noAutoSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** The caller's workspace: the oldest one they own, as getOrCreateCurrentWorkspace picks it. */
export async function resolveIdentity(db: Db, userId: string): Promise<McpIdentity | null> {
  const { data, error } = await db
    .from('workspaces')
    .select('id')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { userId, workspaceId: data.id };
}

export async function openSession(c: SessionConfig): Promise<Session> {
  if (!c.url || !c.anonKey) {
    const db = createClient<Database>('http://invalid.localhost', 'none', { auth: noAutoSession });
    return {
      db,
      identity: null,
      problem: 'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.',
    };
  }

  let token = c.accessToken;
  if (!token && c.email && c.password) {
    const auth = createClient<Database>(c.url, c.anonKey, { auth: noAutoSession });
    const { data, error } = await auth.auth.signInWithPassword({
      email: c.email,
      password: c.password,
    });
    if (error || !data.session) {
      return {
        db: auth,
        identity: null,
        problem: `Sign-in failed: ${error?.message ?? 'no session'}`,
      };
    }
    token = data.session.access_token;
  }

  const db = createClient<Database>(c.url, c.anonKey, {
    auth: noAutoSession,
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
  if (!token) {
    return {
      db,
      identity: null,
      problem: 'Set THEPLUS_MCP_ACCESS_TOKEN, or THEPLUS_MCP_EMAIL and THEPLUS_MCP_PASSWORD.',
    };
  }

  // Ask the auth server, not the token's own claims: a forged or revoked JWT fails here.
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    return { db, identity: null, problem: `Token rejected: ${error?.message ?? 'no user'}` };
  }
  const identity = await resolveIdentity(db, data.user.id);
  return identity
    ? { db, identity }
    : {
        db,
        identity: null,
        problem: 'This user has no workspace yet. Sign in to the app once to create it.',
      };
}
