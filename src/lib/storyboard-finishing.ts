import 'server-only';

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { createElement as h } from 'react';
import { serverEnv } from '@/lib/env';
import { fetchWithRetry } from '@/lib/fetch-retry';

// Turns a stitched storyboard into a finished short: each shot's hookCaption
// is burned in as an on-screen caption and, when enabled, narrated.
//
// Captions are rendered to transparent PNGs here and composited with ffmpeg's
// `overlay` filter, which every ffmpeg build has. drawtext/subtitles need
// freetype/libass, which some builds (Homebrew ffmpeg 8) lack. next/og ships
// its own font, so no system fonts are needed either.

/** Longest hook caption we caption or narrate; also bounds speech spend. */
export const MAX_CAPTION_CHARS = 200;

export interface FinishingDimensions {
  width: number;
  height: number;
}

export interface ShotFinishing {
  captionPath: string | null;
  voicePath: string | null;
}

export function captionTextForShot(shot: { hookCaption?: unknown }): string | null {
  if (typeof shot.hookCaption !== 'string') return null;
  const text = shot.hookCaption.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > MAX_CAPTION_CHARS ? `${text.slice(0, MAX_CAPTION_CHARS - 1)}…` : text;
}

// next/og ships only Geist (Latin). For any glyph outside it, satori fetches a
// font from Google Fonts with the caption text in the URL, and emoji from a
// CDN — a runtime network dependency that would send customer copy to a third
// party. So a burned caption is limited to what Geist covers offline: emoji
// are dropped from the burned text (narration keeps them), and a caption in
// another script is not burned at all.
// ponytail: Latin-only burn-in; bundle Noto fonts via the `fonts` option to add scripts.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu;
const OFFLINE_GLYPHS = /^[ -ɏ -⁯₠-⃏]*$/u;

export function burnableCaption(text: string): string | null {
  const withoutEmoji = text.replace(EMOJI, '').replace(/\s+/g, ' ').trim();
  if (!withoutEmoji || !OFFLINE_GLYPHS.test(withoutEmoji)) return null;
  return withoutEmoji;
}

export async function renderCaptionPng(
  text: string,
  dimensions: FinishingDimensions,
): Promise<Buffer> {
  if (burnableCaption(text) !== text) {
    throw new Error('Caption contains characters that cannot be rendered offline.');
  }
  const short =Math.min(dimensions.width, dimensions.height);
  const fontSize = Math.round(short * 0.058);
  const response = new ImageResponse(
    h(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: Math.round(dimensions.height * 0.12),
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            maxWidth: Math.round(dimensions.width * 0.86),
            padding: `${Math.round(fontSize * 0.4)}px ${Math.round(fontSize * 0.6)}px`,
            borderRadius: Math.round(fontSize * 0.4),
            background: 'rgba(0, 0, 0, 0.72)',
            color: '#ffffff',
            fontSize,
            lineHeight: 1.25,
            textAlign: 'center',
          },
        },
        text,
      ),
    ),
    { width: dimensions.width, height: dimensions.height },
  );
  if (!response.ok) throw new Error(`Caption render failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Speech for one caption line. The single seam for the speech provider:
 * OpenAI's /v1/audio/speech models shut down on 2027-01-06, so a replacement
 * provider lands here and nowhere else.
 */
export async function synthesizeSpeech(text: string, timeoutMs: number): Promise<Buffer> {
  if (serverEnv.OPENAI_STUB) return stubSpeechWav(text);
  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error('Voiceover is enabled but OPENAI_API_KEY is not set.');
  }
  const response = await fetchWithRetry(
    'https://api.openai.com/v1/audio/speech',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: serverEnv.OPENAI_TTS_MODEL,
        voice: serverEnv.OPENAI_TTS_VOICE,
        input: text,
        response_format: 'wav',
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
    { retries: 1 },
  );
  if (!response.ok) {
    throw new Error(`Speech synthesis failed (${response.status}).`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.byteLength === 0) throw new Error('Speech synthesis returned no audio.');
  return audio;
}

/**
 * Writes caption PNGs (always, when a shot has a caption) and voiceover
 * audio (when enabled) for each shot, in shot order.
 */
export async function prepareShotFinishing(input: {
  shots: Array<{ hookCaption?: unknown }>;
  dimensions: FinishingDimensions;
  workDir: string;
  voiceover: boolean;
  remainingMs: () => number;
}): Promise<ShotFinishing[]> {
  const finishing: ShotFinishing[] = [];
  for (const [position, shot] of input.shots.entries()) {
    const text = captionTextForShot(shot);
    if (!text) {
      finishing.push({ captionPath: null, voicePath: null });
      continue;
    }
    const stem = path.join(input.workDir, `finish-${position.toString().padStart(2, '0')}`);
    const burned = burnableCaption(text);
    let captionPath: string | null = null;
    if (burned) {
      captionPath = `${stem}.png`;
      await writeFile(captionPath, await renderCaptionPng(burned, input.dimensions));
    } else {
      console.warn('[storyboard-export] caption not burned: characters outside the bundled font', {
        shot: position + 1,
      });
    }

    let voicePath: string | null = null;
    if (input.voiceover) {
      voicePath = `${stem}.wav`;
      const timeoutMs = Math.min(30_000, input.remainingMs());
      await writeFile(voicePath, await synthesizeSpeech(text, timeoutMs));
    }
    finishing.push({ captionPath, voicePath });
  }
  return finishing;
}

// Deterministic, audible stand-in for speech: a 440 Hz tone whose length
// tracks the text, so stub exports exercise the real mixing path.
function stubSpeechWav(text: string): Buffer {
  const sampleRate = 24_000;
  const seconds = Math.min(4, 0.6 + text.length * 0.03);
  const samples = Math.round(sampleRate * seconds);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5 * 32767);
    data.writeInt16LE(value, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
