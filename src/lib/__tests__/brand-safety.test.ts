import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('@/lib/env', () => ({ serverEnv: h.env }));

import { checkBrandSafety } from '@/lib/brand-safety';

// ---------------------------------------------------------------------------
// The publish gate. publish-safety.ts funnels every publish path through this
// and blocks on `verdict === 'block'` and nothing else, so whatever verdict
// comes out of here decides whether content reaches a real audience.
// ---------------------------------------------------------------------------

const env = h.env;

function mockOpenAI(payload: unknown, ok = true, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
    json: async () => ({
      choices: [
        { message: { content: typeof payload === 'string' ? payload : JSON.stringify(payload) } },
      ],
    }),
  } as unknown as Response);
}

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  env.OPENAI_API_KEY = 'sk-test';
  env.OPENAI_CAPTION_MODEL = 'gpt-4o-mini';
});
afterEach(() => vi.restoreAllMocks());

describe('a missing key must not read as a clean post', () => {
  it('returns warn, never pass, when OPENAI_API_KEY is absent', async () => {
    delete env.OPENAI_API_KEY;
    const r = await checkBrandSafety({ caption: 'anything at all' });
    // "The audit did not run" and "the audit found nothing" are different
    // facts. Returning pass here would ship unaudited content silently.
    expect(r.verdict).toBe('warn');
    expect(r.summary).toMatch(/skipped/i);
  });
});

describe('the model verdict is a claim, not evidence', () => {
  it('BLOCKS a post the model called pass while reporting a high-severity issue', async () => {
    // The regression this guards: normalize() trusted obj.verdict outright, so
    // an LLM contradicting its own system prompt shipped hate speech.
    mockOpenAI({
      verdict: 'pass',
      summary: 'Looks fine!',
      issues: [{ severity: 'high', code: 'hate_or_violence', message: 'Violent phrasing.' }],
    });
    const r = await checkBrandSafety({ caption: 'x' });
    expect(r.verdict).toBe('block');
  });

  it('escalates pass to warn when a medium-severity issue was reported', async () => {
    mockOpenAI({
      verdict: 'pass',
      summary: '',
      issues: [{ severity: 'medium', code: 'medical_claim', message: 'Health guarantee.' }],
    });
    expect((await checkBrandSafety({ caption: 'x' })).verdict).toBe('warn');
  });

  it('never DE-escalates: a model that blocks with no issues is still honoured', async () => {
    // Caution is not the failure mode worth defending against.
    mockOpenAI({ verdict: 'block', summary: 'Trust me.', issues: [] });
    expect((await checkBrandSafety({ caption: 'x' })).verdict).toBe('block');
  });

  it('leaves a genuinely clean result alone', async () => {
    mockOpenAI({ verdict: 'pass', summary: 'No issues found.', issues: [] });
    const r = await checkBrandSafety({ caption: 'a nice caption' });
    expect(r.verdict).toBe('pass');
    expect(r.issues).toEqual([]);
  });
});

describe('malformed model output fails safe', () => {
  it('treats an unrecognised verdict as warn, not pass', async () => {
    mockOpenAI({ verdict: 'probably_ok', summary: '', issues: [] });
    expect((await checkBrandSafety({ caption: 'x' })).verdict).toBe('warn');
  });

  it('downgrades an unknown severity to low and an unknown code to other', async () => {
    mockOpenAI({
      verdict: 'warn',
      summary: '',
      issues: [{ severity: 'catastrophic', code: 'vibes', message: 'Something.' }],
    });
    const r = await checkBrandSafety({ caption: 'x' });
    expect(r.issues[0]).toMatchObject({ severity: 'low', code: 'other' });
  });

  it('drops issues with no message rather than rendering blanks', async () => {
    mockOpenAI({
      verdict: 'warn',
      summary: '',
      issues: [{ severity: 'high', code: 'other' }, null, 'nonsense'],
    });
    const r = await checkBrandSafety({ caption: 'x' });
    expect(r.issues).toEqual([]);
    // No surviving issues, so nothing to escalate from — the model's own warn stands.
    expect(r.verdict).toBe('warn');
  });

  it('tolerates issues arriving as a non-array', async () => {
    mockOpenAI({ verdict: 'pass', summary: '', issues: 'none' });
    expect((await checkBrandSafety({ caption: 'x' })).issues).toEqual([]);
  });

  it('throws when the response is not an object', async () => {
    mockOpenAI('"just a string"');
    await expect(checkBrandSafety({ caption: 'x' })).rejects.toThrow(/not an object/);
  });

  it('throws on non-JSON content instead of guessing', async () => {
    mockOpenAI('I cannot comply with that request.');
    await expect(checkBrandSafety({ caption: 'x' })).rejects.toThrow(/non-JSON/);
  });

  it('throws on a non-ok HTTP response', async () => {
    // publish-safety treats a throw as fail-closed and refunds the credit, so
    // surfacing the error is what keeps an outage from becoming a free pass.
    mockOpenAI('rate limited', false, 429);
    await expect(checkBrandSafety({ caption: 'x' })).rejects.toThrow(/OpenAI 429/);
  });
});

describe('stub mode', () => {
  beforeEach(() => {
    env.OPENAI_STUB = true;
  });

  it('passes a clean caption', async () => {
    expect((await checkBrandSafety({ caption: 'Morning coffee and a walk.' })).verdict).toBe('pass');
  });

  it('warns on a medical guarantee', async () => {
    const r = await checkBrandSafety({ caption: 'This will cure your acne, guaranteed.' });
    expect(r.verdict).toBe('warn');
    expect(r.issues[0].code).toBe('medical_claim');
  });

  it('warns when sponsorship language carries no disclosure', async () => {
    const r = await checkBrandSafety({ caption: 'Use code SAVE20 at checkout!' });
    expect(r.verdict).toBe('warn');
    expect(r.issues.map((i) => i.code)).toContain('undisclosed_sponsorship');
  });

  it('accepts the same caption once #ad is present', async () => {
    const r = await checkBrandSafety({ caption: '#ad Use code SAVE20 at checkout!' });
    expect(r.issues.map((i) => i.code)).not.toContain('undisclosed_sponsorship');
  });

  it('blocks violent phrasing', async () => {
    const r = await checkBrandSafety({ caption: 'I will destroy everyone who disagrees.' });
    expect(r.verdict).toBe('block');
    expect(r.issues[0].severity).toBe('high');
  });

  it('does not call OpenAI at all', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await checkBrandSafety({ caption: 'anything' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
