import 'server-only';

// ---------------------------------------------------------------------------
// fetchWithRetry — backoff for rate-limited / transient upstreams
// ---------------------------------------------------------------------------
// Our hand-rolled OpenAI (captions) and Zernio clients call `fetch` once and
// throw on any non-OK response. A launch-day spike turns one 429 into a user-
// visible error with no second chance. This wrapper retries 429 + network
// failures (and 5xx when the request is safe to repeat) with exponential
// backoff + jitter, honoring `Retry-After` when the server sends it.
//
// It returns the final Response (OK or not) so callers keep their existing
// status handling — it only intervenes on *retryable* responses, exhausting
// its budget before handing the last response back.
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Max retry attempts after the first try. Default 3. */
  retries?: number;
  /** Base backoff in ms (doubles each attempt). Default 500. */
  baseDelayMs?: number;
  /** Ceiling on any single backoff wait. Default 20_000. */
  maxDelayMs?: number;
  /**
   * Retry 5xx responses. Safe for reads and for idempotent POSTs (OpenAI
   * completions). Turn OFF for non-idempotent mutations where a 5xx might
   * mean the write half-succeeded (e.g. Zernio createPost). Default true.
   */
  retryOn5xx?: boolean;
}

const RETRYABLE_DEFAULTS: Required<RetryOptions> = {
  retries: 3,
  baseDelayMs: 500,
  maxDelayMs: 20_000,
  retryOn5xx: true,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse `Retry-After` (delta-seconds or HTTP-date) into ms, or null. */
function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - Date.now());
}

function backoffMs(attempt: number, opts: Required<RetryOptions>): number {
  const exp = opts.baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * opts.baseDelayMs; // jitter to avoid thundering herd
  return Math.min(opts.maxDelayMs, exp + jitter);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<Response> {
  const opts = { ...RETRYABLE_DEFAULTS, ...options };
  let lastNetworkErr: unknown;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // Network-level failure (DNS, reset, timeout) — retry with backoff.
      lastNetworkErr = err;
      if (attempt === opts.retries) throw err;
      await sleep(backoffMs(attempt, opts));
      continue;
    }

    const retryable = res.status === 429 || (opts.retryOn5xx && res.status >= 500);
    if (!retryable || attempt === opts.retries) return res;

    const wait = retryAfterMs(res) ?? backoffMs(attempt, opts);
    await sleep(wait);
  }

  // Unreachable: the loop returns or throws on the final attempt. Satisfies
  // the type checker and guards against a future off-by-one.
  throw lastNetworkErr ?? new Error('fetchWithRetry exhausted without a response');
}
