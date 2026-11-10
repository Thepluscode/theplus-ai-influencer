// openSession against a local HTTP STAND-IN for Supabase auth (/auth/v1) and
// PostgREST (/rest/v1). Proves the user's token is what reaches both, and that
// every bad-identity path fails closed. It is not real GoTrue or RLS.

import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSession } from '../session';

const GOOD = 'user-a-jwt';
const seen: { path: string; headers: IncomingHttpHeaders }[] = [];
let server: Server;
let url = '';
let workspaces: { id: string }[] = [{ id: 'ws-a' }];

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ path: req.url ?? '', headers: req.headers });
    const bearer = req.headers.authorization;
    res.setHeader('content-type', 'application/json');
    if (req.url?.startsWith('/auth/v1/token')) {
      res.end(
        JSON.stringify({
          access_token: GOOD,
          refresh_token: 'r',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: 'user-a',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'a@example.test',
          },
        }),
      );
      return;
    }
    if (req.url?.startsWith('/auth/v1/user')) {
      if (bearer !== `Bearer ${GOOD}`) {
        res.statusCode = 401;
        res.end(JSON.stringify({ code: 401, msg: 'invalid JWT' }));
        return;
      }
      res.end(JSON.stringify({ id: 'user-a', aud: 'authenticated', role: 'authenticated' }));
      return;
    }
    if (req.url?.startsWith('/rest/v1/workspaces')) {
      // maybeSingle() asks PostgREST for one object; an empty result is a 406.
      if (!workspaces.length) {
        res.statusCode = 406;
        res.end(JSON.stringify({ code: 'PGRST116', message: 'no rows' }));
        return;
      }
      res.end(JSON.stringify(workspaces[0]));
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('openSession', () => {
  it("binds the identity to the token's user and sends that token, not the anon key, to PostgREST", async () => {
    seen.length = 0;
    workspaces = [{ id: 'ws-a' }];
    const s = await openSession({ url, anonKey: 'anon-key', accessToken: GOOD });
    expect(s.problem).toBeUndefined();
    expect(s.identity).toEqual({ userId: 'user-a', workspaceId: 'ws-a' });
    const rest = seen.find((r) => r.path.startsWith('/rest/v1/workspaces'))!;
    expect(rest.headers.authorization).toBe(`Bearer ${GOOD}`);
    expect(rest.headers.apikey).toBe('anon-key');
    expect(rest.path).toContain('owner_user_id=eq.user-a');
  });

  it('signs in with email and password, then uses the issued token', async () => {
    seen.length = 0;
    const s = await openSession({
      url,
      anonKey: 'anon-key',
      email: 'a@example.test',
      password: 'pw',
    });
    expect(s.identity).toEqual({ userId: 'user-a', workspaceId: 'ws-a' });
    expect(seen[0].path).toContain('/auth/v1/token?grant_type=password');
    expect(seen.find((r) => r.path.startsWith('/rest/v1'))!.headers.authorization).toBe(
      `Bearer ${GOOD}`,
    );
  });

  it('fails closed: forged token, no credentials, no workspace, no Supabase config', async () => {
    const forged = await openSession({ url, anonKey: 'anon-key', accessToken: 'forged' });
    expect(forged.identity).toBeNull();
    expect(forged.problem).toMatch(/Token rejected/);

    const none = await openSession({ url, anonKey: 'anon-key' });
    expect(none.identity).toBeNull();
    expect(none.problem).toMatch(/THEPLUS_MCP_ACCESS_TOKEN/);

    workspaces = [];
    const noWs = await openSession({ url, anonKey: 'anon-key', accessToken: GOOD });
    expect(noWs.identity).toBeNull();
    expect(noWs.problem).toMatch(/no workspace/);
    workspaces = [{ id: 'ws-a' }];

    const unconfigured = await openSession({ accessToken: GOOD });
    expect(unconfigured.identity).toBeNull();
    expect(unconfigured.problem).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
