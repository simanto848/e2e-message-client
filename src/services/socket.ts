/**
 * Realtime Socket Client for Mobile App
 *
 * The socket now authenticates with the real session token (same one used
 * for REST calls) instead of a self-declared 'user_online' userId — the
 * server verifies it and rejects the connection otherwise. senderId is no
 * longer sent on emits that used to include it; the server derives it from
 * the authenticated socket, so a compromised/buggy client can no longer
 * pretend to be a different user.
 */
import { io, Socket } from 'socket.io-client';
import { Message, ContactRequestWithUser, UserProfile } from '../types';

import { SOCKET_SERVER_URL } from './config';
import { getSessionToken } from '../utils/keyStore';

export { SOCKET_SERVER_URL };

class SocketService {
  private socket: Socket | null = null;

  async connect() {
    if (this.socket && this.socket.connected) {
      return;
    }

    const token = await getSessionToken();
    if (!token) {
      console.warn('[Mobile Socket] No session token available — not connecting');
      return;
    }

    if (this.socket) {
      // A socket already exists but isn't connected — most likely its
      // built-in reconnection attempts ran out after a long network outage,
      // or the OS suspended networking while the app was backgrounded.
      // Resume this instance instead of calling io() again, which would
      // leave the old socket's reconnection loop running in the background
      // forever alongside a brand-new one — two live connections registered
      // for the same user server-side, so every message/call signal gets
      // delivered (and every socket listener fires) twice.
      this.socket.auth = { token };
      this.socket.connect();
      return;
    }

    this.socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      // A secure messenger should keep trying to reconnect indefinitely
      // rather than giving up after a handful of attempts and going silent
      // — a finite cap here previously meant an extended network blip (a
      // subway tunnel, a flaky hotel Wi-Fi) could leave the app permanently
      // disconnected from realtime delivery until it was force-restarted.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      auth: { token },
    });

    this.socket.on('connect', () => {
      console.log('[Mobile Socket] Connected & authenticated to JABY Gateway');
    });

    this.socket.on('connect_error', err => {
      console.warn('[Mobile Socket] Connection/auth error:', err.message);
    });

    this.socket.on('disconnect', reason => {
      console.log('[Mobile Socket] Disconnected from JABY Gateway:', reason);
    });
  }

  /**
   * Re-arm the connection after the app returns to the foreground. Mobile
   * OSes routinely suspend a backgrounded app's sockets, and the app may
   * have been backgrounded long enough that reconnection needs a fresh
   * session token (e.g. after a re-login) — this is a no-op via the
   * `this.socket.connected` guard above when the socket is already healthy.
   */
  async reconnectIfNeeded() {
    if (this.socket?.connected) return;
    await this.connect();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Contact requests are now sent/accepted purely over REST (api.ts) — the
  // server pushes the 'contact_request_received' / 'contact_request_accepted'
  // events below directly from the route handler once the database write
  // succeeds. There's no socket emit here to duplicate: the earlier version
  // called both, and the socket call always lost the race against the REST
  // call that had already made the same change, so the *other* person never
  // got notified. See server/src/realtime.ts for the fix.

  // Messaging
  sendMessage(message: Message) {
    if (this.socket?.connected) {
      this.socket.emit('send_message', message);
    }
  }

  sendStatus(messageId: string, chatId: string, status: 'delivered' | 'read') {
    if (this.socket?.connected) {
      this.socket.emit('message_status', { messageId, chatId, status });
    }
  }

  markRead(peerId: string, chatId: string) {
    if (this.socket?.connected) {
      this.socket.emit('mark_read', { peerId, chatId });
    }
  }

  sendTyping(chatId: string, receiverId: string, isTyping: boolean) {
    if (this.socket?.connected) {
      this.socket.emit('typing_indicator', { chatId, receiverId, isTyping });
    }
  }

  deleteForEveryone(messageId: string, chatId: string, receiverId: string) {
    if (this.socket?.connected) {
      this.socket.emit('delete_for_everyone', { messageId, chatId, receiverId });
    }
  }

  sendCallSignal(signal: {
    callId: string;
    senderId: string; // must match the authenticated socket's user — server rejects otherwise
    targetId: string;
    type: 'audio' | 'video';
    signalType: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'reject';
    senderProfile?: UserProfile;
    sdp?: unknown;
    candidate?: unknown;
    sasWords?: string[];
  }) {
    if (this.socket?.connected) {
      this.socket.emit('call_signal', {
        ...signal,
        timestamp: Date.now(),
      });
    }
  }

  // Listeners
  onContactRequestReceived(callback: (req: ContactRequestWithUser) => void) {
    this.socket?.on('contact_request_received', callback);
    return () => {
      this.socket?.off('contact_request_received', callback);
    };
  }

  onContactRequestAccepted(callback: (data: { requestId: string; contactId: string; acceptedBy?: string }) => void) {
    this.socket?.on('contact_request_accepted', callback);
    return () => {
      this.socket?.off('contact_request_accepted', callback);
    };
  }

  onReceiveMessage(callback: (msg: Message) => void) {
    this.socket?.on('receive_message', callback);
    return () => {
      this.socket?.off('receive_message', callback);
    };
  }

  onMessageStatusUpdate(callback: (data: { messageId: string; chatId: string; status: 'delivered' | 'read' }) => void) {
    this.socket?.on('message_status_update', callback);
    return () => {
      this.socket?.off('message_status_update', callback);
    };
  }

  onTypingIndicator(callback: (data: { chatId: string; senderId: string; receiverId: string; isTyping: boolean }) => void) {
    this.socket?.on('typing_indicator', callback);
    return () => {
      this.socket?.off('typing_indicator', callback);
    };
  }

  onMessageDeletedEveryone(callback: (data: { messageId: string; chatId: string; deletedAt: number }) => void) {
    this.socket?.on('message_deleted_everyone', callback);
    return () => {
      this.socket?.off('message_deleted_everyone', callback);
    };
  }

  onCallSignal(callback: (signal: any) => void) {
    this.socket?.on('call_signal', callback);
    return () => {
      this.socket?.off('call_signal', callback);
    };
  }

  // Presence: who's online right now. presence_snapshot arrives once, right
  // after connecting, with the full current list; presence_update arrives
  // after that for individual online/offline changes.
  onPresenceSnapshot(callback: (userIds: string[]) => void) {
    this.socket?.on('presence_snapshot', callback);
    return () => {
      this.socket?.off('presence_snapshot', callback);
    };
  }

  onPresenceUpdate(callback: (data: { userId: string; status: 'online' | 'offline'; timestamp: number }) => void) {
    this.socket?.on('presence_update', callback);
    return () => {
      this.socket?.off('presence_update', callback);
    };
  }

  // Update Notification Listener
  onUpdateAvailable(callback: (release: any) => void) {
    this.socket?.on('app:update_available', callback);
    return () => {
      this.socket?.off('app:update_available', callback);
    };
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }
}

export const socketService = new SocketService();
