import { describe, test, expect } from 'bun:test';
import { fetchJsonWithRetry, safeParseResponse, HTTP_TIMEOUT_MS } from '../../services/http';

describe('http primitives', () => {
  test('HTTP_TIMEOUT_MS is sane (5s–30s)', () => {
    expect(HTTP_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
    expect(HTTP_TIMEOUT_MS).toBeLessThanOrEqual(30000);
  });

  test('safeParseResponse passes through JSON on success', async () => {
    const res = new Response(JSON.stringify({ success: true, contacts: [1] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const data = await safeParseResponse(res, { contacts: [] });
    expect((data as { contacts: number[] }).contacts).toEqual([1]);
  });

  test('safeParseResponse normalizes error JSON without success flag', async () => {
    const res = new Response(JSON.stringify({ error: 'boom' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
    const data = (await safeParseResponse(res, { success: false })) as { success: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('boom');
  });

  test('safeParseResponse handles non-JSON gateway errors without throwing', async () => {
    const res = new Response('<html>Bad Gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    });
    const data = (await safeParseResponse(res, { success: false })) as { success: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('502');
  });

  test('fetchJsonWithRetry returns fallback with error on unreachable host', async () => {
    const data = (await fetchJsonWithRetry('http://127.0.0.1:1/unreachable', {}, {
      retries: 1,
      baseDelayMs: 1,
      timeoutMs: 1000,
      fallback: { success: false },
    })) as { success: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(typeof data.error).toBe('string');
  });
});
