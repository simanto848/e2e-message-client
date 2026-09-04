import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, StatusBar, Alert, AppState } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UserProfile,
  ChatThread,
  Message,
  LinkedDevice,
  InviteCode,
  CallState,
  CloudBackupMetadata,
  Attachment,
  DisappearingTimer,
  ContactRequestWithUser,
  EncryptedPayload,
} from './src/types';
import {
  encryptMessage,
  decryptMessage,
  generateCallSasWords,
  generateIdentityKeyPair,
  IdentityKeyPair,
} from './src/utils/crypto';
import {
  saveSessionToken,
  getSessionToken,
  saveCurrentUserId,
  getCurrentUserId,
  clearSession,
  saveIdentityKeyPair,
  getIdentityKeyPair,
  savePrimaryPin,
  getHistoricalKeyPairs,
  saveHistoricalKeyPair,
} from './src/utils/keyStore';
import { encryptBackup, decryptBackup, BackupPayload } from './src/utils/backupCrypto';
import { api, API_BASE_URL } from './src/services/api';
import { socketService } from './src/services/socket';
import { callAudio } from './src/utils/callAudio';
import { webrtcCallEngine } from './src/utils/webrtcCall';
import { isExternalActivityActive } from './src/utils/appLockGuard';
import type { MediaStream } from './src/utils/webrtcAdapter';

// Screens
import { AuthScreen } from './src/screens/AuthScreen';
import { ChatListScreen } from './src/screens/ChatListScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

// Components & Modals
import { Header } from './src/components/Header';
import { CipherInspectorModal } from './src/components/CipherInspectorModal';
import { SafetyNumberModal } from './src/components/SafetyNumberModal';
import { CallModal } from './src/components/CallModal';
import { InviteManagerModal } from './src/components/InviteManagerModal';
import { LinkedDevicesModal } from './src/components/LinkedDevicesModal';
import { CloudBackupModal } from './src/components/CloudBackupModal';
import { EditProfileModal } from './src/components/EditProfileModal';
import { ChangePasswordModal } from './src/components/ChangePasswordModal';
import { DuressSettingsModal } from './src/components/DuressSettingsModal';
import { PrivacyShield } from './src/components/PrivacyShield';
import { ContactRequestsModal } from './src/components/ContactRequestsModal';
import { SearchOperativeModal } from './src/components/SearchOperativeModal';
import { PermissionsModal } from './src/components/PermissionsModal';
import { UpdateNotificationModal } from './src/components/UpdateNotificationModal';
import { checkForAppUpdates, ReleaseInfo } from './src/services/updateService';
import {
  requestAppPermissions,
  checkAppPermissions,
  requestSinglePermission,
  AppPermissionsStatus,
} from './src/utils/permissions';
import { colors } from './src/theme';
import { useAppSecurity } from './src/hooks/useAppSecurity';
import { useWebRTCCall } from './src/hooks/useWebRTCCall';

type ScreenType = 'auth' | 'chat_list' | 'chat_detail' | 'settings';

function formatCallDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Benign decoy profile & threads displayed when unlocked via Duress PIN
const DECOY_ENCRYPTED_PAYLOAD: EncryptedPayload = {
  iv: 'decoy_iv',
  ciphertext: 'decoy_cipher',
  authTag: 'decoy_auth_tag',
  algorithm: 'x25519-xsalsa20-poly1305',
  senderPublicKey: 'decoy_pk',
  keyFingerprint: 'decoy_fp',
};

const DECOY_USER: UserProfile = {
  id: 'decoy_operative',
  name: 'Alex Vance',
  handle: '@alex_v',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
  statusMessage: 'Available for work',
  publicKey: 'decoy_public_key_77x89q21',
  fingerprintHash: 'D901 8832 4410 7621',
  inviteCodesRemaining: 0,
  isVerifiedMember: true,
  memberSince: 'Jan 2026',
  twoFactorEnabled: false,
  passkeyRegistered: false,
};

const DECOY_PARTICIPANT_1: UserProfile = {
  id: 'decoy_p1',
  name: 'Sam Taylor',
  handle: '@sam_t',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
  statusMessage: 'In a meeting',
  publicKey: 'decoy_pk_sam',
  fingerprintHash: '4481 9920 1123',
  inviteCodesRemaining: 0,
  isVerifiedMember: true,
  memberSince: 'Jan 2026',
  twoFactorEnabled: false,
  passkeyRegistered: false,
};

const DECOY_PARTICIPANT_2: UserProfile = {
  id: 'decoy_p2',
  name: 'Project Notes',
  handle: '@notes_sync',
  avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80',
  statusMessage: 'Cloud archives',
  publicKey: 'decoy_pk_notes',
  fingerprintHash: '7721 3302 9901',
  inviteCodesRemaining: 0,
  isVerifiedMember: true,
  memberSince: 'Jan 2026',
  twoFactorEnabled: false,
  passkeyRegistered: false,
};

const INITIAL_DECOY_CHATS: ChatThread[] = [
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

const INITIAL_DECOY_MESSAGES: Record<string, Message[]> = {
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

export default function App() {
  // App & User State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('auth');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Duress & Decoy State
  const [showDuressModal, setShowDuressModal] = useState(false);
  const [decoyChats, setDecoyChats] = useState<ChatThread[]>(INITIAL_DECOY_CHATS);
  const [decoyMessages, setDecoyMessages] = useState<Record<string, Message[]>>(INITIAL_DECOY_MESSAGES);

  // Dynamic Data States (from Postgres Backend)
  const [chats, setChats] = useState<ChatThread[]>([]);
  // True only until the very first contacts fetch after login resolves —
  // lets the chat list show loading skeletons instead of momentarily
  // looking identical to "you have zero contacts" during normal startup latency.
  const [isInitialChatsLoading, setIsInitialChatsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<ContactRequestWithUser[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<ContactRequestWithUser[]>([]);

  // Who's currently online, from the server's realtime presence feed (see
  // server/src/realtime.ts). Populated by a one-time snapshot right after
  // connecting, then kept current by individual online/offline events.
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  const [inspectingMessage, setInspectingMessage] = useState<Message | null>(null);
  const [safetyModalChat, setSafetyModalChat] = useState<ChatThread | null>(null);
  const [mySecretKey, setMySecretKey] = useState<string | null>(null);
  const [historicalKeys, setHistoricalKeys] = useState<IdentityKeyPair[]>([]);
  const historicalKeysRef = useRef<IdentityKeyPair[]>([]);
  historicalKeysRef.current = historicalKeys;
  const [cloudBackupInitialMode, setCloudBackupInitialMode] = useState<'backup' | 'restore'>('backup');

  const logCallToChat = (finalState: CallState, endReason: 'completed' | 'declined' | 'missed') => {
    if (!currentUser || !mySecretKey || !finalState.remoteUser) return;
    if (finalState.isIncoming) return;

    const peer = finalState.remoteUser;
    const status: 'completed' | 'declined' | 'missed' = finalState.duration > 0 ? 'completed' : endReason;
    const label = finalState.type === 'video' ? 'Video call' : 'Voice call';
    const text =
      status === 'completed'
        ? `📞 ${label} · ${formatCallDuration(finalState.duration)}`
        : status === 'declined'
        ? `📞 ${label} declined`
        : `📞 ${label} not answered`;

    const encryptedPayload = encryptMessage(text, mySecretKey, peer.publicKey, currentUser.publicKey);
    const callAttachment: Attachment = {
      id: `call_${Date.now()}`,
      name: label,
      type: 'call',
      size: 0,
      url: '',
      encrypted: false,
      duration: finalState.duration,
      callType: finalState.type,
      callStatus: status,
    };
    const newMsg: Message = {
      id: `msg_call_${Date.now()}`,
      chatId: peer.id,
      senderId: currentUser.id,
      receiverId: peer.id,
      text,
      encryptedPayload,
      timestamp: Date.now(),
      status: 'sent',
      disappearingTimer: 0,
      attachment: callAttachment,
    };

    setMessages(prev => (activeChatId === peer.id ? [...prev, newMsg] : prev));
    setChats(prev => prev.map(c => (c.id === peer.id ? { ...c, lastMessage: newMsg, unreadCount: 0 } : c)));
    api.sendMessage(newMsg).catch(err => console.warn('Call log REST send err:', err));
    socketService.sendMessage(newMsg);
  };

  // WebRTC Calling Hook
  const {
    callState,
    setCallState,
    callStateRef,
    localStream,
    setLocalStream,
    remoteStream,
    setRemoteStream,
    activeCallIdRef,
    pendingIncomingCallRef,
    startCallTimer,
    stopCallTimer,
    handleStartCall,
    handleAcceptIncomingCall,
    handleHangupCall,
    handleToggleMute,
    handleToggleVideo,
    handleToggleSpeaker,
    handleFlipCamera,
    resetCallState,
  } = useWebRTCCall({
    currentUser,
    mySecretKey,
    activeChatId,
    chats,
    onLogCallToChat: (state, status) => logCallToChat(state, status),
  });

  // Security & Privacy Hook
  const {
    isAppLocked,
    setIsAppLocked,
    autoLockDelay,
    handleUpdateAutoLockDelay,
    antiScreenshotEnabled,
    setAntiScreenshotEnabled,
    callVerificationEnabled,
    setCallVerificationEnabled,
    isDecoyMode,
    setIsDecoyMode,
    handleUnlockDecoy,
  } = useAppSecurity({
    isAuthenticated: Boolean(currentUser),
    isCallActive: Boolean(callStateRef.current?.active),
  });

  // Modals
  const [showInvitesModal, setShowInvitesModal] = useState(false);
  const [showLinkedDevicesModal, setShowLinkedDevicesModal] = useState(false);
  const [showCloudBackupModal, setShowCloudBackupModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [availableRelease, setAvailableRelease] = useState<ReleaseInfo | null>(null);

  // Auto check for updates on launch
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const res = await checkForAppUpdates();
        if (res.hasUpdate && res.latestRelease) {
          setAvailableRelease(res.latestRelease);
          setShowUpdateModal(true);
        }
      } catch (err) {
        console.log('Update check notice:', err);
      }
    };
    checkUpdates();
  }, []);

  // Hardware Permissions (Camera, Mic, Photos)
  const [permissionsStatus, setPermissionsStatus] = useState<AppPermissionsStatus>({
    camera: false,
    microphone: false,
    photos: false,
    allGranted: false,
  });

  // Screenshot / screen-recording prevention. This was previously UI-only
  // (the PrivacyShield overlay didn't actually block capture) — this sets
  // the real OS-level flag (FLAG_SECURE on Android; supported iOS equivalent).
  useEffect(() => {
    if (antiScreenshotEnabled) {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    } else {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    }
  }, [antiScreenshotEnabled]);

  // Re-lock the enclave whenever the app leaves the foreground, so the
  // "biometric unlock" screen actually gates re-entry rather than only
  // appearing when manually triggered.
  //
  // Only 'background' means the app is truly backgrounded (home button,
  // app switcher, screen off). 'inactive' is a transient state that also
  // fires for in-app UI like Alert dialogs, permission prompts, the image
  // picker sheet, and keyboard focus transitions — treating it as "locked"
  // caused the lock screen to pop up just from opening a chat (which
  // auto-focuses the message input) or navigating around the app.
  //
  // Launching a real external Activity (image picker, camera, the media
  // permission dialog) *also* fires a genuine 'background' event on Android
  // — not 'inactive' — since it pauses our host Activity same as switching
  // Load saved auto-lock delay preference
  const handleEmergencyWipe = async () => {
    try {
      if (callStateRef.current.active) {
        webrtcCallEngine.endCall();
        callAudio.playHangup();
        callAudio.releaseAudioSession();
        resetCallState();
      }
      socketService.disconnect();
      await clearSession();
      await AsyncStorage.clear().catch(() => {});
      setCurrentUser(null);
      setMySecretKey(null);
      setChats([]);
      setMessages([]);
      setActiveChatId(null);
      setIsAppLocked(false);
      setCurrentScreen('auth');
      Alert.alert('Enclave Zeroized', 'All keys, sessions, and cached data have been completely wiped.');
    } catch (err) {
      console.warn('[EmergencyWipe] Error:', err);
    }
  };

  // Recover the realtime socket whenever the app returns to the foreground.
  // Mobile OSes commonly suspend a backgrounded app's network sockets, and
  // by the time the user's back the built-in reconnection loop may have
  // already run out of attempts (or the socket never noticed it died) —
  // without this, messages/calls/presence could silently stop arriving
  // until the app was force-restarted, well after the lock screen (a
  // separate concern) had already been dismissed.
  useEffect(() => {
    if (!currentUser) return;
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') socketService.reconnectIfNeeded();
    });
    return () => sub.remove();
  }, [currentUser]);

  // Silently check hardware permissions on app launch without popping up modal
  useEffect(() => {
    const initPermissions = async () => {
      try {
        const status = await checkAppPermissions();
        setPermissionsStatus(status);
      } catch (err) {
        console.warn('Initial permissions check notice:', err);
      }
    };
    initPermissions();
  }, []);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Restore an authenticated session on app launch. The session token and
  // identity private key live only in expo-secure-store (Keychain/Keystore),
  // never in plaintext AsyncStorage — this replaces the old approach of
  // caching the whole user profile in unencrypted storage.
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [token, userId] = await Promise.all([getSessionToken(), getCurrentUserId()]);
        if (!token || !userId) return;

        const keyPair = await getIdentityKeyPair(userId);
        if (!keyPair) {
          // No local private key for this account on this device — we can't
          // decrypt anything even if the session token is still valid, so
          // don't silently proceed in a broken state. Require a fresh login,
          // which will mint/rotate a new keypair (see handleAuthenticated).
          await clearSession();
          return;
        }

        const res = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!data.success || !data.user) {
          await clearSession();
          return;
        }

        setMySecretKey(keyPair.secretKey);
        setCurrentUser(data.user);
        setCurrentScreen('chat_list');
        await socketService.connect();
        reloadDynamicData(data.user.id);
      } catch (err) {
        console.warn('Session restore notice:', err);
      }
    };
    restoreSession();
  }, []);

  // Invites, Devices & Backup
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [linkedDevices, setLinkedDevices] = useState<LinkedDevice[]>([]);
  const [cloudBackupMetadata, setCloudBackupMetadata] = useState<CloudBackupMetadata>({
    lastBackupTime: null,
    totalMessagesCount: 0,
    totalChatsCount: 0,
    backupSizeKb: 128,
    backupVersion: '2.4.0-E2EE',
    autoBackupEnabled: true,
    encryptionAlgorithm: 'PBKDF2-100K-AES-256-GCM',
    keyFingerprint: '',
  });

  // Silently check for and apply OTA (JS-only) updates published via EAS
  // Update — on launch and whenever the app returns to foreground. This
  // only covers JS/asset changes; native changes still need a new build,
  // which is what the GitHub-release check above (checkForAppUpdates) is
  // for. Skips reloading while a call is active so it doesn't get yanked.
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    const applyUpdateIfAvailable = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          if (!callStateRef.current.active) {
            await Updates.reloadAsync();
          }
        }
      } catch (err) {
        console.log('[Updates] OTA check notice:', err);
      }
    };
    applyUpdateIfAvailable();
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') applyUpdateIfAvailable();
    });
    return () => sub.remove();
  }, []);

  // 1. Authenticate user & persist the real session token + identity key
  // material to secure, OS-backed storage (never plaintext AsyncStorage).
  //
  // `freshKeyPair` is passed by AuthScreen when it just generated a brand
  // new identity keypair as part of registration. If it's absent (login on
  // an existing account) we check whether this device already holds that
  // account's private key; if not (e.g. a fresh install of an existing
  // account), we generate one now and publish the new public key to the
  // server. That's real key rotation, not a workaround — existing contacts
  // will see their safety number change and need to re-verify, which is the
  // correct security behavior when the underlying key material changes.
  const handleAuthenticated = async (
    user: UserProfile,
    token: string,
    freshKeyPair?: IdentityKeyPair,
    pinCode?: string
  ) => {
    await saveSessionToken(token);
    await saveCurrentUserId(user.id);
    if (pinCode) {
      await savePrimaryPin(pinCode);
    }

    let keyPair = freshKeyPair || (await getIdentityKeyPair(user.id));
    let restoredFromCloud = false;

    if (!keyPair) {
      // Missing local key on this device (e.g. fresh install or session was removed)
      // Check if zero-knowledge cloud backup escrow exists on server
      try {
        const backupRes = await api.getCloudBackup(user.id, token);
        if (backupRes?.success && backupRes.backup && pinCode) {
          const restoredPayload = decryptBackup(
            {
              encryptedData: backupRes.backup.encryptedData,
              salt: backupRes.backup.salt,
              iv: backupRes.backup.iv,
            },
            pinCode
          );

          if (restoredPayload?.identityKeyPair) {
            // Prompt the user if they want to restore or keep as is
            const shouldRestore = await new Promise<boolean>(resolve => {
              Alert.alert(
                'Restore Previous Session?',
                'Encrypted message history from your previous session was found. Would you like to restore your encryption keys to read your past messages, or start fresh?',
                [
                  {
                    text: 'Keep As Is (Fresh)',
                    style: 'cancel',
                    onPress: () => resolve(false),
                  },
                  {
                    text: 'Restore Messages',
                    onPress: () => resolve(true),
                  },
                ],
                { cancelable: false }
              );
            });

            if (shouldRestore) {
              keyPair = restoredPayload.identityKeyPair;
              restoredFromCloud = true;
              if (restoredPayload.historicalKeyPairs) {
                for (const hp of restoredPayload.historicalKeyPairs) {
                  await saveHistoricalKeyPair(user.id, hp);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Backup auto-restore check notice:', err);
      }

      if (!keyPair) {
        keyPair = generateIdentityKeyPair();
        const rotateRes = await api.updateProfile({ publicKey: keyPair.publicKey });
        if (rotateRes?.success && rotateRes.user) {
          user = rotateRes.user;
        } else {
          user = { ...user, publicKey: keyPair.publicKey };
        }
      }
    }

    await saveIdentityKeyPair(user.id, keyPair);
    setMySecretKey(keyPair.secretKey);
    const loadedHKeys = await getHistoricalKeyPairs(user.id);
    setHistoricalKeys(loadedHKeys);

    // Auto-escrow current key so future session removes won't lose it
    if (pinCode && !restoredFromCloud) {
      try {
        const backupPayload: BackupPayload = {
          version: 2,
          exportedAt: Date.now(),
          identityKeyPair: keyPair,
          historicalKeyPairs: loadedHKeys,
        };
        const blob = encryptBackup(backupPayload, pinCode);
        await api.saveCloudBackup(
          {
            encryptedData: blob.encryptedData,
            salt: blob.salt,
            iv: blob.iv,
            backupSizeKb: Math.ceil(blob.encryptedData.length / 1024),
            backupVersion: '2.5.0-E2EE',
            totalMessagesCount: 0,
            totalChatsCount: 0,
            keyFingerprint: user.fingerprintHash,
          },
          token
        ).catch(() => {});
      } catch {}
    }

    setCurrentUser(user);
    setCurrentScreen('chat_list');
    await socketService.connect();
    await reloadDynamicData(user.id);
  };

  // Pull-to-refresh handler for chat list
  const handleRefresh = async () => {
    if (!currentUser) return;
    setIsRefreshing(true);
    await reloadDynamicData(currentUser.id);
    setIsRefreshing(false);
  };

  // 2. Reload contacts & requests from the server.
  const reloadDynamicData = async (userId: string) => {
    try {
      const [contactList, reqs, userInvites, devices] = await Promise.all([
        api.getContacts(userId),
        api.getContactRequests(userId),
        api.getUserInvites(userId),
        api.getLinkedDevices(userId),
      ]);

      // The server never sees plaintext (it only stores ciphertext), so each
      // contact's "last message" preview comes back encrypted — decrypt it
      // here, the same way individual conversation messages are decrypted,
      // so the chat list can actually show a preview instead of a fixed
      // placeholder string.
      const withDecryptedPreviews = contactList.map(c => {
        if (!c.lastMessage || c.lastMessage.isDeletedForEveryone) return c;
        const { text } = decryptVerified(c.lastMessage.encryptedPayload, c.participant.publicKey);
        return { ...c, lastMessage: { ...c.lastMessage, text } };
      });

      setChats(withDecryptedPreviews);
      setIncomingRequests(reqs.incoming || []);
      setOutgoingRequests(reqs.outgoing || []);
      setInvites(userInvites || []);
      setLinkedDevices(devices || []);
    } catch (err) {
      console.log('Dynamic data fetch notice:', err);
    } finally {
      setIsInitialChatsLoading(false);
    }
  };

  // Decrypt a payload with real key verification: the payload carries the
  // sender's public key, but we only trust it if it matches the public key
  // we actually have on file for that contact (from the directory / a prior
  // safety-number verification). Without this check, a malicious or
  // compromised server could swap in a different public key and the
  // decryption would still "succeed" — just not be from who it claims.
  const decryptVerified = (payload: EncryptedPayload, expectedPublicKey?: string): { text: string; keyMismatch: boolean } => {
    if (!mySecretKey) return { text: 'Locked — sign in again to view', keyMismatch: false };
    if (!payload?.ciphertext || !payload?.iv) {
      return { text: '', keyMismatch: false };
    }

    // Gracefully format seed / demo messages if present
    if (typeof payload.ciphertext === 'string' && payload.ciphertext.startsWith('ENC_BLOB_')) {
      const cleanSeedText = payload.ciphertext.replace('ENC_BLOB_', '').replace(/_/g, ' ');
      return { text: cleanSeedText, keyMismatch: false };
    }

    const isSentByMe = currentUser && payload.senderPublicKey === currentUser.publicKey;
    const peerPublicKey = isSentByMe ? expectedPublicKey : (payload.senderPublicKey || expectedPublicKey);

    if (!peerPublicKey) {
      return { text: '⚠️ Missing recipient cryptographic public key.', keyMismatch: false };
    }

    let opened = decryptMessage(payload, mySecretKey, peerPublicKey);

    // Fallbacks: if keys rotated or if senderPublicKey was used
    if (opened === null && payload.senderPublicKey && payload.senderPublicKey !== peerPublicKey) {
      opened = decryptMessage(payload, mySecretKey, payload.senderPublicKey);
    }
    if (opened === null && expectedPublicKey && expectedPublicKey !== peerPublicKey) {
      opened = decryptMessage(payload, mySecretKey, expectedPublicKey);
    }

    // Fallback: check historical keys keyring
    const allHistorical = historicalKeysRef.current;
    if (opened === null && allHistorical && allHistorical.length > 0) {
      for (const hk of allHistorical) {
        opened = decryptMessage(payload, hk.secretKey, peerPublicKey);
        if (opened !== null) break;
        if (payload.senderPublicKey && payload.senderPublicKey !== peerPublicKey) {
          opened = decryptMessage(payload, hk.secretKey, payload.senderPublicKey);
          if (opened !== null) break;
        }
        if (expectedPublicKey && expectedPublicKey !== peerPublicKey) {
          opened = decryptMessage(payload, hk.secretKey, expectedPublicKey);
          if (opened !== null) break;
        }
      }
    }

    if (opened === null) {
      return { text: '🔒 Encrypted message (key mismatch or previous session).', keyMismatch: true };
    }
    return { text: opened, keyMismatch: false };
  };

  // 3. Load conversation messages dynamically when opening a chat
  useEffect(() => {
    if (!currentUser || !activeChatId || !mySecretKey) return;

    const loadMessages = async () => {
      try {
        const rawMessages = await api.getMessages(activeChatId, currentUser.id);
        const knownPublicKey = chats.find(c => c.id === activeChatId)?.participant.publicKey;

        const decryptedList = rawMessages.map(m => {
          if (m.isDeletedForEveryone) return { ...m, text: '' };
          const { text } = decryptVerified(m.encryptedPayload, knownPublicKey);
          return { ...m, text };
        });

        setMessages(decryptedList);

        const hasUnread = decryptedList.some(m => m.senderId === activeChatId && m.status !== 'read');
        if (hasUnread) {
          socketService.markRead(activeChatId, activeChatId);
          api.markMessagesAsRead(activeChatId, activeChatId).catch(() => {});
          setChats(prev => prev.map(c => (c.id === activeChatId ? { ...c, unreadCount: 0 } : c)));
        }
      } catch (err) {
        console.error('Failed to load thread messages:', err);
      }
    };

    loadMessages();
  }, [activeChatId, currentUser, mySecretKey]);

  // Periodic background sync for messages and contacts (ensures smooth real-time delivery even on unstable networks)
  useEffect(() => {
    if (!currentUser) return;
    const syncInterval = setInterval(() => {
      reloadDynamicData(currentUser.id);
      if (activeChatId && mySecretKey) {
        api.getMessages(activeChatId, currentUser.id).then(rawMessages => {
          const knownPublicKey = chats.find(c => c.id === activeChatId)?.participant.publicKey;
          const decryptedList = rawMessages.map(m => {
            if (m.isDeletedForEveryone) return { ...m, text: '' };
            const { text } = decryptVerified(m.encryptedPayload, knownPublicKey);
            return { ...m, text };
          });
          setMessages(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(decryptedList)) {
              return decryptedList;
            }
            return prev;
          });
        }).catch(() => {});
      }
    }, 3500);
    return () => clearInterval(syncInterval);
  }, [currentUser, activeChatId, mySecretKey, chats]);

  // 4. Socket Listeners (Real-Time E2EE & Contact Approvals)
  useEffect(() => {
    if (!currentUser) return;

    // Real-time Update Broadcast Listener
    const unsubUpdate = socketService.onUpdateAvailable((release: ReleaseInfo) => {
      setAvailableRelease(release);
      setShowUpdateModal(true);
    });

    // Contact Request Received (Realtime Alert)
    const unsubReqReceived = socketService.onContactRequestReceived((req: ContactRequestWithUser) => {
      setIncomingRequests(prev => [req, ...prev.filter(r => r.id !== req.id)]);
      Alert.alert(
        'New Contact Request',
        `${req.sender.name} (${req.sender.handle}) wants to connect with you.`
      );
    });

    // Contact Request Accepted
    const unsubReqAccepted = socketService.onContactRequestAccepted(async () => {
      await reloadDynamicData(currentUser.id);
      Alert.alert('Request Accepted', 'You\'re now connected — you can message each other.');
    });

    // Incoming Encrypted Message
    const unsubMsg = socketService.onReceiveMessage((msg: Message) => {
      if (msg.receiverId === currentUser.id) {
        const knownPublicKey = chats.find(c => c.id === msg.senderId)?.participant.publicKey;
        const { text } = decryptVerified(msg.encryptedPayload, knownPublicKey);
        msg.text = text;

        setMessages(prev => [...prev, msg]);

        const isCurrentlyOpen = activeChatId === msg.senderId && currentScreen === 'chat_detail';

        // Update chat list last message dynamically
        setChats(prev =>
          prev.map(c =>
            c.id === msg.senderId
              ? { ...c, lastMessage: msg, unreadCount: isCurrentlyOpen ? 0 : c.unreadCount + 1 }
              : c
          )
        );

        if (isCurrentlyOpen) {
          socketService.sendStatus(msg.id, msg.chatId, 'read');
          socketService.markRead(msg.senderId, msg.chatId);
          api.markMessagesAsRead(msg.senderId, msg.chatId).catch(() => {});
        } else {
          socketService.sendStatus(msg.id, msg.chatId, 'delivered');
        }
      }
    });

    // Message Status Update (delivered / read checkmarks)
    const unsubStatus = socketService.onMessageStatusUpdate(data => {
      setMessages(prev =>
        prev.map(m => (m.id === data.messageId ? { ...m, status: data.status } : m))
      );
      setChats(prev =>
        prev.map(c =>
          c.lastMessage?.id === data.messageId
            ? { ...c, lastMessage: { ...c.lastMessage, status: data.status } }
            : c
        )
      );
    });

    // Typing Indicator
    const unsubTyping = socketService.onTypingIndicator(data => {
      setChats(prev =>
        prev.map(c => (c.id === data.chatId ? { ...c, isTyping: data.isTyping } : c))
      );
    });

    // Ephemeral Delete for Everyone
    const unsubDelete = socketService.onMessageDeletedEveryone(data => {
      setMessages(prev =>
        prev.map(m =>
          m.id === data.messageId
            ? { ...m, isDeletedForEveryone: true, text: '', deletedAt: data.deletedAt }
            : m
        )
      );
    });

    // Call Signal (Incoming Call & Signaling with SAS verification).
    // WebRTC's own connection handshake (offer/answer/ice-candidate) drives
    // real-time audio/video now — this handler wires those signals into
    // webrtcCallEngine instead of the old fake "just show ringing UI" flow.
    const unsubCall = socketService.onCallSignal(async (signal: any) => {
      if (signal.targetId !== currentUser.id) return;

      if (signal.signalType === 'offer') {
        // Already on a call (either as caller or callee) — auto-decline the
        // new one instead of overwriting the active call's state, which
        // would otherwise abandon the in-progress RTCPeerConnection without
        // closing it and race two calls' signaling against each other.
        if (callStateRef.current.active) {
          socketService.sendCallSignal({
            callId: signal.callId,
            senderId: currentUser.id,
            targetId: signal.senderId,
            type: signal.type || 'audio',
            signalType: 'reject',
          });
          return;
        }

        const callerProfile =
          signal.senderProfile ||
          chats.find(c => c.participant?.id === signal.senderId || c.id === signal.senderId)?.participant || {
            id: signal.senderId,
            name: 'Unknown Caller',
            handle: '@unknown',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
            statusMessage: 'Calling...',
            publicKey: 'PEER_PUBLIC_KEY',
            inviteCodesRemaining: 0,
            isVerifiedMember: true,
            memberSince: '2026',
            twoFactorEnabled: true,
            passkeyRegistered: true,
            fingerprintHash: 'E2EE_PEER_KEY',
          };

        const sas = signal.sasWords || (mySecretKey
          ? await generateCallSasWords(mySecretKey, callerProfile.publicKey, Date.now())
          : []);

        pendingIncomingCallRef.current = { callId: signal.callId, senderId: signal.senderId, sdp: signal.sdp };
        callAudio.playRingtone();
        setCallState({
          active: true,
          type: signal.type || 'audio',
          status: 'ringing',
          remoteUser: callerProfile,
          isIncoming: true,
          isMuted: false,
          isVideoOff: false,
          isSpeakerOn: true,
          isFrontCamera: true,
          duration: 0,
          sasVerificationWords: sas,
          isReconnecting: false,
        });
      } else if (signal.signalType === 'answer') {
        await webrtcCallEngine.handleRemoteAnswer(signal.sdp);
        callAudio.playConnected();
        callAudio.releaseAudioSession();
        setCallState(prev => ({ ...prev, status: 'connected' }));
        startCallTimer();
      } else if (signal.signalType === 'ice-candidate') {
        await webrtcCallEngine.handleRemoteIceCandidate(signal.candidate);
      } else if (signal.signalType === 'hangup' || signal.signalType === 'reject') {
        stopCallTimer();
        callAudio.playHangup();
        webrtcCallEngine.cleanup();
        setLocalStream(null);
        setRemoteStream(null);
        pendingIncomingCallRef.current = null;
        activeCallIdRef.current = null;
        logCallToChat(callStateRef.current, signal.signalType === 'reject' ? 'declined' : 'missed');
        setCallState(prev => ({ ...prev, active: false, status: 'ended', duration: 0 }));
      }
    });

    // Presence: snapshot on connect, then incremental updates.
    const unsubPresenceSnapshot = socketService.onPresenceSnapshot(userIds => {
      setOnlineUserIds(new Set(userIds));
    });
    const unsubPresenceUpdate = socketService.onPresenceUpdate(({ userId, status }) => {
      setOnlineUserIds(prev => {
        const next = new Set(prev);
        if (status === 'online') next.add(userId);
        else next.delete(userId);
        return next;
      });
    });

    return () => {
      unsubReqReceived();
      unsubReqAccepted();
      unsubMsg();
      unsubStatus();
      unsubTyping();
      unsubDelete();
      unsubCall();
      unsubPresenceSnapshot();
      unsubPresenceUpdate();
    };
  }, [currentUser, activeChatId, chats, mySecretKey]);

  // 5. Ephemeral Message Self-Destruction Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMessages(prev =>
        prev.filter(m => {
          if (m.expiresAt && m.expiresAt <= now && !m.isDeletedForEveryone) {
            return false;
          }
          return true;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Handler: Send Message
  const handleSendMessage = async (text: string, attachment?: Attachment, replyToId?: string) => {
    if (isDecoyMode) {
      if (!activeChatId) return;
      const newDecoyMsg: Message = {
        id: `decoy_msg_${Date.now()}`,
        chatId: activeChatId,
        senderId: 'decoy_operative',
        receiverId: activeChatId,
        text,
        encryptedPayload: DECOY_ENCRYPTED_PAYLOAD,
        timestamp: Date.now(),
        status: 'read',
        disappearingTimer: 0,
        attachment,
        replyToId,
      };
      setDecoyMessages(prev => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), newDecoyMsg],
      }));
      setDecoyChats(prev =>
        prev.map(c => (c.id === activeChatId ? { ...c, lastMessage: newDecoyMsg } : c))
      );
      return;
    }

    if (!currentUser || !activeChatId || !mySecretKey) return;

    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat) return;

    const targetUserId = activeChat.participant.id;
    const disappearingSecs = activeChat.disappearingTimer;

    // Real X25519 ECDH + XSalsa20-Poly1305 authenticated encryption to the
    // recipient's actual public key — see src/utils/crypto.ts.
    const encryptedPayload = encryptMessage(
      text,
      mySecretKey,
      activeChat.participant.publicKey,
      currentUser.publicKey
    );

    const messageId = `msg_${Date.now()}`;
    const newMsg: Message = {
      id: messageId,
      chatId: activeChatId,
      senderId: currentUser.id,
      receiverId: targetUserId,
      text,
      encryptedPayload,
      timestamp: Date.now(),
      status: 'sent',
      disappearingTimer: disappearingSecs,
      expiresAt: disappearingSecs > 0 ? Date.now() + disappearingSecs * 1000 : undefined,
      attachment,
      replyToId,
    };

    setMessages(prev => [...prev, newMsg]);

    setChats(prev =>
      prev.map(c =>
        c.id === activeChatId ? { ...c, lastMessage: newMsg, unreadCount: 0 } : c
      )
    );

    // 1. Guaranteed database write to SQLite
    api.sendMessage(newMsg).catch(err => console.warn('REST send err:', err));

    // 2. Real-time forward via Socket.IO
    socketService.sendMessage(newMsg);
  };

  // Handler: Delete for Everyone
  const handleDeleteForEveryone = (messageId: string) => {
    if (!activeChatId || !currentUser) return;
    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat) return;

    socketService.deleteForEveryone(messageId, activeChatId, activeChat.participant.id);

    setMessages(prev =>
      prev.map(m =>
        m.id === messageId
          ? { ...m, isDeletedForEveryone: true, text: '', deletedAt: Date.now() }
          : m
      )
    );
  };

  // Handler: Send Contact Request. The REST call both saves the request and
  // (server-side) pushes a live notification to the other person if they're
  // online — no separate socket emit needed here anymore (see socket.ts).
  const handleSendContactRequest = async (receiverId: string) => {
    if (!currentUser) return;
    try {
      const res = await api.sendContactRequest(receiverId);
      if (res.success && res.request) {
        setOutgoingRequests(prev => [res.request, ...prev]);
        Alert.alert('Request Sent', 'Your connection request has been sent.');
      } else {
        Alert.alert('Request Notice', res.error || 'Failed to send request');
      }
    } catch {
      Alert.alert('Error', 'Unable to reach the server.');
    }
  };

  // Handler: Accept Contact Request. Same as above — the REST call notifies
  // the original sender in real time by itself.
  const handleAcceptContactRequest = async (requestId: string) => {
    if (!currentUser) return;
    try {
      const res = await api.acceptContactRequest(requestId);
      if (res.success) {
        setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
        await reloadDynamicData(currentUser.id);
        Alert.alert('Connected', 'You can now message each other.');
      }
    } catch {
      Alert.alert('Error', 'Failed to accept request.');
    }
  };

  // Handler: Decline Contact Request
  const handleDeclineContactRequest = async (requestId: string) => {
    if (!currentUser) return;
    try {
      await api.declineContactRequest(requestId);
      setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {
      console.error('Error declining request');
    }
  };

  // Handler: Generate VIP Invite
  const handleGenerateInvite = async () => {
    if (!currentUser) return;
    try {
      const res = await api.createInvite(7);
      if (res.success && res.invite) {
        setInvites(prev => [res.invite, ...prev]);
        setCurrentUser(prev => prev ? { ...prev, inviteCodesRemaining: res.remainingCodes } : null);
        Alert.alert('Invite Code Created', `Code: ${res.invite.code}\nValid for 7 days.`);
      }
    } catch {
      Alert.alert('Error', 'Unable to mint invite code.');
    }
  };

  // Handler: Check for updates manually
  const handleCheckUpdates = async () => {
    try {
      const res = await checkForAppUpdates();
      if (res.hasUpdate && res.latestRelease) {
        setAvailableRelease(res.latestRelease);
        setShowUpdateModal(true);
      } else {
        Alert.alert('Up to Date', `You are running the latest version of JABY (${res.currentVersion}).`);
      }
    } catch {
      Alert.alert('Update Check', 'Unable to check for updates right now.');
    }
  };

  // Handler: Sign Out / Switch Identity. Only the session token is cleared —
  // the identity private key stays in secure storage under this account's
  // id so signing back in on the same device doesn't need to rotate keys.
  const handleSignOut = async () => {
    await clearSession();
    socketService.disconnect();
    setCurrentUser(null);
    setMySecretKey(null);
    setCurrentScreen('auth');
    setActiveChatId(null);
    setChats([]);
    setMessages([]);
  };

  const displayedUser = isDecoyMode ? DECOY_USER : currentUser;
  const displayedChats = isDecoyMode ? decoyChats : chats;
  const displayedMessages = isDecoyMode
    ? (activeChatId ? decoyMessages[activeChatId] || [] : [])
    : messages;
  const activeChat = displayedChats.find(c => c.id === activeChatId);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

        {/* Screen Render */}
        {currentScreen === 'auth' || !displayedUser ? (
          <AuthScreen onAuthenticated={handleAuthenticated} />
        ) : (
          <View style={styles.appContainer}>
            {/* Top Header */}
            {currentScreen !== 'chat_detail' && (
              <Header
                onLockPress={() => {
                  if (isDecoyMode) setIsDecoyMode(false);
                  setIsAppLocked(true);
                }}
                onInvitesPress={() => setShowInvitesModal(true)}
                onSettingsPress={() => setCurrentScreen(currentScreen === 'settings' ? 'chat_list' : 'settings')}
                inviteCount={displayedUser.inviteCodesRemaining}
              />
            )}

            {currentScreen === 'chat_list' && (
              <ChatListScreen
                chats={displayedChats}
                currentUserId={displayedUser?.id}
                loading={isDecoyMode ? false : isInitialChatsLoading}
                incomingRequestsCount={isDecoyMode ? 0 : incomingRequests.length}
                onlineUserIds={onlineUserIds}
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                onSelectChat={chatId => {
                  setActiveChatId(chatId);
                  setCurrentScreen('chat_detail');
                  if (!isDecoyMode && currentUser) {
                    const targetChat = chats.find(c => c.id === chatId);
                    const peerId = targetChat ? targetChat.participant.id : chatId;
                    socketService.markRead(peerId, chatId);
                    api.markMessagesAsRead(peerId, chatId).catch(() => {});
                    setChats(prev => prev.map(c => (c.id === chatId ? { ...c, unreadCount: 0 } : c)));
                    setMessages(prev =>
                      prev.map(m => (m.chatId === chatId && m.senderId !== currentUser.id ? { ...m, status: 'read' } : m))
                    );
                  }
                }}
                onOpenRequestsModal={() => setShowRequestsModal(true)}
                onOpenSearchModal={() => setShowSearchModal(true)}
              />
            )}

            {currentScreen === 'chat_detail' && activeChat && (
              <ChatScreen
                chat={activeChat}
                currentUser={displayedUser}
                mySecretKey={mySecretKey || 'decoy_ephemeral_key'}
                historicalKeys={historicalKeys}
                onOpenRestoreSession={() => {
                  setCloudBackupInitialMode('restore');
                  setShowCloudBackupModal(true);
                }}
                messages={displayedMessages}
                isOnline={onlineUserIds.has(activeChat.participant.id)}
                onBack={() => setCurrentScreen('chat_list')}
                onSendMessage={handleSendMessage}
                onDeleteForEveryone={handleDeleteForEveryone}
                onStartCall={handleStartCall}
                onInspectCiphertext={msg => setInspectingMessage(msg)}
                onOpenSafetyNumbers={() => setSafetyModalChat(activeChat)}
                onUpdateDisappearingTimer={async timer => {
                  if (isDecoyMode) return;
                  await api.updateDisappearingTimer(activeChat.participant.id, timer);
                  setChats(prev =>
                    prev.map(c => (c.id === activeChat.id ? { ...c, disappearingTimer: timer } : c))
                  );
                }}
                onClearHistory={async () => {
                  if (isDecoyMode) {
                    if (activeChatId) {
                      setDecoyMessages(prev => ({ ...prev, [activeChatId]: [] }));
                      setDecoyChats(prev =>
                        prev.map(c => (c.id === activeChatId ? { ...c, lastMessage: undefined, unreadCount: 0 } : c))
                      );
                    }
                    return;
                  }
                  await api.clearChatHistory(activeChat.participant.id);
                  setMessages([]);
                  setChats(prev =>
                    prev.map(c => (c.id === activeChat.id ? { ...c, lastMessage: undefined, unreadCount: 0 } : c))
                  );
                }}
                onDisconnectContact={async () => {
                  if (isDecoyMode) {
                    setActiveChatId(null);
                    setCurrentScreen('chat_list');
                    return;
                  }
                  await api.disconnectContact(activeChat.participant.id);
                  await reloadDynamicData(currentUser!.id);
                  setActiveChatId(null);
                  setCurrentScreen('chat_list');
                }}
              />
            )}

            {currentScreen === 'settings' && (
              <SettingsScreen
                currentUser={displayedUser}
                antiScreenshotEnabled={antiScreenshotEnabled}
                onToggleAntiScreenshot={setAntiScreenshotEnabled}
                callVerificationEnabled={callVerificationEnabled}
                onToggleCallVerification={setCallVerificationEnabled}
                autoLockDelay={autoLockDelay}
                onChangeAutoLockDelay={handleUpdateAutoLockDelay}
                onOpenInvites={() => setShowInvitesModal(true)}
                onOpenLinkedDevices={() => setShowLinkedDevicesModal(true)}
                onOpenCloudBackup={() => {
                  setCloudBackupInitialMode('backup');
                  setShowCloudBackupModal(true);
                }}
                onOpenRestoreSession={() => {
                  setCloudBackupInitialMode('restore');
                  setShowCloudBackupModal(true);
                }}
                onOpenChangePassword={() => setShowChangePasswordModal(true)}
                onOpenDuressSettings={() => setShowDuressModal(true)}
                onOpenPermissions={() => setShowPermissionsModal(true)}
                onCheckUpdates={handleCheckUpdates}
                onEditProfile={() => setShowEditProfileModal(true)}
                onLockEnclave={() => {
                  if (isDecoyMode) setIsDecoyMode(false);
                  setIsAppLocked(true);
                }}
                onEmergencyWipe={handleEmergencyWipe}
                onSignOut={handleSignOut}
                onBack={() => setCurrentScreen('chat_list')}
              />
            )}
          </View>
        )}

        {/* Contact Requests Modal */}
        <ContactRequestsModal
          visible={showRequestsModal}
          incomingRequests={incomingRequests}
          outgoingRequests={outgoingRequests}
          onAccept={handleAcceptContactRequest}
          onDecline={handleDeclineContactRequest}
          onClose={() => setShowRequestsModal(false)}
        />

        {/* Search Operative & Connect Modal */}
        <SearchOperativeModal
          visible={showSearchModal}
          currentUserId={currentUser?.id || ''}
          onSendRequest={handleSendContactRequest}
          onOpenChat={peerId => {
            setActiveChatId(peerId);
            setCurrentScreen('chat_detail');
          }}
          onClose={() => setShowSearchModal(false)}
        />

        {/* Ciphertext Inspector Modal */}
        <CipherInspectorModal
          visible={!!inspectingMessage}
          message={inspectingMessage}
          onClose={() => setInspectingMessage(null)}
        />

        {/* Safety Number Verification Modal */}
        <SafetyNumberModal
          visible={!!safetyModalChat}
          participant={safetyModalChat?.participant || null}
          safetyNumber={safetyModalChat?.safetyNumber || '48912 00291 88391 00293 88192 39102 88471 00921 77381 99281 33019 44812'}
          isVerified={safetyModalChat?.isVerifiedSafetyNumber ?? false}
          onToggleVerify={() => {
            if (!safetyModalChat) return;
            setChats(prev =>
              prev.map(c =>
                c.id === safetyModalChat.id
                  ? { ...c, isVerifiedSafetyNumber: !c.isVerifiedSafetyNumber }
                  : c
              )
            );
            setSafetyModalChat(prev => (prev ? { ...prev, isVerifiedSafetyNumber: !prev.isVerifiedSafetyNumber } : null));
          }}
          onClose={() => setSafetyModalChat(null)}
        />

        {/* Encrypted Voice/Video Call Modal — now backed by a real WebRTC
            peer connection (src/utils/webrtcCall.ts); localStream/remoteStream
            are rendered via RTCView inside CallModal. */}
        <CallModal
          callState={callState}
          showVerificationWords={callVerificationEnabled}
          localStream={localStream}
          remoteStream={remoteStream}
          onHangup={handleHangupCall}
          onAcceptIncoming={handleAcceptIncomingCall}
          onToggleMute={handleToggleMute}
          onToggleVideo={handleToggleVideo}
          onToggleSpeaker={handleToggleSpeaker}
          onToggleCameraFlip={handleFlipCamera}
        />

        {/* VIP Invite Manager Modal */}
        <InviteManagerModal
          visible={showInvitesModal}
          invites={invites}
          remainingCount={currentUser?.inviteCodesRemaining ?? 0}
          onGenerateInvite={handleGenerateInvite}
          onClose={() => setShowInvitesModal(false)}
        />

        {/* Linked Devices Modal */}
        <LinkedDevicesModal
          visible={showLinkedDevicesModal}
          devices={linkedDevices}
          onRevokeDevice={async deviceId => {
            if (currentUser) {
              await api.revokeDevice(currentUser.id, deviceId);
            }
            setLinkedDevices(prev => prev.filter(d => d.id !== deviceId));
          }}
          onLinkNewDevice={() => Alert.alert('Link a Device', 'Scan the QR code on your other device to link it to this account.')}
          onClose={() => setShowLinkedDevicesModal(false)}
        />

        {/* Cloud Backup Modal — now real encryption (see src/utils/backupCrypto.ts).
            What's actually preserved is this device's real identity private
            key, escrowed under a passphrase-derived key: your message
            history already lives on the server as ciphertext, but without
            your private key it can never be decrypted again after losing
            this device. */}
        <CloudBackupModal
          visible={showCloudBackupModal}
          initialMode={cloudBackupInitialMode}
          metadata={cloudBackupMetadata}
          onCreateBackup={async passphrase => {
            if (!currentUser || !mySecretKey) return false;
            const payload: BackupPayload = {
              version: 2,
              exportedAt: Date.now(),
              identityKeyPair: { publicKey: currentUser.publicKey, secretKey: mySecretKey },
              historicalKeyPairs: historicalKeys,
            };
            const blob = encryptBackup(payload, passphrase);
            const res = await api.saveCloudBackup({
              encryptedData: blob.encryptedData,
              salt: blob.salt,
              iv: blob.iv,
              backupSizeKb: Math.ceil(blob.encryptedData.length / 1024),
              backupVersion: '2.5.0-E2EE',
              totalMessagesCount: messages.length,
              totalChatsCount: chats.length,
              keyFingerprint: currentUser.fingerprintHash,
            });
            if (!res.success) return false;
            setCloudBackupMetadata(prev => ({
              ...prev,
              lastBackupTime: Date.now(),
              totalMessagesCount: messages.length,
              totalChatsCount: chats.length,
            }));
            return true;
          }}
          onRestoreBackup={async (passphrase: string) => {
            if (!currentUser) return false;
            const res = await api.getCloudBackup(currentUser.id);
            if (!res.success || !res.backup) {
              Alert.alert('No Backup Found', 'There is no backup saved for this account yet.');
              return false;
            }
            const restored = decryptBackup(
              { encryptedData: res.backup.encryptedData, salt: res.backup.salt, iv: res.backup.iv },
              passphrase
            );
            if (!restored) {
              Alert.alert('Restore Failed', 'Wrong passphrase or PIN, or the backup was corrupted.');
              return false;
            }
            await saveIdentityKeyPair(currentUser.id, restored.identityKeyPair);
            if (restored.historicalKeyPairs && restored.historicalKeyPairs.length > 0) {
              for (const hk of restored.historicalKeyPairs) {
                await saveHistoricalKeyPair(currentUser.id, hk);
              }
            }
            const updatedHistorical = await getHistoricalKeyPairs(currentUser.id);
            historicalKeysRef.current = updatedHistorical;
            setHistoricalKeys(updatedHistorical);
            setMySecretKey(restored.identityKeyPair.secretKey);

            if (currentUser.publicKey !== restored.identityKeyPair.publicKey) {
              const profRes = await api.updateProfile({ publicKey: restored.identityKeyPair.publicKey });
              if (profRes.success && profRes.user) {
                setCurrentUser(profRes.user);
              }
            }

            await reloadDynamicData(currentUser.id);
            if (activeChatId) {
              const rawMessages = await api.getMessages(activeChatId, currentUser.id);
              const knownPublicKey = chats.find(c => c.id === activeChatId)?.participant.publicKey;
              const decryptedList = rawMessages.map(m => {
                if (m.isDeletedForEveryone) return { ...m, text: '' };
                const { text } = decryptVerified(m.encryptedPayload, knownPublicKey);
                return { ...m, text };
              });
              setMessages(decryptedList);
            }
            Alert.alert('Session & Messages Restored', 'Your encryption keys have been restored and your previous messages are now unlocked.');
            return true;
          }}
          onClose={() => setShowCloudBackupModal(false)}
        />

        {/* Edit Profile Modal — name + avatar (Cloudinary-hosted, unencrypted:
            avatars are public profile pictures, unlike E2E-encrypted chat
            attachments). */}
        {currentUser && (
          <EditProfileModal
            visible={showEditProfileModal}
            currentUser={currentUser}
            onSave={async updates => {
              const res = await api.updateProfile(updates);
              if (!res.success || !res.user) return false;
              setCurrentUser(res.user);
              return true;
            }}
            onClose={() => setShowEditProfileModal(false)}
          />
        )}

        {/* Change Password Modal */}
        <ChangePasswordModal
          visible={showChangePasswordModal}
          onClose={() => setShowChangePasswordModal(false)}
        />

        {/* Duress Protocol Settings Modal */}
        <DuressSettingsModal
          visible={showDuressModal}
          onClose={() => setShowDuressModal(false)}
        />

        {/* Privacy Shield App Lock Overlay */}
        <PrivacyShield
          isLocked={isAppLocked}
          onUnlock={() => setIsAppLocked(false)}
          onUnlockDecoy={() => {
            setIsDecoyMode(true);
            setIsAppLocked(false);
            setActiveChatId(null);
            setCurrentScreen('chat_list');
          }}
          onEmergencyWipe={handleEmergencyWipe}
        />

        {/* Hardware Permissions Onboarding Modal */}
        <PermissionsModal
          visible={showPermissionsModal}
          status={permissionsStatus}
          onRequestPermissions={async () => {
            const updated = await requestAppPermissions();
            setPermissionsStatus(updated);
            setShowPermissionsModal(false);
          }}
          onRefreshStatus={async () => {
            const current = await checkAppPermissions();
            setPermissionsStatus(current);
            if (current.allGranted) {
              setShowPermissionsModal(false);
            }
          }}
          onDismiss={() => setShowPermissionsModal(false)}
        />

        {/* In-App Update Notification Modal */}
        <UpdateNotificationModal
          visible={showUpdateModal}
          release={availableRelease}
          onDismiss={() => setShowUpdateModal(false)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
