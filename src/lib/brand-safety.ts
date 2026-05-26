import 'server-only';
import { serverEnv } from '@/lib/env';

// ---------------------------------------------------------------------------
// Brand-Safety Guardian — v4 of STRATEGY.md
// ---------------------------------------------------------------------------
// Pre-publish check that audits a caption (and optionally the image URL)
// for: platform-policy violations, brand-voice drift, missing sponsored
// disclosure, hate / violence / sexual / illegal terms. Returns a verdict
// the Schedule panel uses to either let publish proceed (pass), warn
// inline (warn), or block (block) until the operator fixes the issues.
// ---------------------------------------------------------------------------

export type SafetyVerdict = 'pass' | 'warn' | 'block';
export type SafetySeverity = 'low' | 'medium' | 'high';
export type SafetyCode =
  | 'hate_or_violence'
  | 'sexual_content'
  | 'illegal_or_dangerous'
  | 'platform_policy'
  | 'undisclosed_sponsorship'
  | 'medical_claim'
  | 'misleading'
  | 'brand_voice_drift'
  | 'profanity'
  | 'other';

export interface SafetyIssue {
  severity: SafetySeverity;
  code: SafetyCode;
  message: string;
  suggestion?: string;
}

export interface SafetyResult {
  verdict: SafetyVerdict;
  issues: SafetyIssue[];
  /** One-line takeaway shown above the issue list. */
  summary: string;
}

interface CheckInput {
  caption: string;
  imageUrl?: string | null;
  platforms?: string[];
  /** Persona vibe context — helps the LLM judge brand-voice drift. */
  personaVibe?: string;
}

const SYSTEM_PROMPT = `You are a brand-safety reviewer for AI influencer social media posts. You audit captions (and optionally image URLs) before they ship.

You must return ONE valid JSON object with this exact shape:
{
  "verdict": "pass" | "warn" | "block",
  "summary": "one-line takeaway",
  "issues": [
    { "severity": "low" | "medium" | "high", "code": "<one of: hate_or_violence | sexual_content | illegal_or_dangerous | platform_policy | undisclosed_sponsorship | medical_claim | misleading | brand_voice_drift | profanity | other>", "message": "...", "suggestion": "..." }
  ]
}

Rules:
- "block" if ANY issue is severity=high (hate, illegal, sexual content involving minors, unambiguous platform-policy violation).
- "warn" if any issue is severity=medium (missing sponsored disclosure, medical claim, possibly misleading, profanity that may demonetize).
- "pass" if no issues OR only severity=low style nits.
- Always include a suggestion when severity=medium or high.
- Be specific in the message — quote the offending phrase when possible.
- Do NOT invent issues. If the caption is clean, return verdict=pass with an empty issues array.`;

export async function checkBrandSafety(input: CheckInput): Promise<SafetyResult> {
  if (serverEnv.OPENAI_STUB) {
    return stubCheck(input);
  }
  if (!serverEnv.OPENAI_API_KEY) {
    // Without an OpenAI key we can't audit — return a warn-level result
    // so the operator knows the check didn't run, but don't block.
    return {
      verdict: 'warn',
      summary: 'Brand-safety check skipped — OPENAI_API_KEY missing.',
      issues: [
        {
          severity: 'low',
          code: 'other',
          message: 'No OpenAI key configured — auditor was bypassed.',
          suggestion: 'Set OPENAI_API_KEY in .env.local to enable real audits.',
        },
      ],
    };
  }

  const userPrompt = `Caption to audit:
"""
${input.caption || '(empty)'}
"""

${input.imageUrl ? `Image URL (for context): ${input.imageUrl}\n` : ''}
${input.platforms?.length ? `Target platforms: ${input.platforms.join(', ')}\n` : ''}
${input.personaVibe ? `Persona vibe: ${input.personaVibe}\n` : ''}
Return JSON only.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_CAPTION_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned no audit content.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`);
  }
  return normalize(parsed);
}

const VERDICT_SET = new Set<SafetyVerdict>(['pass', 'warn', 'block']);
const SEVERITY_SET = new Set<SafetySeverity>(['low', 'medium', 'high']);
const CODE_SET = new Set<SafetyCode>([
  'hate_or_violence',
  'sexual_content',
  'illegal_or_dangerous',
  'platform_policy',
  'undisclosed_sponsorship',
  'medical_claim',
  'misleading',
  'brand_voice_drift',
  'profanity',
  'other',
]);

function normalize(parsed: unknown): SafetyResult {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Brand-safety response was not an object.');
  }
  const obj = parsed as Record<string, unknown>;
  const verdict = VERDICT_SET.has(obj.verdict as SafetyVerdict)
    ? (obj.verdict as SafetyVerdict)
    : 'warn';
  const summary = typeof obj.summary === 'string' ? obj.summary : '';
  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: SafetyIssue[] = [];
  for (const raw of rawIssues) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const severity = SEVERITY_SET.has(r.severity as SafetySeverity)
      ? (r.severity as SafetySeverity)
      : 'low';
    const code = CODE_SET.has(r.code as SafetyCode) ? (r.code as SafetyCode) : 'other';
    const message = typeof r.message === 'string' ? r.message : '';
    if (!message) continue;
    issues.push({
      severity,
      code,
      message,
      suggestion: typeof r.suggestion === 'string' ? r.suggestion : undefined,
    });
  }
  return { verdict, summary, issues };
}

// Deterministic stub used when OPENAI_STUB=1. Catches obvious red-flag
// words so the UI states are exercisable without a real key.
function stubCheck({ caption }: CheckInput): SafetyResult {
  const lc = caption.toLowerCase();
  const issues: SafetyIssue[] = [];
  if (/\b(cure|guaranteed weight loss|miracle)\b/.test(lc)) {
    issues.push({
      severity: 'medium',
      code: 'medical_claim',
      message: 'Caption makes a medical / health guarantee that platforms (and the FTC) flag.',
      suggestion: 'Soften to "supports" or "helps" instead of "cures" / "guarantees".',
    });
  }
  if (
    /#ad|#sponsored|#partner/.test(lc) === false &&
    /\b(use code|sponsored by|paid partner)\b/.test(lc)
  ) {
    issues.push({
      severity: 'medium',
      code: 'undisclosed_sponsorship',
      message: 'Sponsorship language is present but no #ad / #sponsored disclosure.',
      suggestion: 'Add #ad or #partner near the top of the caption.',
    });
  }
  if (/\b(kill|hate|destroy)\s+\w+/.test(lc)) {
    issues.push({
      severity: 'high',
      code: 'hate_or_violence',
      message: 'Language reads as violent or hostile.',
      suggestion: 'Replace with non-aggressive phrasing.',
    });
  }
  let verdict: SafetyVerdict = 'pass';
  if (issues.some((i) => i.severity === 'high')) verdict = 'block';
  else if (issues.some((i) => i.severity === 'medium')) verdict = 'warn';
  return {
    verdict,
    summary:
      verdict === 'pass'
        ? 'No issues found.'
        : verdict === 'warn'
          ? `${issues.length} medium-severity issue${issues.length === 1 ? '' : 's'} — review before publish.`
          : 'High-severity issue — fix before publishing.',
    issues,
  };
}
