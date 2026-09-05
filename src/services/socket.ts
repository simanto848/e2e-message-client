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
  private listeners: Map<string, Set<Function>> = new Map();
  private outgoingQueue: Array<{ event: string; payload: any }> = [];

  private addEventListener<T extends Function>(event: string, callback: T): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.socket) {
      this.socket.on(event, callback as any);
    }

    return () => {
      this.listeners.get(event)?.delete(callback);
      if (this.socket) {
        this.socket.off(event, callback as any);
      }
    };
  }

  private bindAllListeners() {
    if (!this.socket) return;
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach(cb => {
        this.socket?.on(event, cb as any);
      });
    });
  }

  async connect() {
    if (this.socket && this.socket.connected) {
      return;
    }

    const token = await getSessionToken();
    if (!token) {
      if (__DEV__) {
        console.warn('[Mobile Socket] No session token available — not connecting');
      }
      return;
    }

    if (this.socket) {
      this.socket.auth = { token };
      this.socket.connect();
      return;
    }

    this.socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      auth: { token },
    });

    this.bindAllListeners();

    this.socket.on('connect', () => {
      if (__DEV__) {
        console.log('[Mobile Socket] Connected & authenticated to JABY Gateway');
      }
      this.flushOutgoingQueue();
    });

    this.socket.on('connect_error', err => {
      if (__DEV__) {
        console.warn('[Mobile Socket] Connection/auth error:', err.message);
      }
    });

    this.socket.on('disconnect', reason => {
      if (__DEV__) {
        console.log('[Mobile Socket] Disconnected from JABY Gateway:', reason);
      }
    });
  }

  private emitOrQueue(event: string, payload: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, payload);
    } else {
      if (this.outgoingQueue.length >= 50) {
        this.outgoingQueue.shift();
      }
      this.outgoingQueue.push({ event, payload });
      this.reconnectIfNeeded().catch(() => {});
    }
  }

  private flushOutgoingQueue() {
    if (!this.socket?.connected || this.outgoingQueue.length === 0) return;
    const items = [...this.outgoingQueue];
    this.outgoingQueue = [];
    for (const item of items) {
      this.socket.emit(item.event, item.payload);
    }
  }

  /**
   * Re-arm the connection after the app returns to the foreground.
   */
  async reconnectIfNeeded() {
    if (this.socket?.connected) return;
    await this.connect();
  }

  disconnect(options?: { clearListeners?: boolean }) {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (options?.clearListeners) {
      this.listeners.clear();
      this.outgoingQueue = [];
    }
  }

  cleanupListeners() {
    this.listeners.clear();
    this.outgoingQueue = [];
  }

  // Messaging
  sendMessage(message: Message) {
    this.emitOrQueue('send_message', message);
  }

  sendStatus(messageId: string, chatId: string, status: 'delivered' | 'read') {
    this.emitOrQueue('message_status', { messageId, chatId, status });
  }

  markRead(peerId: string, chatId: string) {
    this.emitOrQueue('mark_read', { peerId, chatId });
  }

  sendTyping(chatId: string, receiverId: string, isTyping: boolean) {
    if (this.socket?.connected) {
      this.socket.emit('typing_indicator', { chatId, receiverId, isTyping });
    }
  }

  deleteForEveryone(messageId: string, chatId: string, receiverId: string) {
    this.emitOrQueue('delete_for_everyone', { messageId, chatId, receiverId });
  }

  sendCallSignal(signal: {
    callId: string;
    senderId: string;
    targetId: string;
    type: 'audio' | 'video';
    signalType: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'reject';
    senderProfile?: UserProfile;
    sdp?: unknown;
    candidate?: unknown;
    sasWords?: string[];
  }) {
    const payload = {
      ...signal,
      timestamp: Date.now(),
    };
    if (this.socket?.connected) {
      this.socket.emit('call_signal', payload);
    } else if (signal.signalType === 'hangup' || signal.signalType === 'reject') {
      // Critical teardown signals should be queued so the peer is not left ringing/hanging
      this.emitOrQueue('call_signal', payload);
    } else {
      if (__DEV__) {
        console.warn('[Mobile Socket] Call signal dropped while disconnected:', signal.signalType);
      }
    }
  }

  // Listeners
  onContactRequestReceived(callback: (req: ContactRequestWithUser) => void) {
    return this.addEventListener('contact_request_received', callback);
  }

  onContactRequestAccepted(callback: (data: { requestId: string; contactId: string; acceptedBy?: string }) => void) {
    return this.addEventListener('contact_request_accepted', callback);
  }

  onReceiveMessage(callback: (msg: Message) => void) {
    return this.addEventListener('receive_message', callback);
  }

  onMessageStatusUpdate(callback: (data: { messageId: string; chatId: string; status: 'delivered' | 'read' }) => void) {
    return this.addEventListener('message_status_update', callback);
  }

  onTypingIndicator(callback: (data: { chatId: string; senderId: string; receiverId: string; isTyping: boolean }) => void) {
    return this.addEventListener('typing_indicator', callback);
  }

  onMessageDeletedEveryone(callback: (data: { messageId: string; chatId: string; deletedAt: number }) => void) {
    return this.addEventListener('message_deleted_everyone', callback);
  }

  onCallSignal(callback: (signal: any) => void) {
    return this.addEventListener('call_signal', callback);
  }

  onPresenceSnapshot(callback: (userIds: string[]) => void) {
    return this.addEventListener('presence_snapshot', callback);
  }

  onPresenceUpdate(callback: (data: { userId: string; status: 'online' | 'offline'; timestamp: number }) => void) {
    return this.addEventListener('presence_update', callback);
  }

  onUpdateAvailable(callback: (release: any) => void) {
    return this.addEventListener('app:update_available', callback);
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }
}

export const socketService = new SocketService();
