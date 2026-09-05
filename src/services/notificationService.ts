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

const { NotificationModule } = NativeModules;

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
    onPress?: () => void;
  }): Promise<void> {
    if (params.isDecoyMode) {
      // In Decoy Mode, do not display real sender names or private message previews
      return;
    }

    const title = params.senderName || 'Encrypted Message';
    const body = params.showPreview !== false && params.text
      ? (params.text.length > 80 ? `${params.text.slice(0, 80)}…` : params.text)
      : '🔒 New encrypted message';

    const notifId = Math.abs((params.chatId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + Date.now()) % 100000);

    // 1. Trigger Native System Notification
    if (Platform.OS === 'android' && NotificationModule?.postNotification) {
      try {
        await NotificationModule.postNotification({
          id: notifId,
          channel: 'messages',
          title,
          body,
          chatId: params.chatId,
          peerId: params.senderId,
        });
      } catch (err) {
        console.warn('[NotificationService] Failed to post native message notification:', err);
      }
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
    onAccept?: () => void;
    onDecline?: () => void;
  }): Promise<void> {
    if (params.isDecoyMode) return;

    const title = `Incoming ${params.callType === 'video' ? 'Video' : 'Voice'} Call`;
    const body = `${params.callerName} is calling you on JABY Secure…`;
    const notifId = 8888;
    lastCallNotificationId = notifId;

    if (Platform.OS === 'android' && NotificationModule?.postNotification) {
      try {
        await NotificationModule.postNotification({
          id: notifId,
          channel: 'calls',
          title,
          body,
          peerId: params.callerId,
          isCall: true,
        });
      } catch (err) {
        console.warn('[NotificationService] Failed to post native call notification:', err);
      }
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
    onPress?: () => void;
  }): Promise<void> {
    const notifId = 9999;

    if (Platform.OS === 'android' && NotificationModule?.postNotification) {
      try {
        await NotificationModule.postNotification({
          id: notifId,
          channel: 'security',
          title: `🛡️ ${params.title}`,
          body: params.message,
          isSecurity: true,
        });
      } catch (err) {
        console.warn('[NotificationService] Failed to post security notification:', err);
      }
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
   * Clear all displayed notifications
   */
  async cancelAllNotifications(): Promise<void> {
    if (Platform.OS === 'android' && NotificationModule?.cancelAllNotifications) {
      try {
        await NotificationModule.cancelAllNotifications();
      } catch {}
    }
  },
};
