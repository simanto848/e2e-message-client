/**
 * Secure Store persistence for Duress PIN and Decoy Vault configuration.
 * Kept in OS-backed SecureStore so it is never exposed in plaintext files.
 *
 * Brute-force counter is ALSO persisted in SecureStore (not just in-memory
 * React state) so killing/restarting the app does not reset the throttle.
 * See getDuressFailedAttempts/recordFailedDuressAttempt below.
 *
 * EXPONENTIAL BACKOFF NOTE: recordFailedDuressAttempt() maps consecutive
 * failures n -> backoffSeconds = min(300, 2^(n-1)) (1s, 2s, 4s, 8s, ... capped
 * at 5 min) plus a persisted lockout-until timestamp. Callers should refuse
 * PIN verification while getDuressLockoutRemainingSeconds() > 0 and surface
 * the remaining cooldown. Backoff state survives restarts because it lives in
 * SecureStore; clear it only on successful unlock (clearDuressFailedAttempts).
 * Future: add device-level wipe-after-N (e.g. 10) behind an explicit user opt-in.
 */
import * as SecureStore from 'expo-secure-store';
import { getPrimaryPin } from './keyStore';
import { SECURE_STORE_OPTIONS } from './secureOptions';

const DURESS_PIN_KEY = 'jaby_duress_pin';
const DURESS_ACTION_KEY = 'jaby_duress_action';
const DURESS_ATTEMPTS_KEY = 'jaby_duress_attempts';
const DURESS_LOCKOUT_UNTIL_KEY = 'jaby_duress_lockout_until';

const MAX_BACKOFF_SECONDS = 300; // 5 min cap

export type DuressAction = 'decoy' | 'wipe';

export async function getDuressPin(): Promise<string | null> {
  return SecureStore.getItemAsync(DURESS_PIN_KEY, SECURE_STORE_OPTIONS);
}

/**
 * Minimum 4 chars enforced; 6+ chars strongly recommended (a 4-digit numeric
 * PIN has only 10k combinations and falls fast to an opportunistic brute
 * force — the persisted backoff above slows but does not stop it).
 */
export async function setDuressPin(pin: string): Promise<{ success: boolean; error?: string }> {
  const trimmed = pin.trim();
  if (!trimmed || trimmed.length < 4) {
    return { success: false, error: 'Duress PIN must be at least 4 characters (6+ recommended).' };
  }
  const primaryPin = await getPrimaryPin();
  if (primaryPin && trimmed === primaryPin) {
    return { success: false, error: 'Duress PIN cannot be identical to your primary passcode.' };
  }
  await SecureStore.setItemAsync(DURESS_PIN_KEY, trimmed, SECURE_STORE_OPTIONS);
  return { success: true };
}

export async function clearDuressPin(): Promise<void> {
  await SecureStore.deleteItemAsync(DURESS_PIN_KEY, SECURE_STORE_OPTIONS);
}

export async function getDuressAction(): Promise<DuressAction> {
  const action = await SecureStore.getItemAsync(DURESS_ACTION_KEY, SECURE_STORE_OPTIONS);
  return (action as DuressAction) || 'decoy';
}

export async function setDuressAction(action: DuressAction): Promise<void> {
  await SecureStore.setItemAsync(DURESS_ACTION_KEY, action, SECURE_STORE_OPTIONS);
}

export async function clearDuressConfig(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(DURESS_PIN_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(DURESS_ACTION_KEY, SECURE_STORE_OPTIONS),
  ]);
}

/** Persisted consecutive-failure count (survives app restarts). */
export async function getDuressFailedAttempts(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(DURESS_ATTEMPTS_KEY, SECURE_STORE_OPTIONS);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Seconds remaining on the persisted lockout, 0 when unlocked. */
export async function getDuressLockoutRemainingSeconds(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(DURESS_LOCKOUT_UNTIL_KEY, SECURE_STORE_OPTIONS);
    if (!raw) return 0;
    const until = parseInt(raw, 10);
    if (!Number.isFinite(until)) return 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  } catch {
    return 0;
  }
}

function backoffForAttempts(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(MAX_BACKOFF_SECONDS, Math.pow(2, attempts - 1));
}

/**
 * Record one failed PIN attempt: increments the SecureStore counter and sets
 * a lockout-until timestamp per exponential backoff. Returns the new count
 * and the backoff that now applies.
 */
export async function recordFailedDuressAttempt(): Promise<{ attempts: number; backoffSeconds: number }> {
  const attempts = (await getDuressFailedAttempts()) + 1;
  const backoffSeconds = backoffForAttempts(attempts);
  try {
    await Promise.all([
      SecureStore.setItemAsync(DURESS_ATTEMPTS_KEY, String(attempts), SECURE_STORE_OPTIONS),
      SecureStore.setItemAsync(
        DURESS_LOCKOUT_UNTIL_KEY,
        String(Date.now() + backoffSeconds * 1000),
        SECURE_STORE_OPTIONS
      ),
    ]);
  } catch {}
  return { attempts, backoffSeconds };
}

/** Reset the persisted throttle after a successful unlock. */
export async function clearDuressFailedAttempts(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(DURESS_ATTEMPTS_KEY, SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(DURESS_LOCKOUT_UNTIL_KEY, SECURE_STORE_OPTIONS),
    ]);
  } catch {}
}
