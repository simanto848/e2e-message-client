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
 *
 * FAIL-CLOSED (hardened): sealForUser THROWS on key failure instead of
 * returning plaintext, and openForUser returns null for any non-v1 blob
 * instead of passing legacy plaintext through. Callers (messageCache,
 * outboxStore) already treat throw/null as "skip write / cache miss", so a
 * broken Keychain degrades to refetch-from-server, never to plaintext on disk.
 *
 * MIGRATION NOTE (legacy plaintext blobs, pre-v1 installs):
 * Older installs may still hold bare JSON blobs in AsyncStorage (no `v1:`
 * prefix). Do NOT silently accept them here — that reintroduces the exact
 * disk-forensics hole this layer closes. One-time migration must be explicit
 * at the call site, e.g.:
 *
 *   import { isLegacyPlaintextBlob } from './cacheCrypto';
 *   const raw = await AsyncStorage.getItem(key);
 *   if (isLegacyPlaintextBlob(raw)) {
 *     // Optional: validate shape, then re-save via sealForUser() so the next
 *     // write is sealed, then delete or overwrite the legacy entry.
 *     // Never log or transmit the plaintext during migration.
 *   }
 *
 * After the migration window, legacy entries fail closed (null) and are
 * naturally replaced by fresh sealed writes.
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

/**
 * Encrypt for storage. FAIL-CLOSED: throws on key failure or seal failure —
 * never returns plaintext. Callers must treat a throw as "skip this write"
 * (cache miss on next read, refetch from server).
 */
export async function sealForUser(uid: string, plaintext: string): Promise<string> {
  const key = await getCacheKey(uid);
  if (!key) {
    logger.warn('CacheCrypto', 'sealForUser: no cache key, refusing plaintext write (fail-closed)');
    throw new Error('cacheCrypto.sealForUser: cache key unavailable, refusing to store plaintext');
  }
  try {
    return seal(plaintext, key);
  } catch (err) {
    logger.warn('CacheCrypto', 'seal failed (fail-closed, not storing plaintext):', err);
    throw err instanceof Error ? err : new Error('cacheCrypto.sealForUser: seal failed');
  }
}

/** True for pre-v1 bare-JSON blobs. Helper for explicit one-time migration only. */
export function isLegacyPlaintextBlob(raw: string | null): boolean {
  if (!raw) return false;
  return !isEncryptedEnvelope(raw);
}

/**
 * Decrypt a stored blob. FAIL-CLOSED: any non-v1 blob returns null (no legacy
 * plaintext passthrough) plus a warn log; decryption failure also returns null.
 * Callers treat null as cache miss. See MIGRATION NOTE above for the explicit
 * opt-in path for pre-v1 installs.
 */
export async function openForUser(uid: string, raw: string | null): Promise<string | null> {
  if (!raw) return null;
  if (!isEncryptedEnvelope(raw)) {
    logger.warn('CacheCrypto', 'rejecting non-v1 blob (fail-closed, no plaintext passthrough)');
    return null;
  }
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
