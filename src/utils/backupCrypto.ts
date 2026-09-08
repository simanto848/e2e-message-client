/**
 * Real cloud backup encryption.
 *
 * The previous implementation uploaded the literal string
 * 'ENCRYPTED_PBKDF2_AES_GCM_BLOB_V2' with a hardcoded salt/iv regardless of
 * the passphrase the user typed — no data was ever actually backed up or
 * encrypted. This module does the real thing:
 *
 *  - PBKDF2-HMAC-SHA256 (100,000 iterations, random 16-byte salt) derives a
 *    256-bit key from the user's passphrase.
 *  - nacl.secretbox (XSalsa20-Poly1305) encrypts the backup payload under
 *    that key with a random 24-byte nonce, giving real confidentiality and
 *    tamper detection (decrypt fails closed if the blob or passphrase is wrong).
 *
 * What's actually backed up: this device's real X25519 identity private key.
 * That's the one thing that truly can't be recovered any other way — your
 * message *history* already lives durably on the server as ciphertext (see
 * server/src/database.ts), but without your private key you can never
 * decrypt any of it again after losing this device. Restoring this backup
 * installs your original key locally instead of the app minting a new one
 * (which is what silently happens today on a fresh install/login — see
 * App.tsx's key-rotation path in handleAuthenticated) and losing access to
 * everything encrypted under the old key.
 *
 * PERFORMANCE WARNING (JS thread): PBKDF2 here runs synchronously in pure JS
 * via CryptoJS on the React Native JS thread — 100,000 SHA-256 iterations can
 * block UI for seconds on lower-end Android devices (visible jank / ANR risk
 * during encrypt + decrypt). Kept as CryptoJS for now for determinism and to
 * avoid a native dependency, but this MUST move off the JS thread (see async
 * wrapper note below). Always call from a loading state with user feedback,
 * never in a render path or tight loop.
 *
 * ASYNC WRAPPER / CANCELLATION NOTE: encryptBackupAsync/decryptBackupAsync
 * below are thin shims that yield to the event loop once (so a spinner can
 * paint) and honor an optional AbortSignal — but they DO NOT move KDF work
 * off the JS thread yet. Cancellation is cooperative: checked before the
 * synchronous KDF starts, not mid-PBKDF2 (CryptoJS offers no chunked/cancel
 * hook). Future work: replace CryptoJS with a native KDF (expo-crypto async
 * digest loop, react-native-quick-crypto, or a JSI module) with chunked
 * iterations that await + check signal.aborted every N rounds.
 */
import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { bytesToBase64, base64ToBytes, IdentityKeyPair } from './crypto';

// 100,000 PBKDF2 iterations for industry-standard passphrase key stretching
const PBKDF2_ITERATIONS = 100000;
const KEY_SIZE_WORDS = 256 / 32; // 32 bytes (256-bit key)

/**
 * Single enforced minimum: passphrases must be >= 12 chars. Unifies the old
 * split (backupCrypto required 8, CloudBackupModal allowed 4). Validated
 * BEFORE any KDF work so weak input fails fast without burning seconds of JS
 * thread time. Note: decrypt() intentionally still accepts legacy shorter
 * passphrases (see below) so old backups remain restorable — only new
 * encrypts enforce the minimum.
 */
export const BACKUP_MIN_PASSPHRASE_LENGTH = 12;

function bytesToWordArray(u8arr: Uint8Array): CryptoJS.lib.WordArray {
  const len = u8arr.length;
  const words: number[] = [];
  for (let i = 0; i < len; i++) {
    words[i >>> 2] |= (u8arr[i] & 0xff) << (24 - (i % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, len);
}

function wordArrayToBytes(wordArray: CryptoJS.lib.WordArray): Uint8Array {
  const { words, sigBytes } = wordArray;
  const bytes = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    bytes[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return bytes;
}

function deriveKey(passphrase: string, saltBytes: Uint8Array, iterations = PBKDF2_ITERATIONS): Uint8Array {
  const derived = CryptoJS.PBKDF2(passphrase, bytesToWordArray(saltBytes), {
    keySize: KEY_SIZE_WORDS,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  return wordArrayToBytes(derived);
}

export interface BackupPayload {
  version: 1 | 2;
  exportedAt: number;
  identityKeyPair: IdentityKeyPair;
  historicalKeyPairs?: IdentityKeyPair[];
}

export interface EncryptedBackupBlob {
  encryptedData: string; // base64
  salt: string; // base64
  iv: string; // base64 (secretbox nonce)
}

function assertValidEncryptPassphrase(passphrase: unknown): asserts passphrase is string {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.trim().length < BACKUP_MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `Backup encryption passphrase must be at least ${BACKUP_MIN_PASSPHRASE_LENGTH} characters long`
    );
  }
}

/** Encrypt a backup payload with a passphrase-derived key. Real crypto, not a placeholder. */
export function encryptBackup(payload: BackupPayload, passphrase: string): EncryptedBackupBlob {
  // Validate BEFORE KDF: fail fast on weak input without burning JS-thread PBKDF2 time.
  assertValidEncryptPassphrase(passphrase);
  const saltBytes = Crypto.getRandomBytes(16);
  const nonceBytes = Crypto.getRandomBytes(nacl.secretbox.nonceLength);
  const key = deriveKey(passphrase, saltBytes, PBKDF2_ITERATIONS);

  const plaintextBytes = new TextEncoder().encode(JSON.stringify(payload));
  const boxed = nacl.secretbox(plaintextBytes, nonceBytes, key);

  return {
    encryptedData: bytesToBase64(boxed),
    salt: bytesToBase64(saltBytes),
    iv: bytesToBase64(nonceBytes),
  };
}

/**
 * Decrypt a backup blob. Returns null if the passphrase is wrong or the blob
 * was tampered with — callers must treat null as "cannot restore", never
 * fall back to a default/empty payload as if it succeeded.
 * Strictly enforces 100,000 PBKDF2 iterations and payload sanity bounds.
 * Validates blob shape + passphrase presence BEFORE running KDF (fail fast,
 * avoids wasted PBKDF2). Accepts legacy <12-char passphrases for migration —
 * old backups created under the weaker minimum must still restore; only new
 * encrypts enforce >= 12. For a throwing variant see decryptBackupOrThrow.
 */
export function decryptBackup(blob: EncryptedBackupBlob, passphrase: string): BackupPayload | null {
  try {
    if (!blob || !blob.encryptedData || !blob.salt || !blob.iv) return null;
    if (!passphrase || typeof passphrase !== 'string' || passphrase.length === 0) return null;
    // Bounds check to protect memory & prevent DoS (max 2MB)
    if (blob.encryptedData.length > 2 * 1024 * 1024 || blob.salt.length > 128 || blob.iv.length > 128) {
      return null;
    }

    const saltBytes = base64ToBytes(blob.salt);
    const nonceBytes = base64ToBytes(blob.iv);
    const boxed = base64ToBytes(blob.encryptedData);

    if (saltBytes.length !== 16 || nonceBytes.length !== nacl.secretbox.nonceLength) {
      return null;
    }

    const key = deriveKey(passphrase, saltBytes, PBKDF2_ITERATIONS);
    const opened = nacl.secretbox.open(boxed, nonceBytes, key);
    if (!opened) return null;

    const parsed = JSON.parse(new TextDecoder().decode(opened));
    if (!parsed || !parsed.identityKeyPair) return null;
    return parsed as BackupPayload;
  } catch {
    return null;
  }
}

/**
 * Throwing variant: same checks as decryptBackup, but a wrong passphrase /
 * tampered blob THROWS a clear Error instead of returning null. Prefer this in
 * new code so "wrong passphrase" can never be mistaken for "no backup".
 * Kept alongside the null-returning decryptBackup for backwards compatibility
 * with existing callers (App.tsx checks `if (!restored)`).
 */
export function decryptBackupOrThrow(blob: EncryptedBackupBlob, passphrase: string): BackupPayload {
  if (!blob || !blob.encryptedData || !blob.salt || !blob.iv) {
    throw new Error('backupCrypto.decryptBackup: malformed backup blob (missing fields)');
  }
  if (!passphrase || typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('backupCrypto.decryptBackup: passphrase is required');
  }
  const out = decryptBackup(blob, passphrase);
  if (!out) {
    throw new Error('backupCrypto.decryptBackup: wrong passphrase or corrupted backup (decryption failed closed)');
  }
  return out;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('backupCrypto: operation cancelled');
  }
}

/**
 * Async shims — see ASYNC WRAPPER NOTE in the header. They yield once so UI
 * can paint, honor AbortSignal cooperatively (pre-KDF only), then run the
 * same synchronous CryptoJS KDF. Not yet off-thread; replace internals with a
 * native chunked KDF when available without changing these signatures.
 */
export async function encryptBackupAsync(
  payload: BackupPayload,
  passphrase: string,
  signal?: AbortSignal
): Promise<EncryptedBackupBlob> {
  throwIfAborted(signal);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  throwIfAborted(signal);
  return encryptBackup(payload, passphrase);
}

export async function decryptBackupAsync(
  blob: EncryptedBackupBlob,
  passphrase: string,
  signal?: AbortSignal
): Promise<BackupPayload | null> {
  throwIfAborted(signal);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  throwIfAborted(signal);
  return decryptBackup(blob, passphrase);
}

export async function decryptBackupOrThrowAsync(
  blob: EncryptedBackupBlob,
  passphrase: string,
  signal?: AbortSignal
): Promise<BackupPayload> {
  throwIfAborted(signal);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  throwIfAborted(signal);
  return decryptBackupOrThrow(blob, passphrase);
}
