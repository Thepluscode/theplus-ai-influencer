import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from '@/lib/fetch-retry';

// Zero delays so the retry loop runs instantly under test.
const FAST = { baseDelayMs: 0, maxDelayMs: 0 } as const;

function resp(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWithRetry', () => {
  it('returns immediately on a 2xx without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(200));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', {}, FAST);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resp(429))
      .mockResolvedValueOnce(resp(200));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', {}, FAST);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries on persistent 429 and returns the last response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(429));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', {}, { ...FAST, retries: 2 });

    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does NOT retry 5xx when retryOn5xx is false (non-idempotent write)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(503));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', {}, { ...FAST, retryOn5xx: false });

    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx by default then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resp(500))
      .mockResolvedValueOnce(resp(200));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', {}, FAST);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a network failure then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(resp(200));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchWithRetry('https://x.test', {}, FAST);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rethrows when the network fails on every attempt', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithRetry('https://x.test', {}, { ...FAST, retries: 1 })).rejects.toThrow(
      'ENOTFOUND',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });
});
