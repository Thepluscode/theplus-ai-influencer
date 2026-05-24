import 'server-only';
import { serverEnv } from '@/lib/env';

/**
 * Real Zernio API client. Maps to https://docs.zernio.com (REST + Bearer
 * auth). Server-only — the API key must never reach the browser.
 *
 * Coverage:
 *   - listAccounts
 *   - initiateConnection (returns the platform OAuth URL)
 *   - createPost (immediate or scheduled)
 *   - listPosts / deletePost
 *   - getPostAnalytics
 *   - replyToComment / sendDmReply (Inbox add-on — reply to inbound
 *     engagement ingested via the comment.received / message.received
 *     webhooks; see src/lib/zernio-webhooks.ts)
 *
 * Out of scope: ads. Reading the inbox via REST (listInboxComments /
 * listInboxConversations) is unused — ingest is webhook-driven.
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

export interface ZernioPostMetrics {
  views: number;
  likes: number;
  comments: number;
  saves: number;
  /** Last time Zernio refreshed the metrics for this post, if surfaced. */
  fetchedAt: string;
}

/**
 * Coerce Zernio's loosely-typed analytics response into our internal
 * shape. Zernio's response shape varies across platforms (Instagram
 * "saves" vs Twitter "bookmarks", etc.), so we read multiple aliases.
 */
function normalizeZernioMetrics(raw: Record<string, unknown>): ZernioPostMetrics | null {
  // Some endpoints nest metrics inside `analytics` or `metrics`.
  const buckets: unknown[] = [
    raw,
    (raw as { analytics?: unknown }).analytics,
    (raw as { metrics?: unknown }).metrics,
    (raw as { engagement?: unknown }).engagement,
  ];
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  let found = false;
  let views = 0;
  let likes = 0;
  let comments = 0;
  let saves = 0;
  for (const b of buckets) {
    if (!b || typeof b !== 'object') continue;
    const r = b as Record<string, unknown>;
    const v = num(r.views ?? r.impressions ?? r.plays ?? r.video_views);
    const l = num(r.likes ?? r.reactions ?? r.favorites);
    const c = num(r.comments ?? r.replies);
    const s = num(r.saves ?? r.bookmarks ?? r.shares ?? r.reposts);
    if (v || l || c || s) {
      found = true;
      views = Math.max(views, v);
      likes = Math.max(likes, l);
      comments = Math.max(comments, c);
      saves = Math.max(saves, s);
    }
  }
  if (!found) return null;
  return {
    views,
    likes,
    comments,
    saves,
    fetchedAt: new Date().toISOString(),
  };
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
    const data = await this.request<{ profiles?: ZernioProfile[] } | ZernioProfile[]>('/profiles');
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

  /**
   * Best-effort fetch of engagement metrics for a single Zernio post id.
   * Zernio's response shape isn't formally documented for analytics yet,
   * so we accept multiple field name conventions (views/impressions,
   * likes/reactions, comments, saves/shares) and surface whatever lands.
   * Returns null on any non-OK response so callers can fall back to a
   * placeholder without try/catch noise.
   */
  async getPostAnalytics(zernioPostId: string): Promise<ZernioPostMetrics | null> {
    // Try the dedicated analytics endpoint first, fall back to the
    // post-detail endpoint which may embed metrics inline.
    const endpoints = [
      `/posts/${encodeURIComponent(zernioPostId)}/analytics`,
      `/posts/${encodeURIComponent(zernioPostId)}`,
    ];
    for (const path of endpoints) {
      try {
        const data = await this.request<Record<string, unknown>>(path);
        const m = normalizeZernioMetrics(data);
        if (m) return m;
      } catch {
        // try next endpoint
      }
    }
    return null;
  }

  async listPosts(
    opts: {
      status?: ZernioPostStatus;
      platform?: ZernioPlatform;
      profileId?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ posts: ZernioPost[]; pagination?: { total: number; pages: number } }> {
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

  /**
   * Reply to a comment on a post (Inbox add-on). `zernioPostId` is the
   * post the comment lives on; `commentId` targets a specific comment
   * (omit to reply to the post itself). Returns the new comment id.
   * POST /inbox/comments/{postId} → { success, data: { commentId, isReply } }
   */
  async replyToComment(input: {
    zernioPostId: string;
    accountId: string;
    message: string;
    commentId?: string;
  }): Promise<{ commentId?: string }> {
    const body: Record<string, unknown> = {
      accountId: input.accountId,
      message: input.message,
    };
    if (input.commentId) body.commentId = input.commentId;
    const res = await this.request<{ data?: { commentId?: string } }>(
      `/inbox/comments/${encodeURIComponent(input.zernioPostId)}`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return { commentId: res.data?.commentId };
  }

  /**
   * Send a message in an existing inbox conversation (Inbox add-on).
   * `conversationId` is the platform-specific conversation id carried on
   * the message.received webhook (conversation.platformConversationId).
   * POST /inbox/conversations/{conversationId}/messages
   */
  async sendDmReply(input: {
    conversationId: string;
    accountId: string;
    message: string;
  }): Promise<void> {
    await this.request(
      `/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ accountId: input.accountId, message: input.message }),
      },
    );
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
