import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { notificationService } from './notificationService';
import { socketService } from './socket';

const KEY_BACKGROUND_SYNC = '@jaby_background_sync_enabled';

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let isPolling = false;
let isSyncActive = true;

interface SyncCallbacks {
  onIncomingCall?: (callSignal: any) => void;
  onUnreadUpdate?: (data: { totalUnread: number; unreadThreads: any[] }) => void;
}

let activeCallbacks: SyncCallbacks = {};

export async function getBackgroundSyncSettings(): Promise<{
  backgroundSyncEnabled: boolean;
}> {
  try {
    const bgVal = await AsyncStorage.getItem(KEY_BACKGROUND_SYNC);
    isSyncActive = bgVal === null ? true : bgVal === 'true';
    return {
      backgroundSyncEnabled: isSyncActive,
    };
  } catch {
    return { backgroundSyncEnabled: true };
  }
}

export async function setBackgroundSyncEnabled(enabled: boolean): Promise<void> {
  isSyncActive = enabled;
  await AsyncStorage.setItem(KEY_BACKGROUND_SYNC, enabled ? 'true' : 'false').catch(() => {});
  if (!enabled && pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

export function startBackgroundSync(callbacks: SyncCallbacks): void {
  activeCallbacks = callbacks;

  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  // Dedupe by callId: poll runs every 5-15s and the server keeps a pending
  // offer until it expires/acks — without this the same incoming call would
  // re-ring + re-notify on every tick.
  const seenCallIds = new Set<string>();
  const MAX_SEEN_CALLS = 50;

  const poll = async () => {
    if (isPolling || !isSyncActive) return;
    // AppState gating: when the app is foregrounded AND the realtime socket is
    // live, signaling already arrives via socket — skip the REST poll tick to
    // save battery (socket is the source of truth; poll is the background fallback).
    if (AppState.currentState === 'active' && socketService.isConnected()) return;
    isPolling = true;
    try {
      const res = await api.pollNotifications();
      if (res.success) {
        // If there's an incoming call offer waiting
        if (res.pendingCall && res.pendingCall.signalPayload) {
          const callId = res.pendingCall.callId;
          if (callId && !seenCallIds.has(callId)) {
            seenCallIds.add(callId);
            if (seenCallIds.size > MAX_SEEN_CALLS) {
              const oldest = seenCallIds.values().next().value;
              if (oldest) seenCallIds.delete(oldest);
            }
            activeCallbacks.onIncomingCall?.(res.pendingCall.signalPayload);

            if (AppState.currentState !== 'active') {
              try {
                await notificationService.showCallNotification({
                  callId: res.pendingCall.callId,
                  callerId: res.pendingCall.senderId,
                  callerName: res.pendingCall.senderName || 'Contact',
                  callType: res.pendingCall.callType || 'audio',
                  avatarUri: res.pendingCall.senderAvatar,
                });
              } catch {}
              // Ack AFTER the call UI is shown so the server stops re-offering
              // this callId on the next tick. api.ackPendingCall takes no args
              // (server tracks the pending offer per device).
              try {
                await api.ackPendingCall();
              } catch {
                // TODO(backgroundSync): retry ack on next tick if this failed —
                // otherwise the same callId re-polls until expiry.
              }
            } else {
              // Foreground: in-app CallModal is already driven via
              // onIncomingCall above — still ack so the server clears it.
              try {
                await api.ackPendingCall();
              } catch {}
            }
          }
        }

        // If unread messages exist
        if (typeof res.totalUnread === 'number') {
          activeCallbacks.onUnreadUpdate?.({
            totalUnread: res.totalUnread,
            unreadThreads: res.unreadThreads || [],
          });

          // If outside the app, dispatch OS notification
          if (AppState.currentState !== 'active' && res.unreadThreads && res.unreadThreads.length > 0) {
            for (const thread of res.unreadThreads) {
              if (thread.unreadCount > 0) {
                notificationService.showMessageNotification({
                  senderId: thread.peerId,
                  senderName: thread.peerName || 'Encrypted Chat',
                  text: `${thread.unreadCount} new encrypted message${thread.unreadCount > 1 ? 's' : ''}`,
                  chatId: thread.peerId,
                  avatarUri: thread.peerAvatar,
                }).catch(() => {});
              }
            }
          }
        }
      }
    } catch {
      // Background network silent catch
    } finally {
      isPolling = false;
    }
  };

  // Dynamic backoff scheduling: 5s when socket is disconnected, 15s when socket is healthy and connected,
  // plus up to 2s jitter so a fleet of backgrounded devices doesn't thundering-herd the poll endpoint.
  const scheduleNext = () => {
    if (pollTimer === null) return;
    const baseMs = socketService.isConnected() ? 15000 : 5000;
    const jitterMs = Math.random() * 2000;
    const intervalMs = baseMs + jitterMs;
    pollTimer = setTimeout(async () => {
      await poll();
      scheduleNext();
    }, intervalMs);
  };

  pollTimer = setTimeout(() => {
    poll().finally(() => scheduleNext());
  }, 1000);
}

export function stopBackgroundSync(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}
