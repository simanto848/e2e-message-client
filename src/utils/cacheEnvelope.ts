/**
 * Pure secretbox envelope for at-rest cache blobs. No native imports —
 * safe to unit-test under bun. Key management lives in cacheCrypto.ts.
 */
import nacl from 'tweetnacl';

export const CACHE_ENVELOPE_PREFIX = 'v1:';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : NaN;
    const b3 = i < bytes.length ? bytes[i++] : NaN;
    const e1 = b1 >> 2;
    const e2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    let e3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    let e4 = isNaN(b3) ? 64 : b3 & 63;
    if (isNaN(b2)) {
      e3 = 64;
      e4 = 64;
    } else if (isNaN(b3)) {
      e4 = 64;
    }
    out += B64.charAt(e1) + B64.charAt(e2) + B64.charAt(e3) + B64.charAt(e4);
  }
  return out;
}

export function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  let i = 0;
  while (i < clean.length) {
    const e1 = B64.indexOf(clean.charAt(i++));
    const e2 = B64.indexOf(clean.charAt(i++));
    const e3 = B64.indexOf(clean.charAt(i++));
    const e4 = B64.indexOf(clean.charAt(i++));
    bytes.push((e1 << 2) | (e2 >> 4));
    if (e3 !== 64 && !isNaN(e3)) bytes.push(((e2 & 15) << 4) | (e3 >> 2));
    if (e4 !== 64 && !isNaN(e4)) bytes.push(((e3 & 3) << 6) | e4);
  }
  return new Uint8Array(bytes);
}

/** Seal a UTF-8 string under a base64 32-byte key. Throws on bad key. */
export function seal(plaintext: string, keyB64: string): string {
  const key = b64ToBytes(keyB64);
  if (key.length !== nacl.secretbox.keyLength) {
    throw new Error('cacheEnvelope.seal: invalid key length');
  }
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, key);
  const packed = new Uint8Array(nonce.length + box.length);
  packed.set(nonce, 0);
  packed.set(box, nonce.length);
  return CACHE_ENVELOPE_PREFIX + bytesToB64(packed);
}

/** Open a `v1:` envelope. Null on tamper/wrong key/malformed. */
export function openEnvelope(blob: string, keyB64: string): string | null {
  try {
    if (!blob.startsWith(CACHE_ENVELOPE_PREFIX)) return null;
    const key = b64ToBytes(keyB64);
    if (key.length !== nacl.secretbox.keyLength) return null;
    const packed = b64ToBytes(blob.slice(CACHE_ENVELOPE_PREFIX.length));
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
