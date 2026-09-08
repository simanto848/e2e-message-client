/**
 * Realtime Socket Client for Mobile App
 *
 * The socket now authenticates with the real session token (same one used
 * for REST calls) instead of a self-declared 'user_online' userId — the
 * server verifies it and rejects the connection otherwise. senderId is no
 * longer sent on emits that used to include it; the server derives it from
 * the authenticated socket, so a compromised/buggy client can no longer
 * pretend to be a different user.
 *
 * Queues: two SEPARATE durable queues — chat messages vs call signaling —
 * each mirrored to disk via outboxStore (survives force-kill) and capped at
 * 50 with dead-letter overflow. Offer/answer/ice are NEVER silently dropped:
 * offline signals are queued, and queue-full/Auth failures return
 * { queued:false, reason } so the caller can show missed-call / not-delivered
 * UI instead of leaving the peer ringing forever.
 */
import { io, Socket } from 'socket.io-client';
import { Message, ContactRequestWithUser, UserProfile } from '../types';

import { SOCKET_SERVER_URL } from './config';
import { getSessionToken, clearSession } from '../utils/keyStore';
import {
  QueuedSocketItem,
  DeadLetterEntry,
  SOCKET_QUEUE_CAP,
  loadSocketMessageQueue,
  saveSocketMessageQueue,
  loadSocketSignalQueue,
  saveSocketSignalQueue,
  appendDeadLetter,
} from '../utils/outboxStore';
import { logger } from '../utils/logger';

export { SOCKET_SERVER_URL };

export interface QueuedResult {
  queued: boolean;
  via?: 'live' | 'queued';
  reason?: string;
}

type NotDeliveredInfo = DeadLetterEntry;

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  // Separate durable queues: chat traffic vs call signaling (never mixed, so a
  // burst of chat retries can't head-of-line-block an urgent hangup/reject).
  private messageQueue: QueuedSocketItem[] = [];
  private signalQueue: QueuedSocketItem[] = [];
  private deadLetter: DeadLetterEntry[] = [];
  private queueUserId: string | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private authFailed = false;
  private unauthorizedHandlers = new Set<() => void>();
  private notDeliveredHandlers = new Set<(info: NotDeliveredInfo) => void>();

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

  private emitInternal(event: string, data?: any) {
    this.listeners.get(event)?.forEach(cb => {
      try {
        (cb as any)(data);
      } catch {}
    });
  }

  private bindAllListeners() {
    if (!this.socket) return;
    this.listeners.forEach((callbacks, event) => {
      // Internal pseudo-events (unauthorized / not-delivered) never hit the wire.
      if (event === 'socket_unauthorized' || event === 'socket_not_delivered') return;
      callbacks.forEach(cb => {
        this.socket?.on(event, cb as any);
      });
    });
  }

  /** Attribute durable queues to a user so they persist/restore per-account. */
  setQueueUserId(userId: string | null) {
    this.queueUserId = userId;
    if (userId) {
      this.hydrateQueues(userId).catch(() => {});
    }
  }

  private async hydrateQueues(userId: string) {
    try {
      const [msgs, sigs] = await Promise.all([
        loadSocketMessageQueue(userId),
        loadSocketSignalQueue(userId),
      ]);
      if (this.queueUserId !== userId) return;
      if (msgs.length > 0 && this.messageQueue.length === 0) this.messageQueue = msgs.slice(0, SOCKET_QUEUE_CAP);
      if (sigs.length > 0 && this.signalQueue.length === 0) this.signalQueue = sigs.slice(0, SOCKET_QUEUE_CAP);
      if (this.socket?.connected) this.flushQueues();
    } catch {}
  }

  private schedulePersist() {
    if (!this.queueUserId) return;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const uid = this.queueUserId;
      if (!uid) return;
      saveSocketMessageQueue(uid, this.messageQueue).catch(() => {});
      saveSocketSignalQueue(uid, this.signalQueue).catch(() => {});
    }, 250);
  }

  private async pushDeadLetter(queue: 'message' | 'signal', event: string, payload: any, reason: string) {
    const entry: DeadLetterEntry = { queue, event, payload, reason, droppedAt: Date.now() };
    this.deadLetter.push(entry);
    if (this.deadLetter.length > SOCKET_QUEUE_CAP) this.deadLetter.shift();
    logger.warn('Socket', `Dead-letter [${queue}] ${event}: ${reason}`);
    this.emitInternal('socket_not_delivered', entry);
    this.notDeliveredHandlers.forEach(fn => {
      try {
        fn(entry);
      } catch {}
    });
    if (this.queueUserId) {
      appendDeadLetter(this.queueUserId, entry).catch(() => {});
    }
  }

  private enqueue(queue: 'message' | 'signal', event: string, payload: any): QueuedResult {
    const target = queue === 'message' ? this.messageQueue : this.signalQueue;
    if (target.length >= SOCKET_QUEUE_CAP) {
      const dropped = target.shift();
      if (dropped) {
        void this.pushDeadLetter(queue, dropped.event, dropped.payload, 'queue-full (oldest evicted)');
      }
    }
    target.push({ event, payload, enqueuedAt: Date.now(), attempts: 0 });
    this.schedulePersist();
    this.reconnectIfNeeded().catch(() => {});
    return { queued: true, via: 'queued' };
  }

  async connect() {
    if (this.authFailed) {
      logger.warn('Socket', 'Not connecting: session was rejected (unauthorized). Sign in again.');
      return;
    }
    if (this.socket && this.socket.connected) {
      return;
    }

    const token = await getSessionToken();
    if (!token) {
      if (__DEV__) {
        logger.warn('Socket', 'No session token available — not connecting');
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
        logger.info('Socket', 'Connected & authenticated to JABY Gateway');
      }
      this.authFailed = false;
      this.flushQueues();
    });

    this.socket.on('connect_error', err => {
      const msg = String((err as any)?.message || err || '');
      if (__DEV__) {
        logger.warn('Socket', 'Connection/auth error:', msg);
      }
      if (/unauthorized|401|jwt|token|auth/i.test(msg)) {
        void this.handleUnauthorized(msg);
      }
    });

    this.socket.on('disconnect', reason => {
      if (__DEV__) {
        logger.info('Socket', 'Disconnected from JABY Gateway:', reason);
      }
    });
  }

  /** Stop infinite reconnect on auth rejection: clear session so App routes to auth. */
  private async handleUnauthorized(reason: string) {
    if (this.authFailed) return;
    this.authFailed = true;
    logger.warn('Socket', 'Session unauthorized — stopping reconnect:', reason);
    try {
      if (this.socket) {
        // Stop the Infinity reconnection loop for this dead session.
        try {
          (this.socket.io as any).opts.reconnection = false;
        } catch {}
        this.socket.disconnect();
      }
    } catch {}
    try {
      await clearSession();
    } catch {}
    this.emitInternal('socket_unauthorized');
    this.unauthorizedHandlers.forEach(fn => {
      try {
        fn();
      } catch {}
    });
  }

  /** Subscribe to auth-rejection (App routes to auth screen). */
  onUnauthorized(callback: () => void): () => void {
    this.unauthorizedHandlers.add(callback);
    const off = this.addEventListener('socket_unauthorized', callback as any);
    return () => {
      this.unauthorizedHandlers.delete(callback);
      off();
    };
  }

  /** Subscribe to dead-letter (never-silently-dropped) surfacing. */
  onNotDelivered(callback: (info: NotDeliveredInfo) => void): () => void {
    this.notDeliveredHandlers.add(callback);
    const off = this.addEventListener('socket_not_delivered', callback as any);
    return () => {
      this.notDeliveredHandlers.delete(callback);
      off();
    };
  }

  getDeadLetter(): DeadLetterEntry[] {
    return [...this.deadLetter];
  }

  private emitOrQueueMessage(event: string, payload: any): QueuedResult {
    if (this.authFailed) return { queued: false, reason: 'unauthorized' };
    if (this.socket?.connected) {
      this.socket.emit(event, payload);
      return { queued: true, via: 'live' };
    }
    return this.enqueue('message', event, payload);
  }

  private emitOrQueueSignal(event: string, payload: any): QueuedResult {
    if (this.authFailed) return { queued: false, reason: 'unauthorized' };
    if (this.socket?.connected) {
      this.socket.emit(event, payload);
      return { queued: true, via: 'live' };
    }
    return this.enqueue('signal', event, payload);
  }

  private flushQueues() {
    if (!this.socket?.connected) return;
    if (this.messageQueue.length > 0) {
      const items = [...this.messageQueue];
      this.messageQueue = [];
      for (const item of items) {
        try {
          this.socket.emit(item.event, item.payload);
        } catch {
          this.messageQueue.push(item);
        }
      }
    }
    if (this.signalQueue.length > 0) {
      const items = [...this.signalQueue];
      this.signalQueue = [];
      for (const item of items) {
        try {
          this.socket.emit(item.event, item.payload);
        } catch {
          this.signalQueue.unshift(item);
          break;
        }
      }
    }
    this.schedulePersist();
  }

  // Kept for backward compat (old single-queue callers); flushes both.
  private flushOutgoingQueue() {
    this.flushQueues();
  }

  /**
   * Re-arm the connection after the app returns to the foreground.
   */
  async reconnectIfNeeded() {
    if (this.authFailed) return;
    if (this.socket?.connected) return;
    await this.connect();
  }

  disconnect(options?: { clearListeners?: boolean }) {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (options?.clearListeners) {
      this.listeners.clear();
      this.messageQueue = [];
      this.signalQueue = [];
      this.unauthorizedHandlers.clear();
      this.notDeliveredHandlers.clear();
      this.authFailed = false;
    }
  }

  cleanupListeners() {
    this.listeners.clear();
    this.messageQueue = [];
    this.signalQueue = [];
    this.unauthorizedHandlers.clear();
    this.notDeliveredHandlers.clear();
    this.schedulePersist();
  }

  /** Queue depth for offline banners / debugging. */
  getQueueDepths(): { messages: number; signals: number; deadLetter: number } {
    return { messages: this.messageQueue.length, signals: this.signalQueue.length, deadLetter: this.deadLetter.length };
  }

  // Messaging (durable message queue; idempotency via clientMessageId)
  sendMessage(message: Message, opts?: { clientMessageId?: string }): QueuedResult {
    const clientMessageId = opts?.clientMessageId || (message as Message).id;
    const payload = clientMessageId ? { ...message, clientMessageId } : message;
    return this.emitOrQueueMessage('send_message', payload);
  }

  sendStatus(messageId: string, chatId: string, status: 'delivered' | 'read', clientMessageId?: string): QueuedResult {
    return this.emitOrQueueMessage('message_status', { messageId, chatId, status, clientMessageId });
  }

  markRead(peerId: string, chatId: string, clientMessageId?: string): QueuedResult {
    return this.emitOrQueueMessage('mark_read', { peerId, chatId, clientMessageId });
  }

  sendTyping(chatId: string, receiverId: string, isTyping: boolean) {
    // Ephemeral only — never queued (a stale "typing…" after reconnect is worse than none).
    if (this.socket?.connected) {
      this.socket.emit('typing_indicator', { chatId, receiverId, isTyping });
    }
  }

  deleteForEveryone(messageId: string, chatId: string, receiverId: string): QueuedResult {
    return this.emitOrQueueMessage('delete_for_everyone', { messageId, chatId, receiverId });
  }

  sendCallSignal(signal: {
    callId: string;
    senderId: string;
    targetId: string;
    type: 'audio' | 'video';
    signalType: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'reject' | 'restart-offer' | 'restart-answer';
    senderProfile?: UserProfile;
    sdp?: unknown;
    candidate?: unknown;
    sasWords?: string[];
  }): QueuedResult {
    const payload = {
      ...signal,
      timestamp: Date.now(),
    };
    if (this.authFailed) return { queued: false, reason: 'unauthorized' };
    if (this.socket?.connected) {
      this.socket.emit('call_signal', payload);
      return { queued: true, via: 'live' };
    }
    // Offline: NEVER silently drop offer/answer/ice — queue durably so the
    // caller can show "not delivered / missed call" instead of ghost ringing.
    // Hangup/reject are equally critical (peer must not hang) so they queue too.
    const res = this.emitOrQueueSignal('call_signal', payload);
    if (__DEV__ && !res.queued) {
      logger.warn('Socket', 'Call signal not queued:', signal.signalType, res.reason);
    }
    return res;
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

  // Connection lifecycle for offline/online UI + outbox flushing. These ride
  // the same rebind-safe registry as every other listener, so they survive
  // reconnects and resubscribes.
  onConnect(callback: () => void) {
    return this.addEventListener('connect', callback);
  }

  onDisconnect(callback: (reason: string) => void) {
    return this.addEventListener('disconnect', callback);
  }

  // Screenshot capture notice (Signal-style): tell the peer their chat
  // screen may have been captured. Server verifies contacts + identity.
  sendScreenshotNotice(peerId: string, chatId: string) {
    if (this.socket?.connected) {
      this.socket.emit('screenshot_notice', { peerId, chatId });
    }
  }

  onScreenshotNotice(
    callback: (data: { senderId: string; senderName: string; chatId: string; timestamp: number }) => void
  ) {
    return this.addEventListener('screenshot_notice', callback);
  }

  // Safety-number verification changed on one of this user's other sessions:
  // patch the matching thread so every device agrees.
  onSafetyNumberUpdated(
    callback: (data: { peerId: string; safetyNumber: string; isVerified: boolean; verifiedSafetyNumber: string | null }) => void
  ) {
    return this.addEventListener('safety_number_updated', callback);
  }

  onCallSignal(callback: (signal: any) => void) {
    return this.addEventListener('call_signal', callback);
  }

  onPresenceSnapshot(
    callback: (data: string[] | { online: string[]; lastSeen?: Record<string, number> }) => void
  ) {
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
