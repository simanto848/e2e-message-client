/**
 * Secure Store persistence for Duress PIN and Decoy Vault configuration.
 * Kept in OS-backed SecureStore so it is never exposed in plaintext files.
 */
import * as SecureStore from 'expo-secure-store';

const DURESS_PIN_KEY = 'jaby_duress_pin';
const DURESS_ACTION_KEY = 'jaby_duress_action';

export type DuressAction = 'decoy' | 'wipe';

export async function getDuressPin(): Promise<string | null> {
  return SecureStore.getItemAsync(DURESS_PIN_KEY);
}

export async function setDuressPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(DURESS_PIN_KEY, pin);
}

export async function clearDuressPin(): Promise<void> {
  await SecureStore.deleteItemAsync(DURESS_PIN_KEY);
}

export async function getDuressAction(): Promise<DuressAction> {
  const action = await SecureStore.getItemAsync(DURESS_ACTION_KEY);
  return (action as DuressAction) || 'decoy';
}

export async function setDuressAction(action: DuressAction): Promise<void> {
  await SecureStore.setItemAsync(DURESS_ACTION_KEY, action);
}

export async function clearDuressConfig(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(DURESS_PIN_KEY),
    SecureStore.deleteItemAsync(DURESS_ACTION_KEY),
  ]);
}
