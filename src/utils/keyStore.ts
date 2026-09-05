/**
 * Secure, OS-backed storage for session tokens and private key material.
 *
 * Uses expo-secure-store, which is backed by the iOS Keychain / Android
 * Keystore — NOT AsyncStorage, which is a plaintext file on disk that any
 * process with storage access (or a device backup) can read. Nothing in this
 * file should ever be mirrored into AsyncStorage.
 */
import * as SecureStore from 'expo-secure-store';
import { IdentityKeyPair } from './crypto';
import { BackupFrequency } from '../types';
import { clearDuressConfig } from './duressConfig';

const SESSION_TOKEN_KEY = 'jaby_session_token';
const CURRENT_USER_ID_KEY = 'jaby_current_user_id';
const IDENTITY_KEYPAIR_PREFIX = 'jaby_identity_keypair_';
const BACKUP_FREQUENCY_KEY = 'jaby_backup_frequency';
const BACKUP_PASSPHRASE_KEY = 'jaby_backup_passphrase';


import { SECURE_STORE_OPTIONS } from './secureOptions';
export { SECURE_STORE_OPTIONS };

// SecureStore keys are restricted to [A-Za-z0-9._-]; sanitize just in case a
// userId ever contains something outside that set.
function safeKeySuffix(userId: string): string {
  return userId.replace(/[^A-Za-z0-9._-]/g, '_');
}

export async function saveSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, SECURE_STORE_OPTIONS);
}

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY, SECURE_STORE_OPTIONS);
}

export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY, SECURE_STORE_OPTIONS);
}

export async function saveCurrentUserId(userId: string): Promise<void> {
  await registerKnownUserId(userId);
  await SecureStore.setItemAsync(CURRENT_USER_ID_KEY, userId, SECURE_STORE_OPTIONS);
}

export async function getCurrentUserId(): Promise<string | null> {
  return SecureStore.getItemAsync(CURRENT_USER_ID_KEY, SECURE_STORE_OPTIONS);
}

export async function clearCurrentUserId(): Promise<void> {
  await SecureStore.deleteItemAsync(CURRENT_USER_ID_KEY, SECURE_STORE_OPTIONS);
}

const HISTORICAL_KEYS_PREFIX = 'jaby_historical_keys_';

export async function getHistoricalKeyPairs(userId: string): Promise<IdentityKeyPair[]> {
  const raw = await SecureStore.getItemAsync(HISTORICAL_KEYS_PREFIX + safeKeySuffix(userId), SECURE_STORE_OPTIONS);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as IdentityKeyPair[];
  } catch {
    return [];
  }
}

export async function saveHistoricalKeyPair(userId: string, pair: IdentityKeyPair): Promise<void> {
  const existing = await getHistoricalKeyPairs(userId);
  if (!existing.some(k => k.publicKey === pair.publicKey)) {
    existing.push(pair);
    await SecureStore.setItemAsync(HISTORICAL_KEYS_PREFIX + safeKeySuffix(userId), JSON.stringify(existing), SECURE_STORE_OPTIONS);
  }
}

/** Store this device's real X25519 identity keypair for a given account. */
export async function saveIdentityKeyPair(userId: string, pair: IdentityKeyPair): Promise<void> {
  await registerKnownUserId(userId);
  const existing = await getIdentityKeyPair(userId);
  if (existing && existing.publicKey !== pair.publicKey) {
    // Preserve old keypair in historical keyring so past messages can still be decrypted
    await saveHistoricalKeyPair(userId, existing);
  }
  await SecureStore.setItemAsync(IDENTITY_KEYPAIR_PREFIX + safeKeySuffix(userId), JSON.stringify(pair), SECURE_STORE_OPTIONS);
}

export async function getIdentityKeyPair(userId: string): Promise<IdentityKeyPair | null> {
  const raw = await SecureStore.getItemAsync(IDENTITY_KEYPAIR_PREFIX + safeKeySuffix(userId), SECURE_STORE_OPTIONS);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IdentityKeyPair;
  } catch {
    return null;
  }
}

const PRIMARY_PIN_KEY = 'jaby_primary_pin';

export async function savePrimaryPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PRIMARY_PIN_KEY, pin, SECURE_STORE_OPTIONS);
}

export async function getPrimaryPin(): Promise<string | null> {
  return SecureStore.getItemAsync(PRIMARY_PIN_KEY, SECURE_STORE_OPTIONS);
}

export async function clearPrimaryPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PRIMARY_PIN_KEY, SECURE_STORE_OPTIONS);
}

export async function saveBackupFrequency(frequency: BackupFrequency): Promise<void> {
  await SecureStore.setItemAsync(BACKUP_FREQUENCY_KEY, frequency, SECURE_STORE_OPTIONS);
}

export async function getBackupFrequency(): Promise<BackupFrequency> {
  const val = await SecureStore.getItemAsync(BACKUP_FREQUENCY_KEY, SECURE_STORE_OPTIONS);
  if (val === 'daily' || val === 'weekly' || val === 'monthly' || val === 'off') {
    return val;
  }
  return 'daily';
}

export async function saveBackupPassphrase(passphrase: string): Promise<void> {
  await SecureStore.setItemAsync(BACKUP_PASSPHRASE_KEY, passphrase, SECURE_STORE_OPTIONS);
}

export async function getBackupPassphrase(): Promise<string | null> {
  const saved = await SecureStore.getItemAsync(BACKUP_PASSPHRASE_KEY, SECURE_STORE_OPTIONS);
  return saved || null;
}

const KNOWN_USER_IDS_KEY = 'jaby_known_user_ids';

async function getKnownUserIds(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(KNOWN_USER_IDS_KEY, SECURE_STORE_OPTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function registerKnownUserId(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const ids = await getKnownUserIds();
    if (!ids.includes(userId)) {
      ids.push(userId);
      await SecureStore.setItemAsync(KNOWN_USER_IDS_KEY, JSON.stringify(ids), SECURE_STORE_OPTIONS);
    }
  } catch {}
}

export async function clearBackupSettings(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(BACKUP_FREQUENCY_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(BACKUP_PASSPHRASE_KEY, SECURE_STORE_OPTIONS),
  ]);
}

export async function clearIdentityKeyPair(userId: string): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(IDENTITY_KEYPAIR_PREFIX + safeKeySuffix(userId), SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(HISTORICAL_KEYS_PREFIX + safeKeySuffix(userId), SECURE_STORE_OPTIONS),
  ]);
}

/**
 * Clear session tokens and auth credentials on sign out.
 * Wipes the active session and device identity keys for the user so unencrypted
 * private keys do not remain persisted across accounts.
 */
export async function clearSession(userId?: string | null): Promise<void> {
  let uid = userId;
  if (!uid) {
    try {
      uid = await getCurrentUserId();
    } catch {}
  }

  const tasks: Promise<unknown>[] = [
    clearSessionToken(),
    clearCurrentUserId(),
    clearPrimaryPin(),
  ];

  if (uid) {
    tasks.push(clearIdentityKeyPair(uid));
  }

  await Promise.allSettled(tasks);
}

/**
 * Full zeroize wipe: deletes session token, user ID, primary PIN, backup settings,
 * duress configurations, identity keypairs, and all historical keyrings across ALL known UIDs.
 */
export async function wipeAllSecureData(userId?: string | null): Promise<void> {
  let allUids: string[] = [];
  try {
    allUids = await getKnownUserIds();
  } catch {}

  if (userId && !allUids.includes(userId)) {
    allUids.push(userId);
  }

  try {
    const current = await getCurrentUserId();
    if (current && !allUids.includes(current)) {
      allUids.push(current);
    }
  } catch {}

  const tasks: Promise<unknown>[] = [
    clearSessionToken(),
    clearCurrentUserId(),
    clearPrimaryPin(),
    clearBackupSettings(),
    clearDuressConfig(),
    SecureStore.deleteItemAsync(KNOWN_USER_IDS_KEY, SECURE_STORE_OPTIONS).catch(() => {}),
  ];

  // Purge identity keypairs and historical keyrings for every account ever active on this device
  for (const uid of allUids) {
    tasks.push(clearIdentityKeyPair(uid));
  }

  await Promise.allSettled(tasks);
}

