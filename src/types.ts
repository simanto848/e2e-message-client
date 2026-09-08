export type DeviceType = 'phone' | 'tablet' | 'desktop';

export interface UserProfile {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  statusMessage: string;
  publicKey: string;
  invitedBy?: string;
  inviteCodesRemaining: number;
  isVerifiedMember: boolean;
  memberSince: string;
  twoFactorEnabled: boolean;
  passkeyRegistered: boolean;
  // NOTE: PIN/password material must never live on the profile object —
  // it travels only as discrete auth params (see api.login/register) so it
  // can't be cached, logged, or persisted with the user record.
  fingerprintHash: string;
  connectionStatus?: 'none' | 'connected' | 'pending_sent' | 'pending_received' | 'pending';
  blockScreenshots?: boolean;
  callVerification?: boolean;
  autoLockDelay?: number;
  backupFrequency?: BackupFrequency;
  lastActiveAt?: number;
}

// Seconds (0 = off). Max 604800 (7d). Presets (see utils/timerUtils.ts PRESET_TIMERS):
// 0,5,15,30,60,300,3600,28800 (8h),86400 (24h),604800 (7d). Custom hour:min values
// from DisappearingTimerModal are allowed up to the max; the server range-checks
// 0..604800 and returns 400 otherwise (server/src/routes/contacts.routes.ts).
export type DisappearingTimer = number;
export const MAX_DISAPPEARING_TIMER_S = 604800;

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  authTag: string;
  algorithm: string;
  senderPublicKey: string;
  keyFingerprint: string;
}

// Canonical attachment-type union. Keep in sync with server/src/routes/media.routes.ts
// ALLOWED_ATTACHMENT_TYPES (single allowlist) + server/src/types.ts Attachment.
// Upload path (/api/media/upload) accepts image|audio|video|document; 'call' is
// metadata-only (call-history log entry, see App.tsx logCallToChat) and must never
// be POSTed to /upload — it travels inside Message.attachment only.
export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'document' | 'audio' | 'video' | 'call';
  size: number;
  url: string;
  encrypted: boolean;
  encryptedPayload?: EncryptedPayload;
  duration?: number;
  waveform?: number[];
  mimeType?: string;
  // Only set when type === 'call'.
  callType?: 'audio' | 'video';
  callStatus?: 'completed' | 'declined' | 'missed';
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  receiverId: string;
  text: string;
  encryptedPayload: EncryptedPayload;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  disappearingTimer: DisappearingTimer;
  expiresAt?: number;
  isDeletedForEveryone?: boolean;
  deletedAt?: number;
  attachment?: Attachment;
  replyToId?: string;
  forwarded?: boolean;
  reactions?: { [emoji: string]: string[] };
  // Ephemeral-only local UI state — never sent to the server (wire Message.text
  // must stay '' and reactions sync via reactions map only). New code must use
  // the local* names; `reaction`/`keyMismatch` remain as deprecated aliases so
  // ChatBubble/ChatScreen keep compiling without an App.tsx rewrite.
  localReaction?: string;
  localKeyMismatch?: boolean;
  /** @deprecated use localReaction (ephemeral-only, never persisted) */
  reaction?: string;
  /** @deprecated use localKeyMismatch (ephemeral-only, never persisted) */
  keyMismatch?: boolean;
}

export type ChatThemeColor = 'emerald' | 'cyan' | 'indigo' | 'purple' | 'amber' | 'rose' | 'slate';
export type ChatBackgroundPattern = 'none' | 'dots' | 'grid' | 'circuit' | 'matrix' | 'waves' | 'hexagons';

export interface ChatCustomTheme {
  color: ChatThemeColor;
  pattern: ChatBackgroundPattern;
  patternOpacity?: number;
}

export interface ChatThread {
  id: string;
  participant: UserProfile;
  lastMessage?: Message;
  unreadCount: number;
  disappearingTimer: DisappearingTimer;
  safetyNumber: string;
  isVerifiedSafetyNumber: boolean;
  // The exact safety number last marked verified (null = never verified).
  // When set but different from safetyNumber, keys rotated since verification.
  verifiedSafetyNumber?: string | null;
  theme?: ChatCustomTheme;
  // NOTE: server getContacts currently returns hardcoded defaults for these two
  // blocks (muted:false/sound:default/showPreview:true + all-true privacy) — see
  // server/src/database.ts getContacts. Per-thread overrides are local-first for
  // now.
  // TODO(persist): add notifications/privacy columns (or a thread_settings table)
  // and round-trip them via PUT /contacts/thread-settings.
  notificationSettings: {
    muted: boolean;
    sound: 'default' | 'chime' | 'radar' | 'silent';
    showPreview: boolean;
    vibrate: boolean;
  };
  privacySettings: {
    antiScreenshot: boolean;
    readReceipts: boolean;
    typingIndicator: boolean;
    incognitoKeyboard: boolean;
  };
  pinned?: boolean;
  isTyping?: boolean;
}

export interface ContactRequestWithUser {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
  updatedAt: number;
  sender: UserProfile;
  receiver: UserProfile;
}

// Public directory DTO: minimal Pick (never fingerprintHash/pinCode/quota) +
// live connection status. Mirrors server GET /contacts/search + GET /auth/users
// (id,name,handle,avatar,statusMessage,publicKey,memberSince,isVerifiedMember).
export type SearchOperativeResult = Pick<
  UserProfile,
  'id' | 'name' | 'handle' | 'avatar' | 'statusMessage' | 'publicKey' | 'memberSince' | 'isVerifiedMember'
> & {
  connectionStatus: 'connected' | 'pending_sent' | 'pending_received' | 'none';
};

export interface LinkedDevice {
  id: string;
  userId: string;
  name: string;
  type: 'smartphone' | 'tablet' | 'laptop' | 'browser';
  os: string;
  lastActive: number;
  ipAddress: string;
  currentDevice: boolean;
  verifiedWithPasskey: boolean;
  // Expo push routing (server POST /api/backup/devices/push-token). Optional:
  // absent until registerPushToken succeeds on a physical device.
  expoPushToken?: string;
  platform?: 'android' | 'ios';
}

export interface InviteCode {
  code: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  used: boolean;
  usedBy?: string;
  usedAt?: number;
  expiresAt: number;
}

export interface CallState {
  active: boolean;
  type: 'audio' | 'video';
  status: 'ringing' | 'connected' | 'ended';
  remoteUser?: UserProfile;
  isIncoming: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  isFrontCamera: boolean;
  duration: number;
  sasVerificationWords: string[];
  // True when the underlying WebRTC connection has dropped to 'disconnected'
  // or 'failed' mid-call (see RTCPeerConnection.connectionState) — the call
  // isn't necessarily over yet (ICE can recover), so this drives a
  // "Reconnecting..." banner rather than ending the call outright.
  isReconnecting: boolean;
  // Last raw RTCPeerConnection connection state seen ('new' | 'connecting' |
  // 'connected' | 'disconnected' | 'failed' | 'closed'). Drives the call
  // quality pill; undefined until the first transition arrives.
  iceState?: string;
}

export type BackupFrequency = 'daily' | 'weekly' | 'monthly' | 'off';

export interface CloudBackupMetadata {
  lastBackupTime: number | null;
  totalMessagesCount: number;
  totalChatsCount: number;
  backupSizeKb: number;
  backupVersion: string;
  autoBackupEnabled: boolean;
  backupFrequency: BackupFrequency;
  encryptionAlgorithm: string;
  keyFingerprint: string;
}

