/**
 * Hardened HTTP primitives for the JABY mobile REST client.
 *
 * Previously every call in api.ts used bare `fetch()` with no timeout —
 * on a dead network a request could hang indefinitely, leaving spinners
 * stuck and the offline cache path unreachable.
 *
 * Provides:
 * - fetchWithTimeout: AbortController timeout (default 15s).
 * - fetchJsonWithRetry: retry on network errors + 502/503/504 with
 *   exponential backoff (idempotent GETs retry 2x, writes retry 0x by default).
 * - safeParseResponse: HTML/non-JSON-safe body parsing (moved here from api.ts
 *   so all services share one implementation).
 */

export const HTTP_TIMEOUT_MS = 15_000;

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  retryOnStatuses?: number[];
}

const DEFAULT_RETRY_STATUSES = [502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = HTTP_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Safely parse HTTP responses without throwing SyntaxError on HTML/non-JSON
 * (e.g. 502/504 gateway errors from Render cold starts).
 */
export async function safeParseResponse<T = unknown>(res: Response, fallback: T): Promise<T> {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (!res.ok && typeof data === 'object' && data !== null && !('success' in data)) {
        const err = data as Record<string, unknown>;
        return {
          success: false,
          error: (err.error as string) || (err.message as string) || `HTTP ${res.status}`,
        } as unknown as T;
      }
      return data as T;
    }
    const text = await res.text();
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 100)}` } as unknown as T;
    }
    return fallback;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network parse error';
    return { success: false, error: message } as unknown as T;
  }
}

/**
 * GET-friendly fetch with timeout + bounded retries. POST/PUT/DELETE callers
 * should pass { retries: 0 } (default) to avoid duplicate writes.
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions & { timeoutMs?: number; fallback: T }
): Promise<T> {
  const { retries = 0, baseDelayMs = 500, retryOnStatuses = DEFAULT_RETRY_STATUSES, timeoutMs = HTTP_TIMEOUT_MS, fallback } = opts;
  let attempt = 0;
  while (true) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (!res.ok && retryOnStatuses.includes(res.status) && attempt < retries) {
        attempt += 1;
        await sleep(baseDelayMs * 2 ** (attempt - 1));
        continue;
      }
      return await safeParseResponse(res, fallback);
    } catch (err) {
      if (attempt < retries) {
        attempt += 1;
        await sleep(baseDelayMs * 2 ** (attempt - 1));
        continue;
      }
      const message = err instanceof Error ? err.message : 'Network error';
      return { success: false, error: message } as unknown as T;
    }
  }
}
