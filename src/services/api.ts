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
import { fetchWithTimeout, fetchJsonWithRetry, safeParseResponse } from './http';
import { logger } from '../utils/logger';

export { API_BASE_URL };

/**
 * Wire representation of a chat message: ciphertext only, never plaintext.
 * `text` must be '' on the wire — enforced at runtime (throw) so a plaintext
 * leak fails closed instead of silently uploading readable chat content.
 */
export type WireMessage = Omit<Message, 'text'> & { text: '' };

function assertWireMessage(msg: any): asserts msg is WireMessage {
  if (!msg || typeof msg.id !== 'string' || !msg.encryptedPayload?.ciphertext) {
    throw new Error('api.sendMessage: invalid wire payload (missing id/ciphertext)');
  }
  if ((msg as any).text !== '') {
    throw new Error("api.sendMessage: wire message must have text==='' (plaintext must never leave the device)");
  }
}

function clientMessageIdHeaders(clientMessageId?: string): Record<string, string> {
  return clientMessageId ? { 'X-Client-Message-Id': clientMessageId } : {};
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authedJsonHeaders(): Promise<Record<string, string>> {
  return { 'Content-Type': 'application/json', ...(await authHeaders()) };
}

export const api = {
  // Health Check
  async checkHealth() {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/health`);
      return await safeParseResponse(res, { status: 'offline' });
    } catch {
      return { status: 'offline' };
    }
  },

  // Auth: Login (no token needed yet — this is what obtains one)
  async login(handle: string, pinCode: string): Promise<{ success: boolean; token?: string; user?: UserProfile; error?: string }> {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/profile`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/settings`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/password`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/avatar-signature`, {
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

  // Contacts: Fetch Approved Contacts / Threads. Returns success:false on
  // network failure so callers can tell "offline" apart from "no contacts"
  // (critical: never wipe the offline cache on a failed fetch).
  async getContacts(userId: string): Promise<{ success: boolean; contacts: ChatThread[]; error?: string }> {
    try {
      const data: any = await fetchJsonWithRetry(
        `${API_BASE_URL}/contacts/${userId}`,
        { headers: await authHeaders() },
        { retries: 2, fallback: { contacts: [] } }
      );
      if (data && data.success === false && !('contacts' in data)) {
        return { success: false, contacts: [], error: data.error || 'Fetch failed' };
      }
      return { success: true, contacts: data.contacts || [] };
    } catch (err: any) {
      return { success: false, contacts: [], error: err?.message || 'Network error' };
    }
  },

  // Contacts: Search Operatives with Live Connection Status
  async searchOperatives(query: string): Promise<SearchOperativeResult[]> {
    try {
      const data = await fetchJsonWithRetry(
        `${API_BASE_URL}/contacts/search?q=${encodeURIComponent(query)}`,
        { headers: await authHeaders() },
        { retries: 1, fallback: { results: [] } }
      );
      return data.results || [];
    } catch {
      return [];
    }
  },

  // Contacts: Fetch Pending Requests
  async getContactRequests(userId: string): Promise<{ incoming: ContactRequestWithUser[]; outgoing: ContactRequestWithUser[] }> {
    try {
      const data = await fetchJsonWithRetry(
        `${API_BASE_URL}/contacts/requests/${userId}`,
        { headers: await authHeaders() },
        { retries: 2, fallback: { requests: { incoming: [], outgoing: [] } } }
      );
      return data.requests || { incoming: [], outgoing: [] };
    } catch {
      return { incoming: [], outgoing: [] };
    }
  },

  // Contacts: Send Connection Request
  async sendContactRequest(receiverId: string): Promise<{ success: boolean; request?: any; error?: string }> {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/contacts/request`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/contacts/accept`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/contacts/decline`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ requestId }),
      });
      return await safeParseResponse(res, { success: false, error: 'Network error' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to decline request' };
    }
  },

  // Messages: Send Message via REST for guaranteed DB persistence.
  // Wire-only: `msg` must be ciphertext with text==='' (throws otherwise).
  // `clientMessageId` is an idempotency key (defaults to msg.id) so socket +
  // REST double-delivery and outbox retries dedupe server-side / in logs.
  async sendMessage(
    msg: WireMessage,
    opts?: { clientMessageId?: string } | string
  ): Promise<{ success: boolean; error?: string; messageId?: string }> {
    assertWireMessage(msg);
    const clientMessageId =
      typeof opts === 'string' ? opts : opts?.clientMessageId || (msg as Message).id;
    try {
      const headers = { ...(await authedJsonHeaders()), ...clientMessageIdHeaders(clientMessageId) };
      const res = await fetchWithTimeout(`${API_BASE_URL}/contacts/messages/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify(clientMessageId ? { ...msg, clientMessageId } : msg),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      // NOTE: no automatic socket fallback here — callers decide (sendMessageReliable
      // tries REST -> socket queue -> outbox). This log only records the REST failure.
      logger.warn('API', 'REST sendMessage failed (caller should enqueue via socket/outbox):', err);
      return { success: false, error: err?.message || 'Network error' };
    }
  },

  // Messages: Mark Conversation Messages as Read (idempotent via clientMessageId).
  async markMessagesAsRead(peerId: string, chatId?: string, clientMessageId?: string) {
    try {
      const headers = { ...(await authedJsonHeaders()), ...clientMessageIdHeaders(clientMessageId) };
      const res = await fetchWithTimeout(`${API_BASE_URL}/contacts/messages/read`, {
        method: 'POST',
        headers,
        body: JSON.stringify(clientMessageId ? { peerId, chatId, clientMessageId } : { peerId, chatId }),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err) {
      logger.warn('API', 'REST markMessagesAsRead failed:', err);
      return { success: false };
    }
  },

  // Messages: Best-effort server purge for an expired disappearing message.
  // The server runs its own scrubber (scrubExpiredMessages), but the client
  // tombstones on expiry so history doesn't linger until the next sweep.
  // No dedicated REST route exists yet — tries DELETE, falls back to the
  // realtime delete_for_everyone path via socket (callers also emit that).
  // Never throws; expiry purging must not crash the 1s timer.
  async deleteMessage(messageId: string, chatId?: string): Promise<{ success: boolean; error?: string }> {
    if (!messageId) return { success: false, error: 'messageId required' };
    try {
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/contacts/messages/${encodeURIComponent(messageId)}`,
        { method: 'DELETE', headers: await authedJsonHeaders() }
      );
      const parsed: any = await safeParseResponse(res, { success: false });
      if (parsed?.success) return { success: true };
      // Server has no DELETE route yet (404) — treat as tombstone request;
      // the socket delete_for_everyone emit (done by callers) is authoritative.
      return { success: false, error: parsed?.error || 'No delete route (tombstone via socket)' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  },

  // Messages: Fetch History for Contact.
  // Cursor is (timestamp, id): `before` bounds timestamp (<), `beforeId`
  // breaks ties for equal timestamps (stable paging, no skip/dup). `beforeId`
  // is forwarded when the server supports it and applied client-side otherwise,
  // so old servers keep working (backward compat).
  async getMessages(
    chatId: string,
    userId: string,
    opts?: { limit?: number; before?: number; beforeId?: string }
  ): Promise<Message[]> {
    const page = await api.getMessagesPage(chatId, userId, opts);
    return page.messages;
  },

  // Paged fetch with server-has-more hint. `hasMore` is true only when a full
  // page arrived AND the server indicates more (or, for old servers without
  // the flag, when a full page arrived). Callers: hasMore = raw.length===PAGE_SIZE && serverHasMore.
  async getMessagesPage(
    chatId: string,
    userId: string,
    opts?: { limit?: number; before?: number; beforeId?: string }
  ): Promise<{ messages: Message[]; hasMore: boolean; serverHasMore: boolean }> {
    try {
      const params = new URLSearchParams();
      if (opts?.limit) params.set('limit', String(opts.limit));
      if (opts?.before) params.set('before', String(opts.before));
      if (opts?.beforeId) params.set('beforeId', String(opts.beforeId));
      const qs = params.toString();
      const data: any = await fetchJsonWithRetry(
        `${API_BASE_URL}/contacts/messages/${chatId}/${userId}${qs ? `?${qs}` : ''}`,
        { headers: await authHeaders() },
        { retries: 2, fallback: { messages: [] } }
      );
      let messages: Message[] = data.messages || [];
      // Client-side tie-break when the server ignores beforeId: drop any
      // message at/after the cursor that a timestamp-only page may repeat.
      if (opts?.beforeId && messages.length > 0) {
        const seen = messages.findIndex(m => m.id === opts.beforeId);
        if (seen >= 0) messages = messages.slice(0, seen);
      }
      const serverHasMore =
        typeof data.hasMore === 'boolean'
          ? data.hasMore
          : typeof data.serverHasMore === 'boolean'
            ? data.serverHasMore
            : messages.length === (opts?.limit ?? messages.length) && messages.length > 0;
      const limit = opts?.limit ?? messages.length;
      const hasMore = messages.length === limit && limit > 0 && serverHasMore;
      return { messages, hasMore, serverHasMore };
    } catch {
      return { messages: [], hasMore: false, serverHasMore: false };
    }
  },

  // Messages: Update Disappearing Timer
  async updateDisappearingTimer(peerId: string, timer: DisappearingTimer) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/contacts/disappearing-timer`, {
        method: 'PUT',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ peerId, timer }),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update timer' };
    }
  },

  // Contacts: Mark Safety Number Verified / Unverify. The server only accepts
  // verification when the submitted number matches the number derived from
  // both parties' current keys (stale numbers after key rotation are
  // rejected), and persists it so it survives reloads and other devices.
  async verifySafetyNumber(
    peerId: string,
    safetyNumber: string,
    verified: boolean
  ): Promise<{ success: boolean; error?: string; safetyNumber?: string; isVerified?: boolean; verifiedSafetyNumber?: string | null }> {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/contacts/verify`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ peerId, safetyNumber, verified }),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update verification' };
    }
  },

  // Contacts: Clear Chat History
  async clearChatHistory(peerId: string) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/contacts/clear-history`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/contacts/disconnect`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/invites/validate/${encodeURIComponent(code)}`);
      return await safeParseResponse(res, { valid: false });
    } catch {
      return { valid: false };
    }
  },

  // Invites: Create
  async createInvite(daysValid = 7): Promise<{ success: boolean; invite?: InviteCode; remainingCodes?: number; error?: string }> {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/invites/create`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/invites/user/${userId}`, { headers: await authHeaders() });
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/backup/save`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/backup/${userId}`, { headers });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch cloud backup' };
    }
  },

  // Linked Devices: Fetch
  async getLinkedDevices(userId: string) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/backup/devices/${userId}`, { headers: await authHeaders() });
      const data = await safeParseResponse(res, { devices: [] });
      return data.devices || [];
    } catch {
      return [];
    }
  },

  // Linked Devices: Revoke
  async revokeDevice(userId: string, deviceId: string) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/backup/devices/${userId}/${deviceId}`, {
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
  //
  // Accepted types: image|audio|video|document (mirrors server
  // ALLOWED_ATTACHMENT_TYPES). 'call' is metadata-only and must never be
  // uploaded (400). Video/document go through this SAME upload path, then the
  // returned Attachment (metadata only, no ciphertext) is embedded in a
  // Message.attachment and sent via sendMessage.
  //
  // Shape: POST returns {id,...,url:'/api/media/<id>'} RELATIVE + encrypted:true
  // (no ciphertext — keeps Message.attachment small). Prefixed here to an
  // absolute URL via BACKEND_URL. GET /api/media/:id returns the same fields
  // + encryptedPayload (ciphertext) for decryption.
  async uploadMedia(params: {
    name: string;
    type: 'image' | 'audio' | 'video' | 'document';
    size: number;
    mimeType?: string;
    duration?: number;
    waveform?: number[];
    receiverId: string;
    encryptedPayload: EncryptedPayload;
  }): Promise<{ success: boolean; attachment?: Attachment; error?: string }> {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/media/upload`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify(params),
      });
      const data = await safeParseResponse<{ success: boolean; attachment?: Attachment; error?: string }>(res, { success: false, error: 'Upload failed' });
      // Server returns a relative url (/api/media/<id>) — prefix to absolute so
      // <Image source={{uri}}>/fetch callers never request a bare path.
      if (data?.success && data.attachment && typeof data.attachment.url === 'string' && data.attachment.url.startsWith('/')) {
        data.attachment = { ...data.attachment, url: `${API_BASE_URL.replace(/\/api$/, '')}${data.attachment.url}` };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Upload connection failed' };
    }
  },

  // Fetch a previously-uploaded encrypted attachment's ciphertext for decryption.
  async getMedia(attachmentId: string): Promise<{ success: boolean; attachment?: Attachment & { encryptedPayload: EncryptedPayload }; error?: string }> {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/media/${attachmentId}`, {
        headers: await authHeaders(),
      });
      return await safeParseResponse(res, { success: false, error: 'Fetch media failed' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error fetching media' };
    }
  },

  // Linked Devices: Register current device (wired to LinkedDevicesModal's
  // "Link Another Device" — POST /api/backup/devices/register, validation kept
  // server-side: name required, type/os defaulted).
  async registerDevice(params: { name: string; type?: string; os?: string }): Promise<{ success: boolean; device?: any; error?: string }> {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/backup/devices/register`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify(params),
      });
      return await safeParseResponse(res, { success: false, error: 'Network error' });
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to register device' };
    }
  },

  // Push-token upload: POST /api/backup/devices/push-token {expoPushToken, platform}
  // behind requireAuth. Called by pushNotifications.registerPushToken after the
  // Expo token is obtained + SecureStore-persisted. 401 surfaces as
  // {success:false} so callers can route to sign-in (see contract.test.ts).
  async uploadPushToken(params: { expoPushToken: string; platform: 'android' | 'ios' }): Promise<{ success: boolean; error?: string }> {
    try {
      if (!params?.expoPushToken) return { success: false, error: 'expoPushToken required' };
      const res = await fetchWithTimeout(`${API_BASE_URL}/backup/devices/push-token`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
        body: JSON.stringify(params),
      });
      return await safeParseResponse(res, { success: false });
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error uploading push token' };
    }
  },

  // 401 helper: true when a result looks like an auth rejection (invalid/expired
  // session). Callers (App sign-in gate, socket onUnauthorized) use this to
  // distinguish "sign in again" from transient network failures.
  isUnauthorizedError(result: any): boolean {
    const msg = String(result?.error || '').toLowerCase();
    return result?.status === 401 || msg.includes('unauthorized') || msg.includes('invalid or expired session') || msg.includes('missing or invalid authorization');
  },

  // Offline-first send: REST (durable DB persist) -> socket queue -> outbox.
  // Order matters: REST is the source of truth for persistence; the socket
  // queue only handles realtime delivery when REST is unreachable. `sendViaSocket`
  // and `enqueueOutbox` are injected so api.ts stays free of socket/outbox imports
  // (no queue logic lives here — this is pure ordering/orchestration).
  // Returns the first success, or the last failure if all paths fail.
  async sendMessageReliable(
    msg: WireMessage,
    opts?: {
      clientMessageId?: string;
      sendViaSocket?: (msg: WireMessage) => Promise<{ success: boolean; error?: string } | { queued: boolean }>;
      enqueueOutbox?: (msg: WireMessage) => Promise<void>;
    }
  ): Promise<{ success: boolean; via: 'rest' | 'socket' | 'outbox'; error?: string }> {
    assertWireMessage(msg);
    const clientMessageId = opts?.clientMessageId || (msg as Message).id;
    const rest = await api.sendMessage(msg, { clientMessageId });
    if (rest?.success) return { success: true, via: 'rest' };
    if (opts?.sendViaSocket) {
      try {
        const s = await opts.sendViaSocket(msg);
        if ((s as any)?.success || (s as any)?.queued) return { success: true, via: 'socket' };
      } catch {}
    }
    if (opts?.enqueueOutbox) {
      try {
        await opts.enqueueOutbox(msg);
        return { success: true, via: 'outbox' };
      } catch (e: any) {
        return { success: false, via: 'outbox', error: e?.message || rest?.error || 'All send paths failed' };
      }
    }
    return { success: false, via: 'rest', error: rest?.error || 'REST send failed and no fallback provided' };
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/notifications/poll`, {
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
      const res = await fetchWithTimeout(`${API_BASE_URL}/notifications/ack-call`, {
        method: 'POST',
        headers: await authedJsonHeaders(),
      });
      return await safeParseResponse(res, { success: false });
    } catch {
      return { success: false };
    }
  },
};
