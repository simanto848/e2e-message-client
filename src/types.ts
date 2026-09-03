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
  pinCode?: string;
  fingerprintHash: string;
  connectionStatus?: 'none' | 'connected' | 'pending_sent' | 'pending_received' | 'pending';
}

export type DisappearingTimer = 0 | 5 | 15 | 30 | 60 | 300 | 3600 | 86400; // seconds (0 = off)

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  authTag: string;
  algorithm: string;
  senderPublicKey: string;
  keyFingerprint: string;
}

export interface Attachment {
  id: string;
  name: string;
  // 'call' is a call-history log entry (see App.tsx's logCallToChat), not a
  // real file — reuses this field instead of a separate DB column/message
  // type, the same way image/audio attachments already piggyback on it.
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
  reactions?: { [emoji: string]: string[] };
  reaction?: string;
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
  theme?: ChatCustomTheme;
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

export interface SearchOperativeResult extends UserProfile {
  connectionStatus: 'connected' | 'pending_sent' | 'pending_received' | 'none';
}

export interface LinkedDevice {
  id: string;
  name: string;
  type: 'smartphone' | 'tablet' | 'laptop' | 'browser';
  os: string;
  lastActive: number;
  ipAddress: string;
  currentDevice: boolean;
  verifiedWithPasskey: boolean;
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
}

export interface CloudBackupMetadata {
  lastBackupTime: number | null;
  totalMessagesCount: number;
  totalChatsCount: number;
  backupSizeKb: number;
  backupVersion: string;
  autoBackupEnabled: boolean;
  encryptionAlgorithm: string;
  keyFingerprint: string;
}
