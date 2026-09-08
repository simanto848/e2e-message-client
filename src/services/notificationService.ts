/**
 * Unified Push & In-App Notification Service
 *
 * Coordinates:
 * 1. OS-level notifications via native NotificationModule (Android) / system alerts.
 * 2. In-app heads-up notification banners when messages or calls arrive while using the app.
 * 3. Security alerts (safety number verification changes, key rotation, device link alerts).
 * 4. Plausible deniability in Decoy Mode (suppresses genuine identity information).
 */
import { NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { logger } from '../utils/logger';

const { NotificationModule } = NativeModules;

// Expo-managed fallback channels (see pushNotifications.ensureAndroidChannels).
// Used only when the custom native NotificationModule is unavailable
// (Expo Go, iOS) so notifications still surface instead of going missing.
const EXPO_CHANNELS = {
  messages: 'jaby_expo_messages',
  calls: 'jaby_expo_calls',
  security: 'jaby_expo_security',
} as const;

async function postExpoFallback(params: {
  channel: (typeof EXPO_CHANNELS)[keyof typeof EXPO_CHANNELS];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: params.title,
        body: params.body,
        data: params.data ?? {},
        ...(Platform.OS === 'android' ? { channelId: params.channel } : null),
      },
      trigger: null,
    });
  } catch {}
}

export interface InAppNotification {
  id: string;
  type: 'message' | 'call' | 'security';
  title: string;
  body: string;
  senderId?: string;
  chatId?: string;
  avatarUri?: string;
  timestamp: number;
  onPress?: () => void;
  onAction?: (action: 'accept' | 'decline' | 'view') => void;
}

type NotificationListener = (notif: InAppNotification) => void;
const inAppListeners = new Set<NotificationListener>();

let lastCallNotificationId: number | null = null;

export const notificationService = {
  /**
   * Subscribe to in-app notification toasts/banners
   */
  subscribeInApp(listener: NotificationListener): () => void {
    inAppListeners.add(listener);
    return () => inAppListeners.delete(listener);
  },

  /**
   * Check whether system notifications are enabled
   */
  async areNotificationsEnabled(): Promise<boolean> {
    if (Platform.OS === 'android' && NotificationModule?.areNotificationsEnabled) {
      try {
        return await NotificationModule.areNotificationsEnabled();
      } catch {
        return false;
      }
    }
    return true;
  },

  /**
   * Dispatch an incoming message notification
   */
  async showMessageNotification(params: {
    senderId: string;
    senderName: string;
    text: string;
    chatId: string;
    avatarUri?: string;
    showPreview?: boolean;
    isDecoyMode?: boolean;
    isAppLocked?: boolean;
    onPress?: () => void;
  }): Promise<void> {
    // Plausible deniability + lockscreen privacy: never surface real content
    // while locked or in decoy mode. Early return keeps the tray silent.
    if (params.isDecoyMode || params.isAppLocked) {
      return;
    }

    // Secure default: previews OFF unless the thread explicitly opts in.
    // Default body reveals nothing on the lockscreen (VISIBILITY_PRIVATE).
    const showPreview = params.showPreview === true;
    const title = showPreview ? params.senderName || 'Encrypted Message' : 'JABY Secure';
    const body =
      showPreview && params.text
        ? params.text.length > 80
          ? `${params.text.slice(0, 80)}…`
          : params.text
        : '🔒 New encrypted message';

    const notifId = Math.abs((params.chatId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + Date.now()) % 100000);

    // 1. Trigger Native System Notification (Expo fallback when absent)
    if (Platform.OS === 'android' && NotificationModule?.postNotification) {
      try {
        await NotificationModule.postNotification({
          id: notifId,
          channel: 'messages',
          visibility: 'private',
          title,
          body,
          chatId: params.chatId,
          peerId: params.senderId,
        });
      } catch (err) {
        logger.warn('Notifications', 'Failed to post native message notification:', err);
        await postExpoFallback({
          channel: EXPO_CHANNELS.messages,
          title,
          body,
          data: { chatId: params.chatId, senderId: params.senderId },
        });
      }
    } else {
      await postExpoFallback({
        channel: EXPO_CHANNELS.messages,
        title,
        body,
        data: { chatId: params.chatId, senderId: params.senderId },
      });
    }

    // 2. Dispatch In-App Banner Event
    const inAppItem: InAppNotification = {
      id: `msg_${Date.now()}_${notifId}`,
      type: 'message',
      title,
      body,
      senderId: params.senderId,
      chatId: params.chatId,
      avatarUri: params.avatarUri,
      timestamp: Date.now(),
      onPress: params.onPress,
    };
    inAppListeners.forEach(fn => fn(inAppItem));
  },

  /**
   * Dispatch an incoming call notification (Heads-up alert)
   */
  async showCallNotification(params: {
    callId: string;
    callerId: string;
    callerName: string;
    callType: 'audio' | 'video';
    avatarUri?: string;
    isDecoyMode?: boolean;
    isAppLocked?: boolean;
    onAccept?: () => void;
    onDecline?: () => void;
  }): Promise<void> {
    if (params.isDecoyMode || params.isAppLocked) return;

    const title = `Incoming ${params.callType === 'video' ? 'Video' : 'Voice'} Call`;
    const body = `${params.callerName} is calling you on JABY Secure…`;
    const notifId = 8888;
    lastCallNotificationId = notifId;

    if (Platform.OS === 'android' && NotificationModule?.postNotification) {
      try {
        await NotificationModule.postNotification({
          id: notifId,
          channel: 'calls',
          visibility: 'private',
          title,
          body,
          peerId: params.callerId,
          isCall: true,
        });
      } catch (err) {
        logger.warn('Notifications', 'Failed to post native call notification:', err);
        await postExpoFallback({
          channel: EXPO_CHANNELS.calls,
          title,
          body,
          data: { callId: params.callId, senderId: params.callerId },
        });
      }
    } else {
      await postExpoFallback({
        channel: EXPO_CHANNELS.calls,
        title,
        body,
        data: { callId: params.callId, senderId: params.callerId },
      });
    }

    const inAppItem: InAppNotification = {
      id: `call_${params.callId}`,
      type: 'call',
      title,
      body,
      senderId: params.callerId,
      avatarUri: params.avatarUri,
      timestamp: Date.now(),
      onAction: action => {
        if (action === 'accept') params.onAccept?.();
        if (action === 'decline') params.onDecline?.();
      },
    };
    inAppListeners.forEach(fn => fn(inAppItem));
  },

  /**
   * Dismiss the active incoming call notification
   */
  async cancelCallNotification(): Promise<void> {
    if (lastCallNotificationId !== null && Platform.OS === 'android' && NotificationModule?.cancelNotification) {
      try {
        await NotificationModule.cancelNotification(lastCallNotificationId);
      } catch {}
      lastCallNotificationId = null;
    }
  },

  /**
   * Dispatch a security warning or critical integrity alert
   */
  async showSecurityNotification(params: {
    title: string;
    message: string;
    type?: 'key_change' | 'device_linked' | 'duress' | 'verification';
    isDecoyMode?: boolean;
    onPress?: () => void;
  }): Promise<void> {
    if (params.isDecoyMode) return;
    const notifId = 9999;

    if (Platform.OS === 'android' && NotificationModule?.postNotification) {
      try {
        await NotificationModule.postNotification({
          id: notifId,
          channel: 'security',
          visibility: 'private',
          title: `🛡️ ${params.title}`,
          body: params.message,
          isSecurity: true,
        });
      } catch (err) {
        logger.warn('Notifications', 'Failed to post security notification:', err);
        await postExpoFallback({ channel: EXPO_CHANNELS.security, title: `🛡️ ${params.title}`, body: params.message });
      }
    } else {
      await postExpoFallback({ channel: EXPO_CHANNELS.security, title: `🛡️ ${params.title}`, body: params.message });
    }

    const inAppItem: InAppNotification = {
      id: `sec_${Date.now()}`,
      type: 'security',
      title: `🛡️ ${params.title}`,
      body: params.message,
      timestamp: Date.now(),
      onPress: params.onPress,
    };
    inAppListeners.forEach(fn => fn(inAppItem));
  },

  /**
   * Dismiss a single message notification (used by the disappearing-message
   * purge so an expired message leaves no tray residue).
   */
  async cancelMessageNotification(chatId: string): Promise<void> {
    try {
      if (Platform.OS === 'android' && (NotificationModule as any)?.cancelNotification) {
        // Native module tracks by numeric id; best-effort: derive the same id
        // scheme used in showMessageNotification, then fall back to Expo dismiss.
        const notifId = Math.abs(chatId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100000);
        await (NotificationModule as any).cancelNotification(notifId).catch(() => {});
      }
      await Notifications.dismissAllNotificationsAsync().catch(() => {});
    } catch {}
  },

  async cancelNotification(id: number): Promise<void> {
    try {
      if (Platform.OS === 'android' && (NotificationModule as any)?.cancelNotification) {
        await (NotificationModule as any).cancelNotification(id);
      }
    } catch {}
  },

  /**
   * Clear all displayed notifications.
   * All channels are lockscreen-private (VISIBILITY_PRIVATE): message bodies
   * default to '🔒 New encrypted message' unless a thread opts into previews.
   */
  async cancelAllNotifications(): Promise<void> {
    if (Platform.OS === 'android' && NotificationModule?.cancelAllNotifications) {
      try {
        await NotificationModule.cancelAllNotifications();
      } catch {}
    }
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch {}
  },
};
