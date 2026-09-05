/**
 * Secure Store persistence for Duress PIN and Decoy Vault configuration.
 * Kept in OS-backed SecureStore so it is never exposed in plaintext files.
 */
import * as SecureStore from 'expo-secure-store';
import { getPrimaryPin } from './keyStore';
import { SECURE_STORE_OPTIONS } from './secureOptions';

const DURESS_PIN_KEY = 'jaby_duress_pin';
const DURESS_ACTION_KEY = 'jaby_duress_action';

export type DuressAction = 'decoy' | 'wipe';

export async function getDuressPin(): Promise<string | null> {
  return SecureStore.getItemAsync(DURESS_PIN_KEY, SECURE_STORE_OPTIONS);
}

export async function setDuressPin(pin: string): Promise<{ success: boolean; error?: string }> {
  const trimmed = pin.trim();
  if (!trimmed || trimmed.length < 4) {
    return { success: false, error: 'Duress PIN must be at least 4 characters.' };
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
