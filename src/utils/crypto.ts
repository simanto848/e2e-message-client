/**
 * Cryptography Engine for React Native (Android / Cross-Platform)
 *
 * Real X25519 (Curve25519 ECDH) key exchange + XSalsa20-Poly1305 authenticated
 * encryption via tweetnacl, replacing the previous scheme where the "key" was
 * derived only from the two users' public IDs (i.e. no secrecy at all) and the
 * "cipher" was a repeating-keystream XOR with a hash standing in for a MAC.
 *
 * What changed and why it matters:
 *  - Keys now come from an actual keypair generated on-device (generateIdentityKeyPair).
 *    The private half never leaves the device and is never sent to the server.
 *  - Message encryption uses nacl.box: a real Diffie-Hellman shared secret
 *    between the sender's private key and the receiver's public key, then
 *    authenticated encryption over that shared secret. Only someone holding
 *    one of the two matching private keys can decrypt or forge a valid message.
 *  - Tampering is now actually detected: nacl.box.open returns null (and we
 *    surface that as a decryption failure) if the ciphertext or nonce was
 *    modified in transit, because the Poly1305 tag won't verify.
 *  - Safety numbers and call SAS words are derived from the real public keys
 *    / real ECDH shared secret, not from public user IDs, so they can
 *    actually detect a MITM (a MITM would need the real private keys to
 *    produce matching values).
 */
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { EncryptedPayload } from '../types';

// tweetnacl requires a cryptographically secure random source and refuses to
// run without one configured. React Native doesn't provide Web Crypto's
// `crypto.getRandomValues` by default, so we wire tweetnacl's PRNG hook to
// expo-crypto's synchronous, OS-backed secure random bytes.
nacl.setPRNG((buf: Uint8Array, len: number) => {
  const random = Crypto.getRandomBytes(len);
  for (let i = 0; i < len; i++) buf[i] = random[i];
});

// ---------------------------------------------------------------------------
// Encoding helpers (pure encoding, not security-relevant on their own)
// ---------------------------------------------------------------------------

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(Math.floor(cleanHex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : NaN;
    const b3 = i < bytes.length ? bytes[i++] : NaN;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    let enc3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    let enc4 = isNaN(b3) ? 64 : b3 & 63;

    if (isNaN(b2)) {
      enc3 = 64;
      enc4 = 64;
    } else if (isNaN(b3)) {
      enc4 = 64;
    }

    output += B64_CHARS.charAt(enc1) + B64_CHARS.charAt(enc2) + B64_CHARS.charAt(enc3) + B64_CHARS.charAt(enc4);
  }
  return output;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  let i = 0;
  while (i < clean.length) {
    const enc1 = B64_CHARS.indexOf(clean.charAt(i++));
    const enc2 = B64_CHARS.indexOf(clean.charAt(i++));
    const enc3 = B64_CHARS.indexOf(clean.charAt(i++));
    const enc4 = B64_CHARS.indexOf(clean.charAt(i++));

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    bytes.push(chr1);
    if (enc3 !== 64 && !isNaN(enc3)) bytes.push(chr2);
    if (enc4 !== 64 && !isNaN(enc4)) bytes.push(chr3);
  }
  return new Uint8Array(bytes);
}

// SHA-256 hash using expo-crypto (used only for non-secret fingerprint display, never as a key)
export async function sha256Hash(input: string): Promise<string> {
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

// ---------------------------------------------------------------------------
// Identity keys
// ---------------------------------------------------------------------------

export interface IdentityKeyPair {
  /** Base64 X25519 public key — safe to publish/send to the server. */
  publicKey: string;
  /** Base64 X25519 secret key — NEVER send to the server or log this. */
  secretKey: string;
}

/** Generate a fresh, real X25519 identity keypair for this device. */
export function generateIdentityKeyPair(): IdentityKeyPair {
  const pair = nacl.box.keyPair();
  return {
    publicKey: bytesToBase64(pair.publicKey),
    secretKey: bytesToBase64(pair.secretKey),
  };
}

// ---------------------------------------------------------------------------
// Safety numbers / fingerprints — derived from real key material
// ---------------------------------------------------------------------------

/** 60-digit safety number (12 blocks of 5) derived from both parties' real public keys. */
export async function generateSafetyNumbers(publicKeyA: string, publicKeyB: string): Promise<string> {
  const combined = [publicKeyA, publicKeyB].sort().join('::JABY_SAFETY_NUMBER::');
  const hex = await sha256Hash(combined);

  let digits = '';
  for (let i = 0; i < hex.length && digits.length < 60; i += 2) {
    const val = parseInt(hex.substring(i, i + 2), 16);
    digits += (val % 10).toString();
  }
  while (digits.length < 60) {
    digits += ((digits.charCodeAt(digits.length - 1) * 7) % 10).toString();
  }

  const chunks: string[] = [];
  for (let i = 0; i < 60; i += 5) {
    chunks.push(digits.substring(i, i + 5));
  }
  return chunks.join(' ');
}

/** Short fingerprint of a single public key, for display in the UI. */
export async function computeFingerprint(publicKey: string): Promise<string> {
  const hex = await sha256Hash(publicKey);
  return `${hex.substring(0, 4)} · ${hex.substring(4, 8)} · ${hex.substring(8, 12)} · ${hex.substring(12, 16)}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Message encryption — real ECDH (X25519) + authenticated encryption (nacl.box)
// ---------------------------------------------------------------------------

/**
 * Encrypt a message for a specific recipient using real public-key crypto:
 * nacl.box performs an X25519 Diffie-Hellman between mySecretKey and
 * theirPublicKey to derive a shared secret, then encrypts+authenticates the
 * plaintext with XSalsa20-Poly1305 under that secret. Only the intended
 * recipient (holder of the matching private key) can decrypt it, and any
 * tampering is detected on decrypt.
 */
export function encryptMessage(
  plaintext: string,
  mySecretKeyBase64: string,
  theirPublicKeyBase64: string,
  myPublicKeyBase64: string
): EncryptedPayload {
  const nonce = Crypto.getRandomBytes(nacl.box.nonceLength); // 24 random bytes, unique per message
  const messageBytes = new TextEncoder().encode(plaintext);
  const mySecretKey = base64ToBytes(mySecretKeyBase64);
  const theirPublicKey = base64ToBytes(theirPublicKeyBase64);

  if (mySecretKey.length !== 32 || theirPublicKey.length !== 32) {
    throw new Error(`Invalid key size for encryption: secretKey=${mySecretKey.length} bytes, publicKey=${theirPublicKey.length} bytes (expected 32 bytes)`);
  }

  // nacl.box's output is (Poly1305 tag [16 bytes] || ciphertext).
  const boxed = nacl.box(messageBytes, nonce, theirPublicKey, mySecretKey);
  const authTagBytes = boxed.slice(0, nacl.secretbox.overheadLength);

  return {
    iv: bytesToBase64(nonce),
    // Store the full boxed output — decrypt() below expects this exact shape.
    ciphertext: bytesToBase64(boxed),
    // Also surface the tag separately for the Cipher Inspector UI; decrypt
    // never relies on this field, only on `ciphertext`.
    authTag: bytesToBase64(authTagBytes),
    algorithm: 'X25519-XSalsa20-Poly1305',
    senderPublicKey: myPublicKeyBase64,
    keyFingerprint: bytesToHex(nonce).slice(0, 16).toUpperCase(),
  };
}

/**
 * Decrypt a message payload. Returns null if authentication fails (tampered
 * ciphertext, wrong keys, or corrupted data) — callers must treat null as
 * "do not trust this content", not paper over it with an empty string.
 */
export function decryptMessage(
  payload: EncryptedPayload,
  mySecretKeyBase64: string,
  theirPublicKeyBase64: string
): string | null {
  try {
    if (!payload?.ciphertext || !payload?.iv || !mySecretKeyBase64 || !theirPublicKeyBase64) return null;
    const nonce = base64ToBytes(payload.iv);
    const boxed = base64ToBytes(payload.ciphertext);
    const mySecretKey = base64ToBytes(mySecretKeyBase64);
    const theirPublicKey = base64ToBytes(theirPublicKeyBase64);

    if (mySecretKey.length !== 32 || theirPublicKey.length !== 32 || nonce.length !== 24) {
      // Invalid key/nonce lengths — return null safely without throwing uncaught exceptions
      return null;
    }

    const opened = nacl.box.open(boxed, nonce, theirPublicKey, mySecretKey);
    if (!opened) return null; // authentication failed — do not display as if it were valid

    return new TextDecoder().decode(opened);
  } catch (err) {
    console.warn('Decryption error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// SAS (Short Authentication String) words for call verification
// ---------------------------------------------------------------------------

const SAS_DICTIONARY = [
  'Atlas', 'Beacon', 'Cipher', 'Delta', 'Echo', 'Falcon', 'Guardian', 'Haven',
  'Iron', 'Jasper', 'Krypton', 'Lumen', 'Matrix', 'Nexus', 'Obsidian', 'Prism',
  'Quantum', 'Rune', 'Shield', 'Titan', 'Umbra', 'Vector', 'Warden', 'Zenith',
  'Apex', 'Boreal', 'Cobalt', 'Dune', 'Ember', 'Frost', 'Glacier', 'Hydra',
  'Iris', 'Jade', 'Kodiak', 'Lotus', 'Mirage', 'Nova', 'Onyx', 'Paladin',
  'Quasar', 'Radiant', 'Starlight', 'Triton', 'Ultramarine', 'Valkyrie', 'Zephyr'
];

/**
 * Derive 4 SAS verification words from a REAL shared secret (the X25519 ECDH
 * output between the two callers' identity keys), not from public user IDs —
 * a MITM without the real private keys cannot reproduce matching words.
 *
 * This is still an identity-key-based SAS, not a per-call DTLS/SRTP fingerprint
 * SAS (that requires the WebRTC call to be established first — see
 * mobile/src/utils/webrtcCall.ts). It's a meaningful improvement over the old
 * "hash of public IDs" scheme and works before a call connects, but the
 * strongest version of this check binds to the actual live media session —
 * wire that in once WebRTC calling is confirmed stable.
 */
export async function generateCallSasWords(
  mySecretKeyBase64: string,
  theirPublicKeyBase64: string,
  callTimestamp: number
): Promise<string[]> {
  const mySecretKey = base64ToBytes(mySecretKeyBase64);
  const theirPublicKey = base64ToBytes(theirPublicKeyBase64);
  const sharedSecret = nacl.box.before(theirPublicKey, mySecretKey); // real ECDH shared secret

  const seed = `${bytesToHex(sharedSecret)}:${Math.floor(callTimestamp / 60000)}`;
  const hex = await sha256Hash(seed);
  const bytes = hexToBytes(hex);

  const words: string[] = [];
  for (let i = 0; i < 4; i++) {
    const idx = (bytes[i * 2] * 256 + bytes[i * 2 + 1]) % SAS_DICTIONARY.length;
    words.push(SAS_DICTIONARY[idx]);
  }
  return words;
}
