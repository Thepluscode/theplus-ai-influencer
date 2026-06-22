import { describe, expect, it } from 'vitest';
import {
  CHANNELS,
  CONTENT_SOURCE_MAX_BYTES,
  createContentSourceSchema,
  sourceTypeFromMime,
} from '@/lib/content-sources-schema';

describe('createContentSourceSchema', () => {
  it('accepts a non-empty paste', () => {
    const r = createContentSourceSchema.safeParse({ mode: 'paste', text: 'Hello there world.' });
    expect(r.success).toBe(true);
  });

  it('rejects an empty paste', () => {
    const r = createContentSourceSchema.safeParse({ mode: 'paste', text: '   ' });
    expect(r.success).toBe(false);
  });

  it('rejects a paste over 500k chars', () => {
    const r = createContentSourceSchema.safeParse({ mode: 'paste', text: 'a'.repeat(500_001) });
    expect(r.success).toBe(false);
  });

  it('accepts a valid upload', () => {
    const r = createContentSourceSchema.safeParse({
      mode: 'upload',
      storagePath: 'ws/file.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unsupported mime type', () => {
    const r = createContentSourceSchema.safeParse({
      mode: 'upload',
      storagePath: 'ws/file.exe',
      mimeType: 'application/x-msdownload',
      byteSize: 1024,
    });
    expect(r.success).toBe(false);
  });

  it('rejects an oversized upload', () => {
    const r = createContentSourceSchema.safeParse({
      mode: 'upload',
      storagePath: 'ws/big.mp4',
      mimeType: 'video/mp4',
      byteSize: CONTENT_SOURCE_MAX_BYTES + 1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects an upload missing the storage path', () => {
    const r = createContentSourceSchema.safeParse({
      mode: 'upload',
      mimeType: 'application/pdf',
      byteSize: 1024,
    });
    expect(r.success).toBe(false);
  });
});

describe('sourceTypeFromMime', () => {
  it('maps known mime types', () => {
    expect(sourceTypeFromMime('application/pdf')).toBe('pdf');
    expect(sourceTypeFromMime('text/markdown')).toBe('md');
    expect(sourceTypeFromMime('audio/mpeg')).toBe('audio');
    expect(sourceTypeFromMime('audio/mpga')).toBe('audio');
    expect(sourceTypeFromMime('video/mp4')).toBe('video');
  });

  it('returns null for unknown types', () => {
    expect(sourceTypeFromMime('application/zip')).toBeNull();
  });
});

describe('CHANNELS', () => {
  it('defines exactly 10 channels with unique keys', () => {
    expect(CHANNELS).toHaveLength(10);
    const keys = new Set(CHANNELS.map((c) => c.key));
    expect(keys.size).toBe(10);
  });
});
