import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  updated: [] as { patch: Record<string, unknown>; filters: Record<string, string> }[],
  rowsReturned: [{ id: 'model-1' }] as { id: string }[],
  updateError: null as { message: string } | null,
  demo: false,
}));

vi.mock('@/lib/demo-mode', () => ({ isDemoMode: () => h.demo, DEMO_MODEL_ID: 'demo-model' }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/workspace', () => ({
  getOrCreateCurrentWorkspace: async () => ({ id: 'ws-1' }),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => {
      const filters: Record<string, string> = {};
      const chain = {
        update(patch: Record<string, unknown>) {
          h.updated.push({ patch, filters });
          return chain;
        },
        eq(col: string, val: string) {
          filters[col] = val;
          return chain;
        },
        select: async () => ({ data: h.updateError ? null : h.rowsReturned, error: h.updateError }),
      };
      return chain;
    },
  }),
}));

import { replacePersonaImage } from '../actions';

// ---------------------------------------------------------------------------
// portrait_url is handed to Luma as `character_ref` by luma-post.ts,
// content-media.ts, storyboard.ts and content-pipeline.ts. Whatever URL lands
// in this column gets fetched server-side on every subsequent render, so the
// two things worth proving are: an arbitrary URL cannot get in, and one
// workspace cannot rewrite another's persona.
// ---------------------------------------------------------------------------

const OK_URL =
  'https://izfwasxgfdisvlxjlvzs.supabase.co/storage/v1/object/public/persona-refs/ws-1/a.jpg';

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  h.user = { id: 'user-1' };
  h.updated.length = 0;
  h.rowsReturned = [{ id: 'model-1' }];
  h.updateError = null;
  h.demo = false;
});
afterEach(() => vi.restoreAllMocks());

describe('replacePersonaImage — what may become a persona', () => {
  it('accepts a URL this app uploaded', async () => {
    const r = await replacePersonaImage(null, fd({ modelId: 'model-1', kind: 'portrait', url: OK_URL }));
    expect(r).toEqual({ status: 'saved', kind: 'portrait' });
    expect(h.updated[0].patch).toEqual({ portrait_url: OK_URL });
  });

  it('rejects an arbitrary external URL (SSRF into the render pipeline)', async () => {
    // Luma fetches character_ref server-side. An attacker-supplied URL would be
    // requested by the render worker and would silently become the persona.
    const r = await replacePersonaImage(
      null,
      fd({ modelId: 'model-1', kind: 'portrait', url: 'https://evil.example/x.jpg' }),
    );
    expect(r.status).toBe('error');
    expect(h.updated).toHaveLength(0);
  });

  it('rejects an internal address', async () => {
    const r = await replacePersonaImage(
      null,
      fd({ modelId: 'model-1', kind: 'portrait', url: 'http://169.254.169.254/latest/meta-data/' }),
    );
    expect(r.status).toBe('error');
    expect(h.updated).toHaveLength(0);
  });

  it('rejects a URL from a DIFFERENT bucket in the same project', async () => {
    // post-uploads is public and writable by any signed-in user, so accepting
    // any storage URL would let one workspace point another's persona at a file
    // it controls.
    const r = await replacePersonaImage(
      null,
      fd({
        modelId: 'model-1',
        kind: 'portrait',
        url: 'https://izfwasxgfdisvlxjlvzs.supabase.co/storage/v1/object/public/post-uploads/ws-9/x.jpg',
      }),
    );
    expect(r.status).toBe('error');
    expect(h.updated).toHaveLength(0);
  });

  it('rejects an unknown image kind rather than defaulting to portrait', async () => {
    const r = await replacePersonaImage(null, fd({ modelId: 'model-1', kind: 'avatar', url: OK_URL }));
    expect(r.status).toBe('error');
    expect(h.updated).toHaveLength(0);
  });

  it('requires a persona id', async () => {
    const r = await replacePersonaImage(null, fd({ kind: 'portrait', url: OK_URL }));
    expect(r.status).toBe('error');
  });
});

describe('replacePersonaImage — whose persona', () => {
  it('scopes the update to the caller workspace, not just the model id', async () => {
    await replacePersonaImage(null, fd({ modelId: 'model-1', kind: 'full_body', url: OK_URL }));
    expect(h.updated[0].filters).toMatchObject({ id: 'model-1', workspace_id: 'ws-1' });
    expect(h.updated[0].patch).toEqual({ full_body_url: OK_URL });
  });

  it('reports not-found when the update matches zero rows', async () => {
    // Another workspace's persona: RLS + the explicit filter mean zero rows.
    // The message must not reveal whether that id exists elsewhere.
    h.rowsReturned = [];
    const r = await replacePersonaImage(null, fd({ modelId: 'someone-elses', kind: 'portrait', url: OK_URL }));
    expect(r).toEqual({ status: 'error', error: 'Persona not found.' });
  });

  it('refuses when nobody is signed in', async () => {
    h.user = null;
    const r = await replacePersonaImage(null, fd({ modelId: 'model-1', kind: 'portrait', url: OK_URL }));
    expect(r).toEqual({ status: 'error', error: 'Not signed in.' });
    expect(h.updated).toHaveLength(0);
  });

  it('surfaces a database error instead of reporting success', async () => {
    h.updateError = { message: 'permission denied' };
    const r = await replacePersonaImage(null, fd({ modelId: 'model-1', kind: 'portrait', url: OK_URL }));
    expect(r.status).toBe('error');
  });

  it('does not write in demo mode', async () => {
    h.demo = true;
    const r = await replacePersonaImage(null, fd({ modelId: 'model-1', kind: 'portrait', url: OK_URL }));
    expect(r).toEqual({ status: 'saved', kind: 'portrait' });
    expect(h.updated).toHaveLength(0);
  });
});
