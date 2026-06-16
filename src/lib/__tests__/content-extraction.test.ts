import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  serverEnv: { OPENAI_STUB: true, CONTENT_SOURCE_MAX_BYTES: 26_214_400 },
}));

import { extractAtoms, extractSourceText } from '@/lib/content-extraction';
import { ATOM_KINDS } from '@/lib/content-sources-schema';
import type { ContentSourceRow } from '@/lib/supabase/types';

const pasteSource = {
  id: 's1',
  workspace_id: 'w1',
  title: 'Test',
  type: 'paste',
  status: 'extracting',
  storage_path: null,
  byte_size: null,
  mime_type: null,
  raw_text: 'Most creators burn out.   \r\n\n\nThey treat every post as new work. The fix is a system.',
  extracted_text: null,
  last_error: null,
  created_at: '',
  updated_at: '',
} as ContentSourceRow;

describe('extractSourceText (paste)', () => {
  it('normalizes whitespace from pasted text', async () => {
    const text = await extractSourceText(pasteSource);
    expect(text).toContain('Most creators burn out.');
    expect(text).not.toContain('\r');
    expect(text).not.toMatch(/\n{3,}/);
    expect(text.startsWith(' ')).toBe(false);
  });
});

describe('extractAtoms (stub)', () => {
  it('returns atoms with valid kinds', async () => {
    const atoms = await extractAtoms(
      'First strong claim here. Second supporting point follows. Third proof point lands.',
    );
    expect(atoms.length).toBeGreaterThan(0);
    for (const a of atoms) {
      expect(ATOM_KINDS).toContain(a.kind);
      expect(a.text.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same input', async () => {
    const text = 'Alpha sentence one. Beta sentence two. Gamma sentence three.';
    const a = await extractAtoms(text);
    const b = await extractAtoms(text);
    expect(a).toEqual(b);
  });

  it('throws on empty input', async () => {
    await expect(extractAtoms('   ')).rejects.toThrow();
  });
});
