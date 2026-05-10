import { serverEnv } from '@/lib/env';

/**
 * Server-only Zenio client. Don't import from client components.
 *
 * Zenio handles multi-platform social scheduling. Wire the actual
 * endpoints once you have credentials and read their docs — the methods
 * below are placeholders that match the *intent*, not their real API.
 */
export class ZenioClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    if (!serverEnv.ZENIO_API_KEY) {
      throw new Error('ZENIO_API_KEY missing. Add it to .env.local before calling Zenio.');
    }
    this.baseUrl = serverEnv.ZENIO_API_BASE_URL;
    this.apiKey = serverEnv.ZENIO_API_KEY;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...init.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zenio ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  // TODO: replace stubs with real endpoints from Zenio's docs.
  listConnectedAccounts() {
    return this.request<{ accounts: Array<{ platform: string; id: string; username: string }> }>(
      '/accounts',
    );
  }

  schedulePost(input: {
    accountIds: string[];
    caption: string;
    mediaUrls: string[];
    scheduledFor: Date;
  }) {
    return this.request<{ id: string; status: string }>('/posts', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        scheduledFor: input.scheduledFor.toISOString(),
      }),
    });
  }
}

let cached: ZenioClient | null = null;

export function getZenioClient(): ZenioClient {
  if (!cached) {
    cached = new ZenioClient();
  }
  return cached;
}
