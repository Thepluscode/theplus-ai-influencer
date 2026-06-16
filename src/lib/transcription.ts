import 'server-only';
import { serverEnv } from '@/lib/env';

// ---------------------------------------------------------------------------
// Audio/video transcription via OpenAI speech-to-text.
// ---------------------------------------------------------------------------
// Direct multipart fetch to /v1/audio/transcriptions (no SDK dep, matching
// captions.ts). OPENAI_STUB=1 returns a deterministic transcript so the full
// Content OS pipeline runs offline without paid calls. 25 MB cap is enforced
// by the caller (extraction) before we ever reach the network.
// ---------------------------------------------------------------------------

const OPENAI_MAX_BYTES = 26_214_400; // 25 MB — OpenAI speech-to-text hard limit.

export async function transcribeSource(file: Blob, filename: string): Promise<string> {
  if (serverEnv.OPENAI_STUB) {
    return [
      'This is a stubbed transcript generated because OPENAI_STUB=1.',
      `It stands in for the spoken content of "${filename}".`,
      'In this segment the speaker walks through the core idea, shares a concrete',
      'story, names the objection most people have, and closes with a clear call',
      'to action. The repackage step turns these beats into channel-native posts.',
    ].join(' ');
  }

  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY missing — set it in .env.local or set OPENAI_STUB=1 for a stub transcript.',
    );
  }

  if (file.size > OPENAI_MAX_BYTES) {
    throw new Error(
      `Audio/video is ${(file.size / 1024 / 1024).toFixed(1)} MB — OpenAI transcription accepts 25 MB max. Trim or compress the file and try again.`,
    );
  }

  const form = new FormData();
  form.append('file', file, filename);
  form.append('model', serverEnv.OPENAI_TRANSCRIBE_MODEL);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI transcription ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { text?: string };
  const transcript = (data.text ?? '').trim();
  if (!transcript) {
    throw new Error('OpenAI transcription returned no usable text.');
  }
  return transcript;
}
