import 'server-only';
import { serverEnv } from '@/lib/env';

/**
 * Real Zernio API client. Maps to https://docs.zernio.com (REST + Bearer
 * auth). Server-only — the API key must never reach the browser.
 *
 * Coverage in v1:
 *   - listAccounts
 *   - initiateConnection (returns the platform OAuth URL)
 *   - createPost (immediate or scheduled)
 *   - listPosts
 *   - deletePost
 *
 * Out of scope for v1: ads, comments/DMs, analytics — add when the
 * matching surfaces ship in the app.
 */

export type ZernioPlatform =
  | 'twitter'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'linkedin'
  | 'threads'
  | 'tiktok'
  | 'pinterest'
  | 'reddit';

export type ZernioPostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface ZernioProfile {
  _id: string;
  name: string;
  description?: string;
  color?: string;
  isDefault?: boolean;
}

export interface ZernioAccount {
  _id: string;
  platform: string;
  profileId?: string;
  username?: string;
  displayName?: string;
  isActive?: boolean;
}

export interface ZernioMediaItem {
  type: 'image' | 'video' | 'gif' | 'document';
  url: string;
}

export interface ZernioPlatformTarget {
  platform: ZernioPlatform | string;
  accountId: string;
}

export interface ZernioPost {
  _id: string;
  content?: string;
  status?: ZernioPostStatus;
  scheduledFor?: string;
  platforms?: Array<{ platform: string; accountId: string; status?: string }>;
}

export interface CreatePostInput {
  content: string;
  platforms: ZernioPlatformTarget[];
  publishNow?: boolean;
  scheduledFor?: Date;
  timezone?: string;
  mediaItems?: ZernioMediaItem[];
  profileId?: string;
}

export class ZernioClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    if (!serverEnv.ZERNIO_API_KEY) {
      throw new Error('ZERNIO_API_KEY missing. Add it to .env.local before calling Zernio.');
    }
    this.baseUrl = serverEnv.ZERNIO_API_BASE_URL;
    this.apiKey = serverEnv.ZERNIO_API_KEY;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      // Don't cache anything; Zernio is a writable remote.
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...init.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Zernio ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`,
      );
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async listProfiles(): Promise<ZernioProfile[]> {
    // Be defensive about the response shape — docs hint at { profiles: [...] }
    // but other endpoints have inconsistent envelopes.
    const data = await this.request<
      { profiles?: ZernioProfile[] } | ZernioProfile[]
    >('/profiles');
    if (Array.isArray(data)) return data;
    return data.profiles ?? [];
  }

  async createProfile(input: {
    name: string;
    description?: string;
    color?: string;
  }): Promise<ZernioProfile> {
    return this.request<ZernioProfile>('/profiles', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listAccounts(profileId?: string): Promise<ZernioAccount[]> {
    const qs = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
    const data = await this.request<{ accounts: ZernioAccount[] }>(`/accounts${qs}`);
    return data.accounts ?? [];
  }

  /**
   * Returns the platform-specific OAuth URL the user should be sent to.
   * Zernio handles the platform's callback itself, then redirects to
   * `redirectUrl` (if supplied).
   */
  async initiateConnection(
    platform: ZernioPlatform,
    opts: { profileId?: string; redirectUrl?: string } = {},
  ): Promise<{ authUrl: string; state: string }> {
    const params = new URLSearchParams();
    if (opts.profileId) params.set('profileId', opts.profileId);
    if (opts.redirectUrl) params.set('redirect_url', opts.redirectUrl);
    const qs = params.toString();
    return this.request(`/connect/${platform}${qs ? `?${qs}` : ''}`);
  }

  async createPost(input: CreatePostInput): Promise<ZernioPost> {
    const body: Record<string, unknown> = {
      content: input.content,
      platforms: input.platforms,
    };
    if (input.publishNow) body.publishNow = true;
    if (input.scheduledFor) body.scheduledFor = input.scheduledFor.toISOString();
    if (input.timezone) body.timezone = input.timezone;
    if (input.mediaItems && input.mediaItems.length > 0) body.mediaItems = input.mediaItems;
    if (input.profileId) body.profileId = input.profileId;

    return this.request<ZernioPost>('/posts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async listPosts(opts: {
    status?: ZernioPostStatus;
    platform?: ZernioPlatform;
    profileId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ posts: ZernioPost[]; pagination?: { total: number; pages: number } }> {
    const params = new URLSearchParams();
    if (opts.status) params.set('status', opts.status);
    if (opts.platform) params.set('platform', opts.platform);
    if (opts.profileId) params.set('profileId', opts.profileId);
    if (opts.page) params.set('page', String(opts.page));
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return this.request(`/posts${qs ? `?${qs}` : ''}`);
  }

  /**
   * DELETE only succeeds for draft + scheduled posts. Already-published
   * posts return a 4xx — we let that bubble up to the caller.
   */
  async deletePost(zernioPostId: string): Promise<void> {
    await this.request(`/posts/${encodeURIComponent(zernioPostId)}`, {
      method: 'DELETE',
    });
  }
}

let cached: ZernioClient | null = null;

export function getZernioClient(): ZernioClient {
  if (!cached) cached = new ZernioClient();
  return cached;
}

let cachedDefaultProfileId: string | null = null;

/**
 * Lazy lookup of the workspace's default Zernio profile. Almost every other
 * endpoint requires a profileId — and getting "Profile ID is required" 400s
 * is the most common first-time setup failure. Cached at the module level
 * since the default profile rarely changes within a process lifetime.
 *
 * Logic: prefer the profile with isDefault=true, fall back to the first
 * profile, and if there are none, create a "Default" one.
 */
export async function getDefaultZernioProfileId(): Promise<string> {
  if (cachedDefaultProfileId) return cachedDefaultProfileId;
  const zernio = getZernioClient();
  const profiles = await zernio.listProfiles();
  const chosen = profiles.find((p) => p.isDefault) ?? profiles[0];
  if (chosen) {
    cachedDefaultProfileId = chosen._id;
    return cachedDefaultProfileId;
  }
  const created = await zernio.createProfile({ name: 'Default' });
  cachedDefaultProfileId = created._id;
  return cachedDefaultProfileId;
}

/**
 * Best-effort mapping from a connected-account list to the first active
 * account per platform. Used when our app stores platforms by name only
 * (e.g. ["instagram", "tiktok"]) and we need to resolve them to Zernio
 * account IDs at publish time.
 */
export function pickAccountsForPlatforms(
  accounts: ZernioAccount[],
  platforms: string[],
): { resolved: ZernioPlatformTarget[]; missing: string[] } {
  const resolved: ZernioPlatformTarget[] = [];
  const missing: string[] = [];
  for (const platform of platforms) {
    const match = accounts.find(
      (a) => a.platform.toLowerCase() === platform.toLowerCase() && (a.isActive ?? true),
    );
    if (match) {
      resolved.push({ platform: match.platform, accountId: match._id });
    } else {
      missing.push(platform);
    }
  }
  return { resolved, missing };
}
