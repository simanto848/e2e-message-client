import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { chatHeadNative } from './chatHeadNative';

const KEY_BACKGROUND_SYNC = '@jaby_background_sync_enabled';
const KEY_CHAT_HEADS = '@jaby_chat_heads_enabled';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let isSyncActive = true;
let chatHeadsActive = true;

interface SyncCallbacks {
  onIncomingCall?: (callSignal: any) => void;
  onUnreadUpdate?: (data: { totalUnread: number; unreadThreads: any[] }) => void;
}

let activeCallbacks: SyncCallbacks = {};

export async function getBackgroundSyncSettings(): Promise<{
  backgroundSyncEnabled: boolean;
  chatHeadsEnabled: boolean;
}> {
  try {
    const [bgVal, chVal] = await Promise.all([
      AsyncStorage.getItem(KEY_BACKGROUND_SYNC),
      AsyncStorage.getItem(KEY_CHAT_HEADS),
    ]);
    // Both default to true
    isSyncActive = bgVal === null ? true : bgVal === 'true';
    chatHeadsActive = chVal === null ? true : chVal === 'true';
    return {
      backgroundSyncEnabled: isSyncActive,
      chatHeadsEnabled: chatHeadsActive,
    };
  } catch {
    return { backgroundSyncEnabled: true, chatHeadsEnabled: true };
  }
}

export async function setBackgroundSyncEnabled(enabled: boolean): Promise<void> {
  isSyncActive = enabled;
  await AsyncStorage.setItem(KEY_BACKGROUND_SYNC, enabled ? 'true' : 'false').catch(() => {});
  if (!enabled && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function setChatHeadsEnabled(enabled: boolean): Promise<void> {
  chatHeadsActive = enabled;
  await AsyncStorage.setItem(KEY_CHAT_HEADS, enabled ? 'true' : 'false').catch(() => {});
}

export function startBackgroundSync(callbacks: SyncCallbacks): void {
  activeCallbacks = callbacks;

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  const poll = async () => {
    if (isPolling || !isSyncActive) return;
    isPolling = true;
    try {
      const res = await api.pollNotifications();
      if (res.success) {
        // If there's an incoming call offer waiting
        if (res.pendingCall && res.pendingCall.signalPayload) {
          activeCallbacks.onIncomingCall?.(res.pendingCall.signalPayload);
        }

        // If unread messages exist
        if (typeof res.totalUnread === 'number') {
          activeCallbacks.onUnreadUpdate?.({
            totalUnread: res.totalUnread,
            unreadThreads: res.unreadThreads || [],
          });

          // If outside the app, automatically show or update the native floating chat head over Android
          if (
            chatHeadsActive &&
            AppState.currentState !== 'active' &&
            res.unreadThreads &&
            res.unreadThreads.length > 0
          ) {
            const topThread = res.unreadThreads[0];
            chatHeadNative
              .showNativeChatHead({
                contactId: topThread.peerId,
                contactName: topThread.peerName || 'Chat',
                unreadCount: topThread.unreadCount || res.totalUnread,
              })
              .catch(() => {});
          }
        }
      }
    } catch {
      // Background network silent catch
    } finally {
      isPolling = false;
    }
  };

  // Periodic poll with dynamic backoff: 4s when socket disconnected or backgrounded, 10s when active and connected
  pollTimer = setInterval(() => {
    poll();
  }, 6000);
}

export function stopBackgroundSync(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
