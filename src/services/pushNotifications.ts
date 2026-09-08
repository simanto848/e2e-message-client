/**
 * Expo push/local notification scaffolding.
 *
 * Today the app polls (`api.pollNotifications`) and posts OS notifications
 * through a custom native NotificationModule (dev-build only — absent in
 * Expo Go). This module adds the Expo-notifications layer alongside it:
 *
 * - Android channels mirroring the native ones (messages/calls/security).
 * - Permission-aware Expo push-token registration (physical device only,
 *   never prompts without user action — callers check status first).
 * - Token persisted in SecureStore + uploaded to POST
 *   /api/backup/devices/push-token {expoPushToken, platform} (requireAuth).
 *   Server stores per LinkedDevice and fans out via Expo Push API with only
 *   {chatId, senderId} (never plaintext).
 * - Sounds stay local-first: notificationService plays bundled sounds as a
 *   fallback when push is unavailable/silent — push never carries audio.
 * - Immediate local notifications as a fallback when NotificationModule
 *   is unavailable (Expo Go) — wired in notificationService.ts.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { SECURE_STORE_OPTIONS } from '../utils/secureOptions';
import { logger } from '../utils/logger';

const PUSH_TOKEN_KEY = 'jaby_push_token';

// Push-token upload lives in registerPushToken below (POST /api/backup/devices/push-token).

export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('jaby_expo_messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    // PRIVATE (never PUBLIC): lockscreen shows generic label, never caller identity.
    await Notifications.setNotificationChannelAsync('jaby_expo_calls', {
      name: 'Calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 500, 500],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    // SECRET mirrors native NotificationModule: safety alerts hidden on lockscreen.
    await Notifications.setNotificationChannelAsync('jaby_expo_security', {
      name: 'Security alerts',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET,
    });
  } catch (err) {
    logger.warn('Push', 'ensureAndroidChannels failed:', err);
  }
}

export function configureForegroundHandler(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (err) {
    logger.warn('Push', 'configureForegroundHandler failed:', err);
  }
}

/** Never prompts — returns current permission status only. */
export async function getPushPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/**
 * Best-effort Expo push-token registration. Resolves null (never throws)
 * on simulators, denied permissions, or missing project config.
 */
export async function registerPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      logger.info('Push', 'skipping registration: not a physical device');
      return null;
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing !== 'granted') {
      logger.info('Push', 'skipping registration: permission not granted');
      return null;
    }
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    const token = projectId
      ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
      : (await Notifications.getDevicePushTokenAsync()).data;
    if (token) {
      await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token, SECURE_STORE_OPTIONS).catch(() => {});
      // Best-effort server upload (never throws — poll + local sounds remain
      // the fallback). Dynamic import avoids a hard api<->push cycle.
      try {
        const { api } = await import('./api');
        const { Platform: RNPlatform } = await import('react-native');
        const platform = RNPlatform.OS === 'ios' ? ('ios' as const) : ('android' as const);
        const res = await api.uploadPushToken({ expoPushToken: token, platform });
        if (!res?.success) logger.warn('Push', 'push-token upload rejected:', res?.error);
      } catch (uploadErr) {
        logger.warn('Push', 'push-token upload failed (local token kept):', uploadErr);
      }
    }
    return token;
  } catch (err) {
    logger.warn('Push', 'registerPushToken failed:', err);
    return null;
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PUSH_TOKEN_KEY, SECURE_STORE_OPTIONS);
  } catch {
    return null;
  }
}

/** Foreground notification tap → route to a chat. Returns unsubscribe. */
export function addPushResponseListener(onOpenChat: (chatId: string) => void): () => void {
  try {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const chatId = response.notification.request.content.data?.chatId;
      if (typeof chatId === 'string' && chatId) onOpenChat(chatId);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
