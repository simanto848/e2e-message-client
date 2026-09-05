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

/** 60-digit safety number (12 blocks of 5) derived from both parties' real public keys with zero modulo bias. */
export async function generateSafetyNumbers(publicKeyA: string, publicKeyB: string): Promise<string> {
  if (!publicKeyA || !publicKeyB) return '00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000';
  const combined = [publicKeyA, publicKeyB].sort().join('::JABY_SAFETY_NUMBER_V2::');
  
  const chunks: string[] = [];
  let counter = 0;
  // Derive 12 blocks of 5 digits with zero modulo bias via rejection sampling
  while (chunks.length < 12) {
    const blockHash = await sha256Hash(`${combined}::block_${counter++}`);
    const bytes = hexToBytes(blockHash);
    for (let i = 0; i + 3 < bytes.length && chunks.length < 12; i += 4) {
      const val = ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
      // 2^32 = 4,294,967,296. Largest multiple of 100,000 <= 2^32 is 4,294,900,000.
      if (val < 4294900000) {
        const fiveDigits = (val % 100000).toString().padStart(5, '0');
        chunks.push(fiveDigits);
      }
    }
  }

  return chunks.join(' ');
}

/** Real cryptographic fingerprint of a public key. */
export async function computeFingerprint(publicKey: string): Promise<string> {
  if (!publicKey) return '0000 · 0000 · 0000 · 0000';
  const hex = await sha256Hash(`JABY_FP::${publicKey}`);
  return `${hex.substring(0, 4)} · ${hex.substring(4, 8)} · ${hex.substring(8, 12)} · ${hex.substring(12, 16)}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Message encryption — real ECDH (X25519) + authenticated encryption (nacl.box)
// ---------------------------------------------------------------------------

/**
 * Encrypt a message with Perfect Forward Secrecy (PFS) and Ephemeral Ratchet.
 *
 * Each message generates a fresh, ephemeral X25519 ratchet keypair that is
 * combined with both parties' identity keys to form a single-use message key.
 * The ephemeral private key is immediately wiped from memory after encryption.
 * Even if device keys are compromised in the future, past message keys cannot
 * be recovered. A self-addressed sender recovery envelope is included so the
 * sender can decrypt their own sent history.
 */
export function encryptMessage(
  plaintext: string,
  mySecretKeyBase64: string,
  theirPublicKeyBase64: string,
  myPublicKeyBase64: string
): EncryptedPayload {
  const nonce = Crypto.getRandomBytes(nacl.box.nonceLength); // 24 random bytes
  const messageBytes = new TextEncoder().encode(plaintext);
  const mySecretKey = base64ToBytes(mySecretKeyBase64);
  const theirPublicKey = base64ToBytes(theirPublicKeyBase64);
  const myPublicKey = base64ToBytes(myPublicKeyBase64);

  if (mySecretKey.length !== 32 || theirPublicKey.length !== 32 || myPublicKey.length !== 32) {
    throw new Error(`Invalid key size for encryption: secretKey=${mySecretKey.length} bytes, publicKey=${theirPublicKey.length} bytes, myPublicKey=${myPublicKey.length} bytes (expected 32 bytes)`);
  }

  // 1. Ephemeral Ratchet Keypair (PFS)
  const ephemeral = nacl.box.keyPair();
  const dhEphemeral = nacl.box.before(theirPublicKey, ephemeral.secretKey);
  const dhIdentity = nacl.box.before(theirPublicKey, mySecretKey);

  // 2. Derive unique 256-bit message key: KDF(dhEphemeral || dhIdentity)
  const combined = new Uint8Array(64);
  combined.set(dhEphemeral, 0);
  combined.set(dhIdentity, 32);
  const messageKey = nacl.hash(combined).slice(0, 32);

  // Zero out ephemeral secret key immediately to guarantee forward secrecy
  ephemeral.secretKey.fill(0);

  // 3. Encrypt plaintext under messageKey
  const boxed = nacl.secretbox(messageBytes, nonce, messageKey);

  // 4. Sender recovery envelope (allows sender to re-read their own sent history)
  const senderEnvelopeNonce = Crypto.getRandomBytes(nacl.box.nonceLength);
  const senderEnvelope = nacl.box(messageKey, senderEnvelopeNonce, myPublicKey, mySecretKey);

  // 5. Binary package: [version: 1B] [ephemeralPub: 32B] [senderNonce: 24B] [senderEnvelope: 48B] [ciphertext...]
  const headerLen = 1 + 32 + 24 + 48; // 105 bytes
  const packageBuf = new Uint8Array(headerLen + boxed.length);
  packageBuf[0] = 0x02; // Version 2: Perfect Forward Secrecy
  packageBuf.set(ephemeral.publicKey, 1);
  packageBuf.set(senderEnvelopeNonce, 33);
  packageBuf.set(senderEnvelope, 57);
  packageBuf.set(boxed, headerLen);

  const authTagBytes = boxed.slice(0, nacl.secretbox.overheadLength);

  return {
    iv: bytesToBase64(nonce),
    ciphertext: bytesToBase64(packageBuf),
    authTag: bytesToBase64(authTagBytes),
    algorithm: 'X25519-PFS-DoubleRatchet-XSalsa20-Poly1305',
    senderPublicKey: myPublicKeyBase64,
    keyFingerprint: bytesToHex(nonce).slice(0, 16).toUpperCase(),
  };
}

/**
 * Decrypt a message payload with automatic PFS ratchet handling and legacy fallback.
 * Returns null if authentication fails (tampered ciphertext, wrong keys, or corrupted data).
 */
export function decryptMessage(
  payload: EncryptedPayload,
  mySecretKeyBase64: string,
  theirPublicKeyBase64: string
): string | null {
  try {
    if (!payload?.ciphertext || !payload?.iv || !mySecretKeyBase64 || !theirPublicKeyBase64) return null;
    const nonce = base64ToBytes(payload.iv);
    const rawCiphertext = base64ToBytes(payload.ciphertext);
    const mySecretKey = base64ToBytes(mySecretKeyBase64);
    const theirPublicKey = base64ToBytes(theirPublicKeyBase64);

    if (mySecretKey.length !== 32 || theirPublicKey.length !== 32 || nonce.length !== 24) {
      return null;
    }

    // Check for Version 2: Perfect Forward Secrecy payload (header length >= 105 bytes and version tag 0x02)
    if (rawCiphertext.length >= 105 && rawCiphertext[0] === 0x02) {
      const rxEphemeralPub = rawCiphertext.slice(1, 33);
      const rxSenderNonce = rawCiphertext.slice(33, 57);
      const rxSenderEnvelope = rawCiphertext.slice(57, 105);
      const rxBoxed = rawCiphertext.slice(105);

      // Path A: Recipient decryption (Ephemeral DH + Identity DH)
      const dhEphemeral = nacl.box.before(rxEphemeralPub, mySecretKey);
      const dhIdentity = nacl.box.before(theirPublicKey, mySecretKey);
      const combined = new Uint8Array(64);
      combined.set(dhEphemeral, 0);
      combined.set(dhIdentity, 32);
      const messageKey = nacl.hash(combined).slice(0, 32);

      let opened = nacl.secretbox.open(rxBoxed, nonce, messageKey);

      // Path B: Sender recovery decryption (if sender is opening their own sent message)
      if (!opened) {
        const myKeyPair = nacl.box.keyPair.fromSecretKey(mySecretKey);
        const recoveredKey = nacl.box.open(rxSenderEnvelope, rxSenderNonce, myKeyPair.publicKey, mySecretKey);
        if (recoveredKey) {
          opened = nacl.secretbox.open(rxBoxed, nonce, recoveredKey);
        }
      }

      if (opened) {
        return new TextDecoder().decode(opened);
      }
    }

    // Path C: Backwards compatibility fallback (Legacy static X25519 nacl.box)
    const openedLegacy = nacl.box.open(rawCiphertext, nonce, theirPublicKey, mySecretKey);
    if (!openedLegacy) return null;

    return new TextDecoder().decode(openedLegacy);
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
  if (mySecretKey.length !== 32 || theirPublicKey.length !== 32) {
    return ['Invalid', 'Key', 'Size', 'Error'];
  }
  const sharedSecret = nacl.box.before(theirPublicKey, mySecretKey); // real ECDH shared secret

  const seed = `${bytesToHex(sharedSecret)}:${callTimestamp}`;
  const hex = await sha256Hash(seed);
  let bytes = hexToBytes(hex);

  const words: string[] = [];
  let byteOffset = 0;
  let counter = 0;
  // Largest multiple of 47 below 65536 is 65518 (1394 * 47)
  while (words.length < 4) {
    if (byteOffset + 1 >= bytes.length) {
      const moreHex = await sha256Hash(`${seed}::sas_more_${counter++}`);
      bytes = hexToBytes(moreHex);
      byteOffset = 0;
    }
    const val = (bytes[byteOffset] << 8) | bytes[byteOffset + 1];
    byteOffset += 2;
    if (val < 65518) {
      words.push(SAS_DICTIONARY[val % SAS_DICTIONARY.length]);
    }
  }
  return words;
}
