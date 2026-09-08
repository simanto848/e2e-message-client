/**
 * Structured, key-safe logger for JABY mobile.
 *
 * Goals:
 * - Single place to gate verbose logs behind __DEV__ (perf.ts only covers timings).
 * - Never leak key material / tokens / PINs / message content even if a caller passes objects.
 * - Production builds log nothing (all levels gated behind __DEV__) so redacted
 *   metadata never leaves the device via log collectors.
 */

const SENSITIVE_KEYS = new Set([
  'secretKey',
  'secretkey',
  'privatekey',
  'privateKey',
  'token',
  'session_token',
  'sessiontoken',
  'authorization',
  'passphrase',
  'backuppassphrase',
  'pincode',
  'pinCode',
  'pin',
  'password',
  'currentpassword',
  'newpassword',
  'credential',
  // Message-content keys: never log bodies/previews/ciphertext — even length
  // alone is metadata, so values are replaced with `[redacted len=N]`.
  'text',
  'body',
  'message',
  'content',
  'preview',
  'ciphertext',
]);

const REDACTED = '[REDACTED]';

function redactedWithLen(value: string): string {
  return `[redacted len=${value.length}]`;
}

function isRedactionMarker(v: unknown): boolean {
  return v === REDACTED || (typeof v === 'string' && v.startsWith('[redacted len='));
}

function redactValue(key: string, value: unknown): unknown {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
  for (const sensitive of SENSITIVE_KEYS) {
    const sNorm = sensitive.toLowerCase().replace(/[^a-z]/g, '');
    if (normalized === sNorm || normalized.includes(sNorm)) {
      // Truncate to length only — never leak the content itself.
      return typeof value === 'string' ? redactedWithLen(value) : REDACTED;
    }
  }
  // Heuristic: long base64-looking blobs tagged as keys
  if (
    typeof value === 'string' &&
    value.length >= 32 &&
    (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret'))
  ) {
    return redactedWithLen(value);
  }
  return value;
}

function sanitize(arg: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (arg === null || arg === undefined) return arg;
  if (typeof arg === 'string') {
    // Redact Bearer tokens pasted into strings
    if (/bearer\s+[A-Za-z0-9\-._~+/=]{8,}/i.test(arg)) {
      return arg.replace(/bearer\s+[A-Za-z0-9\-._~+/=]{8,}/i, 'Bearer ' + REDACTED);
    }
    return arg;
  }
  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message };
  }
  if (Array.isArray(arg)) {
    return arg.slice(0, 20).map(item => sanitize(item, depth + 1));
  }
  if (typeof arg === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
      const redacted = redactValue(k, v);
      out[k] = isRedactionMarker(redacted) ? redacted : sanitize(v, depth + 1);
    }
    return out;
  }
  return arg;
}

function isDev(): boolean {
  try {
    return typeof __DEV__ !== 'undefined' && __DEV__ === true;
  } catch {
    return false;
  }
}

function formatArgs(args: unknown[]): unknown[] {
  return args.map(a => sanitize(a));
}

export const logger = {
  debug(tag: string, ...args: unknown[]): void {
    if (isDev()) {
      // eslint-disable-next-line no-console
      console.log(`[${tag}]`, ...formatArgs(args));
    }
  },
  info(tag: string, ...args: unknown[]): void {
    if (isDev()) {
      // eslint-disable-next-line no-console
      console.log(`[${tag}]`, ...formatArgs(args));
    }
  },
  warn(tag: string, ...args: unknown[]): void {
    // Gated behind __DEV__: production ships no warn logs (avoids leaking
    // redacted-but-sensitive metadata through log collectors).
    if (!isDev()) return;
    // eslint-disable-next-line no-console
    console.warn(`[${tag}]`, ...formatArgs(args));
  },
  error(tag: string, ...args: unknown[]): void {
    // Gated behind __DEV__: production ships no error logs.
    if (!isDev()) return;
    // eslint-disable-next-line no-console
    console.error(`[${tag}]`, ...formatArgs(args));
  },
};
