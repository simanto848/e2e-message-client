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
 * NOTE ON PERFORMANCE: 100,000 PBKDF2 iterations in pure JS (crypto-js) can
 * take a few seconds on lower-end Android devices since it runs on the JS
 * thread. If that's noticeable in testing, either lower the iteration count
 * (document the tradeoff) or move key derivation to a native module.
 */
import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { bytesToBase64, base64ToBytes, IdentityKeyPair } from './crypto';

// 100,000 PBKDF2 iterations for industry-standard passphrase key stretching
const PBKDF2_ITERATIONS = 100000;
const KEY_SIZE_WORDS = 256 / 32; // 32 bytes (256-bit key)

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

/** Encrypt a backup payload with a passphrase-derived key. Real crypto, not a placeholder. */
export function encryptBackup(payload: BackupPayload, passphrase: string): EncryptedBackupBlob {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.trim().length < 6) {
    throw new Error('Backup encryption passphrase must be at least 6 characters long');
  }
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
 * Tries 100,000 iterations first, and falls back to legacy 5,000 iterations if needed.
 */
export function decryptBackup(blob: EncryptedBackupBlob, passphrase: string): BackupPayload | null {
  try {
    const saltBytes = base64ToBytes(blob.salt);
    const nonceBytes = base64ToBytes(blob.iv);
    const boxed = base64ToBytes(blob.encryptedData);

    // Primary attempt with 100,000-iteration key
    let key = deriveKey(passphrase, saltBytes, PBKDF2_ITERATIONS);
    let opened = nacl.secretbox.open(boxed, nonceBytes, key);

    // Fallback to 5,000 iterations for legacy backups
    if (!opened) {
      key = deriveKey(passphrase, saltBytes, 5000);
      opened = nacl.secretbox.open(boxed, nonceBytes, key);
    }

    if (!opened) return null;

    const parsed = JSON.parse(new TextDecoder().decode(opened));
    if (!parsed || !parsed.identityKeyPair) return null;
    return parsed as BackupPayload;
  } catch {
    return null;
  }
}
