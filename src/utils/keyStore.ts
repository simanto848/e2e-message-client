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

const SESSION_TOKEN_KEY = 'jaby_session_token';
const CURRENT_USER_ID_KEY = 'jaby_current_user_id';
const IDENTITY_KEYPAIR_PREFIX = 'jaby_identity_keypair_';
const BACKUP_FREQUENCY_KEY = 'jaby_backup_frequency';
const BACKUP_PASSPHRASE_KEY = 'jaby_backup_passphrase';


const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

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
  if (saved) return saved;
  return getPrimaryPin();
}

export async function clearBackupSettings(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(BACKUP_FREQUENCY_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(BACKUP_PASSPHRASE_KEY, SECURE_STORE_OPTIONS),
  ]);
}

/**
 * Clear everything for a full sign-out. Identity keypairs are intentionally
 * NOT cleared here (they stay namespaced per-account on this device) — a
 * user signing out and back in on the same device should still be able to
 * decrypt their own message history.
 */
export async function clearSession(): Promise<void> {
  await Promise.all([clearSessionToken(), clearCurrentUserId(), clearPrimaryPin()]);
}

