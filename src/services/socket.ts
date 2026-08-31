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

    this.socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: { token },
    });

    this.socket.on('connect', () => {
      console.log('[Mobile Socket] Connected & authenticated to JABY Gateway');
    });

    this.socket.on('connect_error', err => {
      console.warn('[Mobile Socket] Connection/auth error:', err.message);
    });

    this.socket.on('disconnect', () => {
      console.log('[Mobile Socket] Disconnected from JABY Gateway');
    });
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

  // Voice stream chunk relay
  sendVoiceChunk(targetId: string, audioData: string) {
    if (this.socket?.connected) {
      this.socket.emit('call_voice_chunk', { targetId, audioData });
    }
  }

  onReceiveVoiceChunk(callback: (data: { senderId: string; targetId: string; audioData: string }) => void) {
    this.socket?.on('call_voice_chunk', callback);
    return () => {
      this.socket?.off('call_voice_chunk', callback);
    };
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }
}

export const socketService = new SocketService();
