/**
 * Pure secretbox envelope for at-rest cache blobs. Key management lives in
 * cacheCrypto.ts.
 *
 * Base64 deduplication note: ./base64.ts is the single source of truth for
 * bytesToBase64/base64ToBytes (crypto.ts re-exports it). The old duplicate B64_CHARS loops lived here
 * and in crypto.ts and could drift; they are removed. This module re-exports
 * the canonical helpers under the legacy names (bytesToB64/b64ToBytes) so
 * existing imports and unit tests keep working. Behavior is preserved:
 * base64ToBytes stays whitespace-tolerant (strips anything outside the base64
 * alphabet). hexToBytes strictness lives in crypto.ts (rejects non-hex).
 */
import nacl from 'tweetnacl';
import { bytesToBase64, base64ToBytes } from './base64';
// Re-export canonical helpers (legacy names + canonical names) so existing
// imports keep working whether they use crypto.ts or cacheEnvelope.ts paths.
export { bytesToBase64, base64ToBytes } from './base64';

export const CACHE_ENVELOPE_PREFIX = 'v1:';

// Legacy aliases — do not reimplement. Canonical impl is ./base64.ts.
export const bytesToB64: typeof bytesToBase64 = bytesToBase64;
export const b64ToBytes: typeof base64ToBytes = base64ToBytes;

/** Seal a UTF-8 string under a base64 32-byte key. Throws on bad key. */
export function seal(plaintext: string, keyB64: string): string {
  const key = base64ToBytes(keyB64);
  if (key.length !== nacl.secretbox.keyLength) {
    throw new Error('cacheEnvelope.seal: invalid key length');
  }
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, key);
  const packed = new Uint8Array(nonce.length + box.length);
  packed.set(nonce, 0);
  packed.set(box, nonce.length);
  return CACHE_ENVELOPE_PREFIX + bytesToBase64(packed);
}

/** Open a `v1:` envelope. Null on tamper/wrong key/malformed. */
export function openEnvelope(blob: string, keyB64: string): string | null {
  try {
    if (!blob.startsWith(CACHE_ENVELOPE_PREFIX)) return null;
    const key = base64ToBytes(keyB64);
    if (key.length !== nacl.secretbox.keyLength) return null;
    const packed = base64ToBytes(blob.slice(CACHE_ENVELOPE_PREFIX.length));
    if (packed.length < nacl.secretbox.nonceLength + nacl.secretbox.overheadLength) return null;
    const nonce = packed.slice(0, nacl.secretbox.nonceLength);
    const box = packed.slice(nacl.secretbox.nonceLength);
    const opened = nacl.secretbox.open(box, nonce, key);
    return opened ? new TextDecoder().decode(opened) : null;
  } catch {
    return null;
  }
}

export function isEncryptedEnvelope(raw: string): boolean {
  return raw.startsWith(CACHE_ENVELOPE_PREFIX);
}
