/**
 * At-rest encryption for the offline AsyncStorage cache.
 *
 * Context: messageCache.ts stores message *ciphertext*, but the surrounding
 * JSON is plaintext — participant names/handles, chat IDs, timestamps, and
 * the cached profile are readable from a device backup or disk dump. This
 * module wraps those blobs in a device-local secretbox layer:
 *
 * - One random 256-bit cache key per user, held in SecureStore (Keychain /
 *   Keystore, WHEN_UNLOCKED_THIS_DEVICE_ONLY) and mirrored in memory.
 * - Envelope crypto lives in cacheEnvelope.ts (pure, unit-tested).
 * - Reads accept legacy plaintext JSON (no prefix) and pass it through so
 *   existing installs migrate lazily on the next write.
 *
 * Metadata protection, not a second E2EE layer: anyone holding the identity
 * private key can already read message content. It raises offline forensics
 * from "open a JSON file" to "break the Keychain".
 */
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import { seal, openEnvelope, isEncryptedEnvelope, bytesToB64 } from './cacheEnvelope';
import { SECURE_STORE_OPTIONS } from './secureOptions';
import { logger } from './logger';

const CACHE_KEY_PREFIX = 'jaby_cache_key_';

const keyCache = new Map<string, string>();

function safeSuffix(userId: string): string {
  return userId.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Get-or-create the per-user device cache key (base64). */
export async function getCacheKey(uid: string): Promise<string | null> {
  const cached = keyCache.get(uid);
  if (cached) return cached;
  try {
    const storeKey = CACHE_KEY_PREFIX + safeSuffix(uid);
    const existing = await SecureStore.getItemAsync(storeKey, SECURE_STORE_OPTIONS);
    if (existing) {
      keyCache.set(uid, existing);
      return existing;
    }
    const fresh = bytesToB64(nacl.randomBytes(nacl.secretbox.keyLength));
    await SecureStore.setItemAsync(storeKey, fresh, SECURE_STORE_OPTIONS);
    keyCache.set(uid, fresh);
    return fresh;
  } catch (err) {
    logger.warn('CacheCrypto', 'getCacheKey failed, caching disabled for session:', err);
    return null;
  }
}

/** Encrypt for storage. Falls back to plaintext on key failure (never lose data). */
export async function sealForUser(uid: string, plaintext: string): Promise<string> {
  const key = await getCacheKey(uid);
  if (!key) return plaintext;
  try {
    return seal(plaintext, key);
  } catch (err) {
    logger.warn('CacheCrypto', 'seal failed, storing plaintext:', err);
    return plaintext;
  }
}

/**
 * Decrypt a stored blob. Legacy plaintext passes through (lazy migration).
 * Returns null only when input is null/empty or decryption fails.
 */
export async function openForUser(uid: string, raw: string | null): Promise<string | null> {
  if (!raw) return null;
  if (!isEncryptedEnvelope(raw)) return raw;
  const key = await getCacheKey(uid);
  if (!key) return null;
  const opened = openEnvelope(raw, key);
  if (opened === null) {
    logger.warn('CacheCrypto', 'envelope failed to open (wrong key or tamper)');
  }
  return opened;
}

/** Drop the device cache key (sign-out / emergency wipe). */
export async function clearCacheKey(uid: string): Promise<void> {
  keyCache.delete(uid);
  try {
    await SecureStore.deleteItemAsync(CACHE_KEY_PREFIX + safeSuffix(uid), SECURE_STORE_OPTIONS);
  } catch {}
}
