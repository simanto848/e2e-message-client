import { ChatThread, EncryptedPayload, Message, UserProfile } from '../types';

// Benign decoy profile & threads displayed when unlocked via Duress PIN.
// Extracted from App.tsx so the root component stays focused on state wiring.

export const DECOY_ENCRYPTED_PAYLOAD: EncryptedPayload = {
  iv: 'decoy_iv',
  ciphertext: 'decoy_cipher',
  authTag: 'decoy_auth_tag',
  algorithm: 'x25519-xsalsa20-poly1305',
  senderPublicKey: 'decoy_pk',
  keyFingerprint: 'decoy_fp',
};

export const DECOY_USER: UserProfile = {
  id: 'decoy_operative',
  name: 'Alex Vance',
  handle: '@alex_v',
  avatar: '',
  statusMessage: 'Available for work',
  publicKey: 'decoy_public_key_77x89q21',
  fingerprintHash: 'D901 8832 4410 7621',
  inviteCodesRemaining: 0,
  isVerifiedMember: true,
  memberSince: 'Jan 2026',
  twoFactorEnabled: false,
  passkeyRegistered: false,
};

export const DECOY_PARTICIPANT_1: UserProfile = {
  id: 'decoy_p1',
  name: 'Sam Taylor',
  handle: '@sam_t',
  avatar: '',
  statusMessage: 'In a meeting',
  publicKey: 'decoy_pk_sam',
  fingerprintHash: '4481 9920 1123',
  inviteCodesRemaining: 0,
  isVerifiedMember: true,
  memberSince: 'Jan 2026',
  twoFactorEnabled: false,
  passkeyRegistered: false,
};

export const DECOY_PARTICIPANT_2: UserProfile = {
  id: 'decoy_p2',
  name: 'Project Notes',
  handle: '@notes_sync',
  avatar: '',
  statusMessage: 'Cloud archives',
  publicKey: 'decoy_pk_notes',
  fingerprintHash: '7721 3302 9901',
  inviteCodesRemaining: 0,
  isVerifiedMember: true,
  memberSince: 'Jan 2026',
  twoFactorEnabled: false,
  passkeyRegistered: false,
};

export const INITIAL_DECOY_CHATS: ChatThread[] = [
  {
    id: 'decoy_c1',
    participant: DECOY_PARTICIPANT_1,
    unreadCount: 0,
    disappearingTimer: 0,
    safetyNumber: '4481 9920 1123',
    isVerifiedSafetyNumber: true,
    notificationSettings: { muted: false, sound: 'default', showPreview: true, vibrate: true },
    privacySettings: { antiScreenshot: false, readReceipts: true, typingIndicator: true, incognitoKeyboard: false },
    pinned: true,
    lastMessage: {
      id: 'dm3',
      chatId: 'decoy_c1',
      senderId: 'decoy_p1',
      receiverId: 'decoy_operative',
      text: 'Sounds good, see you at the cafe tomorrow!',
      encryptedPayload: DECOY_ENCRYPTED_PAYLOAD,
      timestamp: Date.now() - 1000 * 60 * 35,
      status: 'read',
      disappearingTimer: 0,
    },
  },
  {
    id: 'decoy_c2',
    participant: DECOY_PARTICIPANT_2,
    unreadCount: 0,
    disappearingTimer: 0,
    safetyNumber: '7721 3302 9901',
    isVerifiedSafetyNumber: false,
    notificationSettings: { muted: true, sound: 'silent', showPreview: false, vibrate: false },
    privacySettings: { antiScreenshot: false, readReceipts: true, typingIndicator: false, incognitoKeyboard: false },
    pinned: false,
    lastMessage: {
      id: 'dn1',
      chatId: 'decoy_c2',
      senderId: 'decoy_operative',
      receiverId: 'decoy_p2',
      text: 'Remember to pick up the package on Friday.',
      encryptedPayload: DECOY_ENCRYPTED_PAYLOAD,
      timestamp: Date.now() - 1000 * 60 * 60 * 20,
      status: 'read',
      disappearingTimer: 0,
    },
  },
];

export const INITIAL_DECOY_MESSAGES: Record<string, Message[]> = {
  decoy_c1: [
    {
      id: 'dm1',
      chatId: 'decoy_c1',
      senderId: 'decoy_p1',
      receiverId: 'decoy_operative',
      text: 'Hey Alex! Are we still on for lunch tomorrow?',
      encryptedPayload: DECOY_ENCRYPTED_PAYLOAD,
      timestamp: Date.now() - 1000 * 60 * 45,
      status: 'read',
      disappearingTimer: 0,
    },
    {
      id: 'dm2',
      chatId: 'decoy_c1',
      senderId: 'decoy_operative',
      receiverId: 'decoy_p1',
      text: "Yes! Let's meet at the downtown cafe around 12:30.",
      encryptedPayload: DECOY_ENCRYPTED_PAYLOAD,
      timestamp: Date.now() - 1000 * 60 * 40,
      status: 'read',
      disappearingTimer: 0,
    },
    {
      id: 'dm3',
      chatId: 'decoy_c1',
      senderId: 'decoy_p1',
      receiverId: 'decoy_operative',
      text: 'Sounds good, see you at the cafe tomorrow!',
      encryptedPayload: DECOY_ENCRYPTED_PAYLOAD,
      timestamp: Date.now() - 1000 * 60 * 35,
      status: 'read',
      disappearingTimer: 0,
    },
  ],
  decoy_c2: [
    {
      id: 'dn1',
      chatId: 'decoy_c2',
      senderId: 'decoy_operative',
      receiverId: 'decoy_p2',
      text: 'Remember to pick up the package on Friday.',
      encryptedPayload: DECOY_ENCRYPTED_PAYLOAD,
      timestamp: Date.now() - 1000 * 60 * 60 * 20,
      status: 'read',
      disappearingTimer: 0,
    },
  ],
};
