import {
  UserProfile,
  ChatThread,
  Message,
  ContactRequestWithUser,
  InviteCode,
  Attachment,
  EncryptedPayload,
  SearchOperativeResult,
  DisappearingTimer,
  BackupFrequency,
} from '../types';
import { API_BASE_URL } from './config';
import { getSessionToken } from '../utils/keyStore';

export { API_BASE_URL };

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authedJsonHeaders(): Promise<Record<string, string>> {
  return { 'Content-Type': 'application/json', ...(await authHeaders()) };
}

/**
 * Safely parse HTTP responses without throwing SyntaxError on HTML/non-JSON (e.g. 502/504 Gateway errors).
 */
async function safeParseResponse<T = any>(res: Response, fallback: T): Promise<T> {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (!res.ok && typeof data === 'object' && data !== null && !('success' in data)) {
        return { success: false, error: data.error || data.message || `HTTP ${res.status}` } as any;
      }
      return data;
    }
    const text = await res.text();
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 100)}` } as any;
    }
    return fallback;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network parse error' } as any;
  }
}

export const api = {
  // Health Check
  async checkHealth() {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      return await safeParseResponse(res, { status: 'offline' });
    } catch {
      return { status: 'offline' };
    }
  },

  // Auth: Login (no token needed yet — this is what obtains one)
  async login(handle: string, pinCode: string): Promise<{ success: boolean; token?: string; user?: UserProfile; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, pinCode }),
      });
      return await safeParseResponse(res, { success: false, error: 'Network error' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Login connection failed' };
    }
  },

  // Auth: Register (no token needed yet)
  async register(params: {
    name: string;
    handle: string;
    inviteCode?: string;
    publicKey: string;
    pinCode: string;
    fingerprintHash?: string;
  }): Promise<{ success: boolean; token?: string; user?: UserProfile; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return await safeParseResponse(res, { success: false, error: 'Network error' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Registration connection failed' };
    }
  },

  // Auth: Update profile (name/status/avatar, and — for key rotation on a
  // fresh device — a new publicKey). Always acts as the authenticated caller.
  async updateProfile(params: { name?: string; statusMessage?: string; avatar?: string; publicKey?: string }): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PUT',
        headers: await authedJsonHeaders(),
        body: JSON.stringify(params),
      });
      return await safeParseResponse(res, { success: false, error: 'Network error' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Update profile failed' };
    }
  },

  // Settings & Privacy: update settings stored on server
  async updatePrivacySettings(settings: {
    blockScreenshots?: boolean;
    callVerification?: boolean;
    autoLockDelay?: number;
    backupFrequency?: BackupFrequency;
  }): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/settings`, {
        method: 'PUT',
        headers: await authedJsonHeaders(),
        body: JSON.stringify(settings),
      });
      return await safeParseResponse(res, { success: false, error: 'Failed to update settings' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update settings' };
    }
  },

  // Auth: Update password/PIN
  async updatePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string; message?: string; token?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/password`, {
        method: 'PUT',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      return await safeParseResponse(res, { success: false, error: 'Failed to update password' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error updating password' };
    }
  },

  // Signs a direct-to-Cloudinary avatar upload — see src/utils/avatarUpload.ts.
  async getAvatarUploadSignature(): Promise<{
    success: boolean;
    error?: string;
    timestamp: number;
    signature: string;
    folder: string;
    publicId: string;
    apiKey: string;
    cloudName: string;
  }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/avatar-signature`, {
        method: 'POST',
        headers: await authHeaders(),
      });
      return await safeParseResponse(res, {
        success: false,
        error: 'Failed to get avatar signature',
        timestamp: 0,
        signature: '',
        folder: '',
        publicId: '',
        apiKey: '',
        cloudName: '',
      });
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error',
        timestamp: 0,
        signature: '',
        folder: '',
        publicId: '',
        apiKey: '',
        cloudName: '',
      };
    }
  },

  // Contacts: Fetch Approved Contacts / Threads
  async getContacts(userId: string): Promise<ChatThread[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/${userId}`, { headers: await authHeaders() });
      const data = await safeParseResponse(res, { contacts: [] });
      return data.contacts || [];
    } catch {
      return [];
    }
  },

  // Contacts: Search Operatives with Live Connection Status
  async searchOperatives(query: string): Promise<SearchOperativeResult[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/search?q=${encodeURIComponent(query)}`, { headers: await authHeaders() });
      const data = await safeParseResponse(res, { results: [] });
      return data.results || [];
    } catch {
      return [];
    }
  },

  // Contacts: Fetch Pending Requests
  async getContactRequests(userId: string): Promise<{ incoming: ContactRequestWithUser[]; outgoing: ContactRequestWithUser[] }> {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/requests/${userId}`, { headers: await authHeaders() });
      const data = await safeParseResponse(res, { requests: { incoming: [], outgoing: [] } });
      return data.requests || { incoming: [], outgoing: [] };
    } catch {
      return { incoming: [], outgoing: [] };
    }
  },

  // Contacts: Send Connection Request
  async sendContactRequest(receiverId: string): Promise<{ success: boolean; request?: any; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/request`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ receiverId }),
      });
      return await safeParseResponse(res, { success: false, error: 'Network error' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to send request' };
    }
  },

  // Contacts: Accept Connection Request
  async acceptContactRequest(requestId: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/accept`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ requestId }),
      });
      return await safeParseResponse(res, { success: false, error: 'Network error' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to accept request' };
    }
  },

  // Contacts: Decline Connection Request
  async declineContactRequest(requestId: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/decline`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ requestId }),
      });
      return await safeParseResponse(res, { success: false, error: 'Network error' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to decline request' };
    }
  },

  // Messages: Send Message via REST for guaranteed DB persistence
  async sendMessage(msg: Message) {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/messages/send`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify(msg),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err) {
      console.warn('REST sendMessage failed, fallback to socket:', err);
      return { success: false };
    }
  },

  // Messages: Mark Conversation Messages as Read
  async markMessagesAsRead(peerId: string, chatId?: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/messages/read`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ peerId, chatId }),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err) {
      console.warn('REST markMessagesAsRead failed:', err);
      return { success: false };
    }
  },

  // Messages: Fetch History for Contact
  async getMessages(chatId: string, userId: string): Promise<Message[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/messages/${chatId}/${userId}`, { headers: await authHeaders() });
      const data = await safeParseResponse(res, { messages: [] });
      return data.messages || [];
    } catch {
      return [];
    }
  },

  // Messages: Update Disappearing Timer
  async updateDisappearingTimer(peerId: string, timer: DisappearingTimer) {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/disappearing-timer`, {
        method: 'PUT',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ peerId, timer }),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update timer' };
    }
  },

  // Contacts: Clear Chat History
  async clearChatHistory(peerId: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/clear-history`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ peerId }),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to clear chat history' };
    }
  },

  // Contacts: Disconnect Contact
  async disconnectContact(peerId: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/contacts/disconnect`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ peerId }),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to disconnect contact' };
    }
  },

  // Invites: Validate
  async validateInvite(code: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/invites/validate/${encodeURIComponent(code)}`);
      return await safeParseResponse(res, { valid: false });
    } catch {
      return { valid: false };
    }
  },

  // Invites: Create
  async createInvite(daysValid = 7): Promise<{ success: boolean; invite?: InviteCode; remainingCodes?: number; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/invites/create`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ daysValid }),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to create invite' };
    }
  },

  // Invites: Fetch user invites
  async getUserInvites(userId: string): Promise<InviteCode[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/invites/user/${userId}`, { headers: await authHeaders() });
      const data = await safeParseResponse(res, { invites: [] });
      return data.invites || [];
    } catch {
      return [];
    }
  },

  // Cloud Backup: Save
  async saveCloudBackup(
    backupData: {
      encryptedData: string;
      salt: string;
      iv: string;
      backupSizeKb: number;
      backupVersion: string;
      totalMessagesCount: number;
      totalChatsCount: number;
      keyFingerprint: string;
    },
    tokenOverride?: string
  ) {
    try {
      const headers = tokenOverride
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOverride}` }
        : await authedJsonHeaders();
      const res = await fetch(`${API_BASE_URL}/backup/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify(backupData),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save cloud backup' };
    }
  },

  // Cloud Backup: Fetch
  async getCloudBackup(userId: string, tokenOverride?: string): Promise<{
    success: boolean;
    backup?: {
      encryptedData: string;
      salt: string;
      iv: string;
      backupSizeKb?: number;
      backupVersion?: string;
      totalMessagesCount?: number;
      totalChatsCount?: number;
      keyFingerprint?: string;
      createdAt?: string;
      timestamp?: number | string;
    } | null;
    error?: string;
  }> {
    try {
      const headers = tokenOverride
        ? { Authorization: `Bearer ${tokenOverride}` }
        : await authHeaders();
      const res = await fetch(`${API_BASE_URL}/backup/${userId}`, { headers });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch cloud backup' };
    }
  },

  // Linked Devices: Fetch
  async getLinkedDevices(userId: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/backup/devices/${userId}`, { headers: await authHeaders() });
      const data = await safeParseResponse(res, { devices: [] });
      return data.devices || [];
    } catch {
      return [];
    }
  },

  // Linked Devices: Revoke
  async revokeDevice(userId: string, deviceId: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/backup/devices/${userId}/${deviceId}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to revoke device' };
    }
  },

  // Media Upload — file bytes are already encrypted client-side (same
  // nacl.box scheme as text messages, see src/utils/crypto.ts) before this
  // is called; the server only ever stores/relays ciphertext.
  async uploadMedia(params: {
    name: string;
    type: 'image' | 'audio';
    size: number;
    mimeType?: string;
    duration?: number;
    waveform?: number[];
    receiverId: string;
    encryptedPayload: EncryptedPayload;
  }): Promise<{ success: boolean; attachment?: Attachment; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/media/upload`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify(params),
      });
      return await safeParseResponse(res, { success: false, error: 'Upload failed' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Upload connection failed' };
    }
  },

  // Fetch a previously-uploaded encrypted attachment's ciphertext for decryption.
  async getMedia(attachmentId: string): Promise<{ success: boolean; attachment?: Attachment & { encryptedPayload: EncryptedPayload }; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/media/${attachmentId}`, {
        headers: await authHeaders(),
      });
      return await safeParseResponse(res, { success: false, error: 'Fetch media failed' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error fetching media' };
    }
  },

  // Poll for background incoming calls and unread messages
  async pollNotifications(): Promise<{
    success: boolean;
    pendingCall?: {
      callId: string;
      senderId: string;
      targetId: string;
      senderName: string;
      senderAvatar: string;
      callType: 'audio' | 'video';
      signalPayload: any;
      createdAt: number;
      expiresAt: number;
    } | null;
    totalUnread?: number;
    unreadThreads?: {
      peerId: string;
      peerName: string;
      peerAvatar: string;
      unreadCount: number;
      lastTimestamp: number;
    }[];
    serverTime?: number;
    error?: string;
  }> {
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/poll`, {
        headers: await authHeaders(),
      });
      return await safeParseResponse(res, { success: false, error: 'Network unavailable' });
    } catch {
      return { success: false, error: 'Network unavailable' };
    }
  },

  // Acknowledge or dismiss a pending call offer
  async ackPendingCall(): Promise<{ success: boolean }> {
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/ack-call`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
      });
      return await safeParseResponse(res, { success: false });
    } catch {
      return { success: false };
    }
  },
};
