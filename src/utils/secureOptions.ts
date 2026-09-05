import * as SecureStore from 'expo-secure-store';

/**
 * Standard SecureStore options ensuring keychain items are only accessible
 * when the device is unlocked and cannot be backed up to unencrypted device images.
 */
export const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
