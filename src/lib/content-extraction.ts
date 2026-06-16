import 'server-only';
import { z } from 'zod';
import { serverEnv } from '@/lib/env';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { ContentSourceRow } from '@/lib/supabase/types';
import { ATOM_KINDS, type AtomKind } from '@/lib/content-sources-schema';
import { transcribeSource } from '@/lib/transcription';

// ---------------------------------------------------------------------------
// Content OS — extraction pipeline.
// ---------------------------------------------------------------------------
//   extractSourceText  — normalize paste/txt/md, parse PDF (unpdf), or
//                        transcribe audio/video into one clean text blob.
//   extractAtoms       — pull structured reusable units (hook, claim, story,
//                        quote, framework, objection, proof_point, cta,
//                        audience_insight) via one OpenAI call. OPENAI_STUB=1
//                        returns deterministic atoms derived from the text.
//
// Runs inside the cron worker (service-role admin client for storage reads).
// ---------------------------------------------------------------------------

export interface ExtractedAtom {
  kind: AtomKind;
  text: string;
  tags: string[];
  sourceLocation: string | null;
  confidence: number | null;
}

function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Download a stored source file via the service-role client. */
async function downloadSourceBlob(storagePath: string): Promise<Blob> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from('content-sources').download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to download source file: ${error?.message ?? 'no data'}`);
  }
  if (data.size > serverEnv.CONTENT_SOURCE_MAX_BYTES) {
    throw new Error(
      `Source file is ${(data.size / 1024 / 1024).toFixed(1)} MB — exceeds the ${(serverEnv.CONTENT_SOURCE_MAX_BYTES / 1024 / 1024).toFixed(0)} MB limit.`,
    );
  }
  return data;
}

async function extractPdfText(blob: Blob): Promise<string> {
  // Dynamic import keeps unpdf out of any non-extraction bundle. unpdf is
  // pure-JS and serverless-safe (no native build, no filesystem reads).
  const { extractText, getDocumentProxy } = await import('unpdf');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n\n') : text;
}

/**
 * Resolve a source to clean text. Paste text comes straight from raw_text;
 * uploaded txt/md is downloaded as text; PDFs go through unpdf; audio/video
 * go through OpenAI transcription.
 */
export async function extractSourceText(source: ContentSourceRow): Promise<string> {
  // Paste sources carry their text inline.
  if (source.type === 'paste' && source.raw_text) {
    return normalizeText(source.raw_text);
  }

  if (!source.storage_path) {
    // txt/md pasted without a file still lands in raw_text.
    if (source.raw_text) return normalizeText(source.raw_text);
    throw new Error('Source has no file or text to extract from.');
  }

  const blob = await downloadSourceBlob(source.storage_path);

  switch (source.type) {
    case 'pdf':
      return normalizeText(await extractPdfText(blob));
    case 'audio':
    case 'video': {
      const filename = source.storage_path.split('/').pop() ?? 'source';
      return normalizeText(await transcribeSource(blob, filename));
    }
    case 'txt':
    case 'md':
    case 'paste':
    default:
      return normalizeText(await blob.text());
  }
}

// ---------------------------------------------------------------------------
// Atom extraction
// ---------------------------------------------------------------------------

const atomItemSchema = z.object({
  kind: z.enum(ATOM_KINDS),
  text: z.string().trim().min(1),
  tags: z.array(z.string()).optional(),
  sourceLocation: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
const atomsResponseSchema = z.object({ atoms: z.array(atomItemSchema) });

const ATOM_SYSTEM_PROMPT = `You are a content strategist who breaks long-form source material into reusable "atoms".

You always respond with ONE valid JSON object: { "atoms": [ ... ] }. No prose, no markdown fences.

Each atom has:
- "kind": one of hook | claim | story | quote | framework | objection | proof_point | cta | audience_insight
- "text": the atom itself, lightly cleaned but faithful to the source (no fabrication)
- "tags": 0-4 short topical tags (lowercase)
- "sourceLocation": optional short locator (e.g. "intro", "section 2")
- "confidence": 0..1 — how strongly the source supports this atom

Rules:
- Extract 8-20 atoms that genuinely appear in or are directly implied by the source.
- Never invent facts, quotes, or proof points the source does not support.
- Prefer specific, repackage-ready units over vague summaries.`;

export async function extractAtoms(text: string): Promise<ExtractedAtom[]> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('No text to extract atoms from.');

  if (serverEnv.OPENAI_STUB) {
    return stubAtoms(trimmed);
  }
  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing — set OPENAI_STUB=1 for deterministic atoms.');
  }

  // Cap the prompt to keep token cost bounded; atoms come from the most
  // information-dense opening of long sources.
  const promptText = trimmed.slice(0, 24_000);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_CAPTION_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: ATOM_SYSTEM_PROMPT },
        { role: 'user', content: `Source:\n"""\n${promptText}\n"""` },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned no atom content.');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON atoms: ${raw.slice(0, 200)}`);
  }
  const parsed = atomsResponseSchema.safeParse(parsedJson);
  if (!parsed.success || parsed.data.atoms.length === 0) {
    throw new Error('OpenAI atom response failed validation.');
  }

  return parsed.data.atoms.map((a) => ({
    kind: a.kind,
    text: a.text,
    tags: a.tags ?? [],
    sourceLocation: a.sourceLocation ?? null,
    confidence: a.confidence ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Stub atoms — deterministic, derived from the actual source so the operator
// sees their input reflected back.
// ---------------------------------------------------------------------------

function stubAtoms(text: string): ExtractedAtom[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12)
    .slice(0, 9);

  const kinds: AtomKind[] = [
    'hook',
    'claim',
    'story',
    'quote',
    'framework',
    'objection',
    'proof_point',
    'audience_insight',
    'cta',
  ];

  const atoms: ExtractedAtom[] = sentences.map((sentence, i) => ({
    kind: kinds[i % kinds.length],
    text: sentence.length > 280 ? sentence.slice(0, 277) + '…' : sentence,
    tags: ['stub'],
    sourceLocation: i === 0 ? 'intro' : `sentence ${i + 1}`,
    confidence: 0.6,
  }));

  // Guarantee at least one atom even for very short sources.
  if (atoms.length === 0) {
    atoms.push({
      kind: 'claim',
      text: text.slice(0, 200),
      tags: ['stub'],
      sourceLocation: 'intro',
      confidence: 0.5,
    });
  }
  return atoms;
}
