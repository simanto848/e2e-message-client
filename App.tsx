import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, StatusBar, Alert, AppState, BackHandler, ToastAndroid, Platform, InteractionManager, DeviceEventEmitter } from 'react-native';
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
  BackupFrequency,
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
  saveBackupFrequency,
  getBackupFrequency,
  saveBackupPassphrase,
  getBackupPassphrase,
  wipeAllSecureData,
} from './src/utils/keyStore';
import { clearDuressConfig } from './src/utils/duressConfig';

import { encryptBackup, decryptBackup, BackupPayload } from './src/utils/backupCrypto';
import { api, API_BASE_URL } from './src/services/api';
import { socketService } from './src/services/socket';
import { callAudio } from './src/utils/callAudio';
import { webrtcCallEngine } from './src/utils/webrtcCall';

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
  AppPermissionsStatus,
} from './src/utils/permissions';
import { colors } from './src/theme';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppSecurity } from './src/hooks/useAppSecurity';
import { useWebRTCCall } from './src/hooks/useWebRTCCall';
import { ChatHeadOverlay, ChatHeadAttachmentData } from './src/components/ChatHeadOverlay';
import { RestoreSessionModal } from './src/components/RestoreSessionModal';
import { InAppNotificationBanner } from './src/components/InAppNotificationBanner';
import { notificationService } from './src/services/notificationService';
import {
  startBackgroundSync,
  stopBackgroundSync,
  getBackgroundSyncSettings,
  setBackgroundSyncEnabled,
  setChatHeadsEnabled,
} from './src/services/backgroundSync';
import { chatHeadNative } from './src/services/chatHeadNative';

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

const DECOY_PARTICIPANT_1: UserProfile = {
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

const DECOY_PARTICIPANT_2: UserProfile = {
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
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, number>>({});

  const [inspectingMessage, setInspectingMessage] = useState<Message | null>(null);
  const [safetyModalChat, setSafetyModalChat] = useState<ChatThread | null>(null);
  const [mySecretKey, setMySecretKey] = useState<string | null>(null);
  const [historicalKeys, setHistoricalKeys] = useState<IdentityKeyPair[]>([]);
  const historicalKeysRef = useRef<IdentityKeyPair[]>([]);
  historicalKeysRef.current = historicalKeys;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const mySecretKeyRef = useRef(mySecretKey);
  mySecretKeyRef.current = mySecretKey;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;
  const currentScreenRef = useRef(currentScreen);
  currentScreenRef.current = currentScreen;

  const [cloudBackupInitialMode, setCloudBackupInitialMode] = useState<'backup' | 'restore'>('backup');
  const [restoreSessionPrompt, setRestoreSessionPrompt] = useState<{
    visible: boolean;
    resolve: (restore: boolean) => void;
  } | null>(null);

  const logCallToChat = (finalState: CallState, endReason: 'completed' | 'declined' | 'missed') => {
    const user = currentUserRef.current;
    const secret = mySecretKeyRef.current;
    if (!user || !secret || !finalState.remoteUser) return;

    const peer = finalState.remoteUser;
    const isIncoming = Boolean(finalState.isIncoming);
    const status: 'completed' | 'declined' | 'missed' = finalState.duration > 0 ? 'completed' : endReason;
    const label = finalState.type === 'video' ? 'Video call' : 'Voice call';
    const text = isIncoming
      ? status === 'completed'
        ? `📞 Incoming ${label} · ${formatCallDuration(finalState.duration)}`
        : status === 'declined'
        ? `📞 Declined ${label}`
        : `📞 Missed ${label}`
      : status === 'completed'
      ? `📞 ${label} · ${formatCallDuration(finalState.duration)}`
      : status === 'declined'
      ? `📞 ${label} declined`
      : `📞 ${label} not answered`;

    let encryptedPayload;
    try {
      encryptedPayload = encryptMessage(text, secret, peer.publicKey, user.publicKey);
    } catch (err) {
      console.warn('[CallLog] Encryption notice:', err);
      return;
    }
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
      senderId: isIncoming ? peer.id : user.id,
      receiverId: isIncoming ? user.id : peer.id,
      text,
      encryptedPayload,
      timestamp: Date.now(),
      status: isIncoming ? 'delivered' : 'sent',
      disappearingTimer: 0,
      attachment: callAttachment,
    };

    setMessages(prev => (activeChatIdRef.current === peer.id ? [...prev, newMsg] : prev));
    setChats(prev => prev.map(c => (c.id === peer.id ? { ...c, lastMessage: newMsg, unreadCount: 0 } : c)));

    if (!isIncoming) {
      const wireMsg: Message = { ...newMsg, text: '' };
      api.sendMessage(wireMsg).catch(err => console.warn('Call log REST send err:', err));
      socketService.sendMessage(wireMsg);
    }
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
    applyPrivacySettings,
    isDecoyMode,
    setIsDecoyMode,
    handleUnlockDecoy,
  } = useAppSecurity({
    isAuthenticated: Boolean(currentUser),
    isCallActive: Boolean(callState.active),
  });

  const handleToggleAntiScreenshot = async (val: boolean) => {
    setAntiScreenshotEnabled(val);
    setCurrentUser(prev => prev ? { ...prev, blockScreenshots: val } : null);
    try {
      if (val) {
        await ScreenCapture.preventScreenCaptureAsync();
      } else {
        await ScreenCapture.allowScreenCaptureAsync();
      }
    } catch (err) {
      console.warn('[AntiScreenshot] Screen-capture toggle notice:', err);
    }
    api.updatePrivacySettings({ blockScreenshots: val }).catch(() => {});
  };

  // Enforce OS-level screenshot blocking whenever the setting is on and a
  // user is authenticated. Previously the toggle only flipped state without
  // ever calling expo-screen-capture, so the privacy feature was a no-op.
  useEffect(() => {
    const enforce = async () => {
      try {
        if (antiScreenshotEnabled && currentUser) {
          await ScreenCapture.preventScreenCaptureAsync();
        } else {
          await ScreenCapture.allowScreenCaptureAsync();
        }
      } catch (err) {
        console.warn('[AntiScreenshot] Enforce notice:', err);
      }
    };
    enforce();
  }, [antiScreenshotEnabled, currentUser]);

  const handleToggleCallVerification = async (val: boolean) => {
    setCallVerificationEnabled(val);
    setCurrentUser(prev => prev ? { ...prev, callVerification: val } : null);
    api.updatePrivacySettings({ callVerification: val }).catch(() => {});
  };

  const handleChangeAutoLockDelay = async (val: number) => {
    handleUpdateAutoLockDelay(val);
    setCurrentUser(prev => prev ? { ...prev, autoLockDelay: val } : null);
    api.updatePrivacySettings({ autoLockDelay: val }).catch(() => {});
  };

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

  // Background Sync & Messenger Chat Heads
  const [backgroundSyncEnabled, setBackgroundSyncEnabledState] = useState(true);
  const [chatHeadsEnabled, setChatHeadsEnabledState] = useState(true);
  const [activeChatHeadContactId, setActiveChatHeadContactId] = useState<string | null>(null);
  const [chatHeadContactIds, setChatHeadContactIds] = useState<string[]>([]);
  const [isChatHeadDismissed, setIsChatHeadDismissed] = useState(false);
  const [isChatHeadExpanded, setIsChatHeadExpanded] = useState(false);
  const [isOpenedFromChatHead, setIsOpenedFromChatHead] = useState(false);
  const [chatHeadMessages, setChatHeadMessages] = useState<Message[]>([]);
  const activeChatHeadContactIdRef = useRef<string | null>(null);
  activeChatHeadContactIdRef.current = activeChatHeadContactId;

  useEffect(() => {
    getBackgroundSyncSettings().then(settings => {
      setBackgroundSyncEnabledState(settings.backgroundSyncEnabled);
      setChatHeadsEnabledState(settings.chatHeadsEnabled);
    });
  }, []);

  const handleToggleBackgroundSync = async (val: boolean) => {
    setBackgroundSyncEnabledState(val);
    await setBackgroundSyncEnabled(val);
  };

  const handleToggleChatHeads = async (val: boolean) => {
    setChatHeadsEnabledState(val);
    await setChatHeadsEnabled(val);
    if (val) setIsChatHeadDismissed(false);
  };

  const handleCloseFloatingWindow = () => {
    setIsChatHeadExpanded(false);
    setIsOpenedFromChatHead(false);
    // Only leave a bubble behind if that thread still has unread messages —
    // minimizing a fully-read chat just exits, no stray bubble.
    if (chatHeadsEnabled && currentUser && chatHeadThread && !isAppLocked && (chatHeadThread.unreadCount || 0) > 0) {
      chatHeadNative
        .showNativeChatHead({
          contactId: chatHeadThread.id,
          contactName: chatHeadThread.participant.name,
          avatarUrl: chatHeadThread.participant.avatar,
          unreadCount: chatHeadThread.unreadCount || 0,
          isOnline: onlineUserIds.has(chatHeadThread.participant.id),
        })
        .catch(() => {});
    } else {
      chatHeadNative.hideNativeChatHead().catch(() => {});
    }
    BackHandler.exitApp();
  };

  // Android Hardware / Swipe Back Navigation Handler
  const lastBackPressTimeRef = useRef<number>(0);

  const backHandlerStateRef = useRef({
    isAppLocked,
    callActive: Boolean(callState.active || callState.isIncoming),
    inspectingMessage,
    safetyModalChat,
    showUpdateModal,
    showPermissionsModal,
    showChangePasswordModal,
    showEditProfileModal,
    showDuressModal,
    showCloudBackupModal,
    showLinkedDevicesModal,
    showInvitesModal,
    showSearchModal,
    showRequestsModal,
    hasRestorePrompt: false,
    currentScreen,
    isOpenedFromChatHead: false,
    isChatHeadExpanded: false,
  });

  backHandlerStateRef.current = {
    isAppLocked,
    callActive: Boolean(callState.active || callState.isIncoming),
    inspectingMessage,
    safetyModalChat,
    showUpdateModal,
    showPermissionsModal,
    showChangePasswordModal,
    showEditProfileModal,
    showDuressModal,
    showCloudBackupModal,
    showLinkedDevicesModal,
    showInvitesModal,
    showSearchModal,
    showRequestsModal,
    hasRestorePrompt: Boolean(restoreSessionPrompt),
    currentScreen,
    isOpenedFromChatHead,
    isChatHeadExpanded,
  };

  useEffect(() => {
    const onHardwareBack = () => {
      const state = backHandlerStateRef.current;

      // 0. If floating quick-chat from chat head is open, close floating window and return to external app/home screen!
      if (state.isOpenedFromChatHead && state.isChatHeadExpanded) {
        handleCloseFloatingWindow();
        return true;
      }

      if (state.isChatHeadExpanded) {
        setIsChatHeadExpanded(false);
        return true;
      }

      // 1. If screen is locked by Privacy Shield PIN, prevent bypassing
      if (state.isAppLocked) {
        return true;
      }

      // 2. If restore session modal is prompting, prevent bypass
      if (state.hasRestorePrompt) {
        return true;
      }

      // 3. If call is active or ringing, prevent accidental exit
      if (state.callActive) {
        return true;
      }

      // 3. Fallback close for open App-level modals
      if (state.inspectingMessage) {
        setInspectingMessage(null);
        return true;
      }
      if (state.safetyModalChat) {
        setSafetyModalChat(null);
        return true;
      }
      if (state.showUpdateModal) {
        setShowUpdateModal(false);
        return true;
      }
      if (state.showPermissionsModal) {
        setShowPermissionsModal(false);
        return true;
      }
      if (state.showChangePasswordModal) {
        setShowChangePasswordModal(false);
        return true;
      }
      if (state.showEditProfileModal) {
        setShowEditProfileModal(false);
        return true;
      }
      if (state.showDuressModal) {
        setShowDuressModal(false);
        return true;
      }
      if (state.showCloudBackupModal) {
        setShowCloudBackupModal(false);
        return true;
      }
      if (state.showLinkedDevicesModal) {
        setShowLinkedDevicesModal(false);
        return true;
      }
      if (state.showInvitesModal) {
        setShowInvitesModal(false);
        return true;
      }
      if (state.showSearchModal) {
        setShowSearchModal(false);
        return true;
      }
      if (state.showRequestsModal) {
        setShowRequestsModal(false);
        return true;
      }

      // 4. Primary Screen Back Navigation
      if (state.currentScreen === 'chat_detail') {
        setActiveChatId(null);
        setCurrentScreen('chat_list');
        return true;
      }

      if (state.currentScreen === 'settings') {
        setCurrentScreen('chat_list');
        return true;
      }

      // 5. On root chat list: confirm double-tap before exiting to prevent accidental close
      if (state.currentScreen === 'chat_list') {
        const now = Date.now();
        if (now - lastBackPressTimeRef.current < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackPressTimeRef.current = now;
        if (Platform.OS === 'android') {
          ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        }
        return true;
      }

      // 6. On auth screen, allow system to exit
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, []);

  // Hardware Permissions (Camera, Mic, Photos)
  const [permissionsStatus, setPermissionsStatus] = useState<AppPermissionsStatus>({
    camera: false,
    microphone: false,
    photos: false,
    allGranted: false,
  });

  const handleEmergencyWipe = async () => {
    try {
      if (callStateRef.current.active) {
        webrtcCallEngine.endCall();
        callAudio.playHangup();
        callAudio.releaseAudioSession();
        resetCallState();
      }
      socketService.disconnect({ clearListeners: true });
      try {
        stopBackgroundSync();
      } catch {}
      await wipeAllSecureData(currentUser?.id);
      await clearDuressConfig();
      // Preserve background-sync / chat-head prefs across wipe; only clear
      // session-scoped keys. AsyncStorage.clear() previously wiped user prefs.
      await AsyncStorage.multiRemove(['session_token', 'current_user_id']).catch(() => {});
      setCurrentUser(null);
      setMySecretKey(null);
      setChats([]);
      setMessages([]);
      setActiveChatId(null);
      setHistoricalKeys([]);
      setInvites([]);
      setLinkedDevices([]);
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
      if (nextState === 'active') {
        socketService.reconnectIfNeeded().catch(err => console.warn('[Socket] Reconnect notice:', err));
        performAutoBackupIfNeeded();
      }
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

        // Synchronize privacy preferences from database
        applyPrivacySettings({
          blockScreenshots: data.user.blockScreenshots,
          callVerification: data.user.callVerification,
          autoLockDelay: data.user.autoLockDelay,
        });

        const userFreq = data.user.backupFrequency as BackupFrequency | undefined;
        const savedFreq = userFreq || (await getBackupFrequency());
        if (userFreq) {
          await saveBackupFrequency(userFreq);
        }
        setBackupFrequency(savedFreq);
        setCloudBackupMetadata(prev => ({ ...prev, backupFrequency: savedFreq }));

        setMySecretKey(keyPair.secretKey);
        setCurrentUser(data.user);
        setCurrentScreen('chat_list');
        await socketService.connect();
        await reloadDynamicData(data.user.id);
        performAutoBackupIfNeeded(data.user, keyPair.secretKey, savedFreq);
      } catch (err) {
        console.warn('Session restore notice:', err);
      }
    };
    restoreSession();
  }, []);

  // Invites, Devices & Backup
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [linkedDevices, setLinkedDevices] = useState<LinkedDevice[]>([]);
  const [backupFrequency, setBackupFrequency] = useState<BackupFrequency>('daily');
  const [cloudBackupMetadata, setCloudBackupMetadata] = useState<CloudBackupMetadata>({
    lastBackupTime: null,
    totalMessagesCount: 0,
    totalChatsCount: 0,
    backupSizeKb: 128,
    backupVersion: '2.5.0-E2EE',
    autoBackupEnabled: true,
    backupFrequency: 'daily',
    encryptionAlgorithm: 'PBKDF2-100K-AES-256-GCM',
    keyFingerprint: '',
  });

  const backupRunningRef = useRef(false);
  const backupFreqRef = useRef<BackupFrequency>('daily');
  backupFreqRef.current = backupFrequency;
  const cloudBackupMetaRef = useRef(cloudBackupMetadata);
  cloudBackupMetaRef.current = cloudBackupMetadata;

  const performAutoBackupIfNeeded = async (
    overrideUser?: UserProfile,
    overrideSecret?: string,
    overrideFreq?: BackupFrequency
  ) => {
    if (backupRunningRef.current) return;
    const user = overrideUser || currentUserRef.current;
    const secret = overrideSecret || mySecretKeyRef.current;
    const freq = overrideFreq || backupFreqRef.current;

    if (!user || !secret || freq === 'off') return;

    const intervals: Record<BackupFrequency, number> = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
      off: Infinity,
    };

    const intervalMs = intervals[freq];
    const lastTime = cloudBackupMetaRef.current.lastBackupTime;

    if (lastTime && Date.now() - lastTime < intervalMs) {
      return;
    }

    backupRunningRef.current = true;
    try {
      const passphrase = await getBackupPassphrase();
      if (!passphrase) {
        backupRunningRef.current = false;
        return;
      }

      const histKeys =
        historicalKeysRef.current.length > 0
          ? historicalKeysRef.current
          : await getHistoricalKeyPairs(user.id);

      const payload: BackupPayload = {
        version: 2,
        exportedAt: Date.now(),
        identityKeyPair: { publicKey: user.publicKey, secretKey: secret },
        historicalKeyPairs: histKeys,
      };

      const blob = encryptBackup(payload, passphrase);
      const res = await api.saveCloudBackup({
        encryptedData: blob.encryptedData,
        salt: blob.salt,
        iv: blob.iv,
        backupSizeKb: Math.ceil(blob.encryptedData.length / 1024),
        backupVersion: '2.5.0-E2EE',
        totalMessagesCount: messagesRef.current.length,
        totalChatsCount: chatsRef.current.length,
        keyFingerprint: user.fingerprintHash,
      });

      if (res?.success) {
        const now = Date.now();
        setCloudBackupMetadata(prev => ({
          ...prev,
          lastBackupTime: now,
          totalMessagesCount: messagesRef.current.length,
          totalChatsCount: chatsRef.current.length,
          backupFrequency: freq,
        }));
        console.log(`[AutoBackup] Completed ${freq} backup successfully at ${new Date(now).toISOString()}`);
      }
    } catch (err) {
      console.log('[AutoBackup] Notice during auto-backup:', err);
    } finally {
      backupRunningRef.current = false;
    }
  };

  const handleUpdateBackupFrequency = async (freq: BackupFrequency) => {
    setBackupFrequency(freq);
    setCloudBackupMetadata(prev => ({ ...prev, backupFrequency: freq }));
    await saveBackupFrequency(freq);
    setCurrentUser(prev => prev ? { ...prev, backupFrequency: freq } : null);
    api.updatePrivacySettings({ backupFrequency: freq }).catch(() => {});
    if (freq !== 'off') {
      performAutoBackupIfNeeded(currentUser || undefined, mySecretKey || undefined, freq);
    }
  };


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
            // Prompt the user with custom modern dialog modal
            const shouldRestore = await new Promise<boolean>(resolve => {
              setRestoreSessionPrompt({
                visible: true,
                resolve: (restore: boolean) => {
                  setRestoreSessionPrompt(null);
                  resolve(restore);
                },
              });
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

    // Synchronize privacy preferences from database
    applyPrivacySettings({
      blockScreenshots: user.blockScreenshots,
      callVerification: user.callVerification,
      autoLockDelay: user.autoLockDelay,
    });

    if (user.backupFrequency) {
      const freq = user.backupFrequency as BackupFrequency;
      setBackupFrequency(freq);
      await saveBackupFrequency(freq);
      setCloudBackupMetadata(prev => ({ ...prev, backupFrequency: freq }));
    }

    // Switch screen immediately so user enters chat list with zero delay
    setCurrentUser(user);
    setCurrentScreen('chat_list');

    // Connect realtime socket and load dynamic contacts without blocking
    socketService.connect().catch(() => {});
    reloadDynamicData(user.id).catch(() => {});

    // Defer heavy cryptographic auto-escrow and scheduled backup to run after
    // screen transitions have completed, keeping the UI instantly interactive
    InteractionManager.runAfterInteractions(() => {
      setTimeout(async () => {
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
            cloudBackupMetaRef.current = {
              ...cloudBackupMetaRef.current,
              lastBackupTime: Date.now(),
            };
          } catch {}
        }
        performAutoBackupIfNeeded(user, keyPair.secretKey);
      }, 300);
    });
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

      // Synchronize last seen map with latest contact profile and message timestamps
      const initialLastSeen: Record<string, number> = {};
      contactList.forEach(c => {
        if (c.participant?.id) {
          const t = c.participant.lastActiveAt || c.lastMessage?.timestamp;
          if (t && t > 0) {
            initialLastSeen[c.participant.id] = t;
          }
        }
      });
      if (Object.keys(initialLastSeen).length > 0) {
        // Fresh server data wins over stale local state.
        setLastSeenMap(prev => ({ ...prev, ...initialLastSeen }));
      }

      setChats(withDecryptedPreviews);
      setIncomingRequests(reqs.incoming || []);
      setOutgoingRequests(reqs.outgoing || []);
      setInvites(userInvites || []);
      setLinkedDevices(devices || []);

      try {
        const backupRes = await api.getCloudBackup(userId);
        if (backupRes?.success && backupRes.backup) {
          const b = backupRes.backup;
          const rawTime = b.timestamp || b.createdAt;
          const remoteTime = rawTime ? new Date(rawTime).getTime() : Date.now();
          setCloudBackupMetadata(prev => ({
            ...prev,
            lastBackupTime: isNaN(remoteTime) ? Date.now() : remoteTime,
            totalMessagesCount: typeof b.totalMessagesCount === 'number' ? b.totalMessagesCount : prev.totalMessagesCount,
            totalChatsCount: typeof b.totalChatsCount === 'number' ? b.totalChatsCount : prev.totalChatsCount,
            backupSizeKb: typeof b.backupSizeKb === 'number' ? b.backupSizeKb : prev.backupSizeKb,
            keyFingerprint: b.keyFingerprint || prev.keyFingerprint,
          }));
        }
      } catch {
        // Vault check notice (e.g. fresh account with no prior backup)
      }
    } catch (err) {
      console.log('Dynamic data fetch notice:', err);
    } finally {
      setIsInitialChatsLoading(false);
    }
  };

  // Decrypt a payload with real key verification: the payload carries the
  // sender's public key, but we only trust it if it matches the public key
  // we actually have on file for that contact (from the directory / a prior
  // safety-number verification).
  const decryptVerified = (payload: EncryptedPayload, expectedPublicKey?: string): { text: string; keyMismatch: boolean } => {
    if (!mySecretKey) return { text: 'Locked — sign in again to view', keyMismatch: false };
    if (!payload?.ciphertext || !payload?.iv) {
      return { text: '', keyMismatch: false };
    }

    const isSentByMe = currentUser && payload.senderPublicKey === currentUser.publicKey;
    const peerPublicKey = isSentByMe ? expectedPublicKey : (expectedPublicKey || payload.senderPublicKey);

    if (!peerPublicKey) {
      return { text: '⚠️ Missing recipient cryptographic public key.', keyMismatch: true };
    }

    let opened = decryptMessage(payload, mySecretKey, peerPublicKey);
    let isMismatch = !isSentByMe && Boolean(expectedPublicKey && payload.senderPublicKey && payload.senderPublicKey !== expectedPublicKey);

    // Fallbacks: if sender used a mismatched public key, flag keyMismatch
    if (opened === null && payload.senderPublicKey && payload.senderPublicKey !== peerPublicKey) {
      opened = decryptMessage(payload, mySecretKey, payload.senderPublicKey);
      if (opened !== null) {
        isMismatch = true;
      }
    }

    // Fallback: check historical keys keyring
    const allHistorical = historicalKeysRef.current;
    if (opened === null && allHistorical && allHistorical.length > 0) {
      for (const hk of allHistorical) {
        opened = decryptMessage(payload, hk.secretKey, peerPublicKey);
        if (opened !== null) break;
        if (payload.senderPublicKey && payload.senderPublicKey !== peerPublicKey) {
          opened = decryptMessage(payload, hk.secretKey, payload.senderPublicKey);
          if (opened !== null) {
            isMismatch = true;
            break;
          }
        }
      }
    }

    if (opened === null) {
      return { text: '🔒 Encrypted message (key mismatch or previous session).', keyMismatch: true };
    }
    return { text: opened, keyMismatch: isMismatch };
  };

  // 3. Load conversation messages dynamically when opening a chat
  useEffect(() => {
    if (!currentUser || !activeChatId || !mySecretKey) return;

    const targetChatId = activeChatId;
    let cancelled = false;
    const loadMessages = async () => {
      try {
        const rawMessages = await api.getMessages(targetChatId, currentUser.id);
        if (cancelled || activeChatIdRef.current !== targetChatId) return;
        const knownPublicKey = chatsRef.current.find(c => c.id === targetChatId)?.participant.publicKey;

        const decryptedList = rawMessages.map(m => {
          if (m.isDeletedForEveryone) return { ...m, text: '' };
          const { text, keyMismatch } = decryptVerified(m.encryptedPayload, knownPublicKey);
          return { ...m, text, keyMismatch: m.keyMismatch ?? keyMismatch };
        });

        setMessages(decryptedList);
      } catch (err) {
        if (!cancelled) console.warn('Failed to load messages for chat:', targetChatId, err);
      }
    };

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [activeChatId, currentUser?.id, mySecretKey]);

  // Periodic background/fallback sync: only active when app is active, unlocked, and authenticated
  useEffect(() => {
    if (!currentUser || isAppLocked) return;

    const poll = async () => {
      if (AppState.currentState !== 'active' || isAppLocked) return;
      await reloadDynamicData(currentUser.id);

      // Only re-fetch messages if socket is not connected (fallback mode)
      if (activeChatIdRef.current && !socketService.isConnected()) {
        try {
          const raw = await api.getMessages(activeChatIdRef.current, currentUser.id);
          const knownPublicKey = chatsRef.current.find(c => c.id === activeChatIdRef.current)?.participant.publicKey;
          const decrypted = raw.map(m => {
            if (m.isDeletedForEveryone) return { ...m, text: '' };
            const { text } = decryptVerified(m.encryptedPayload, knownPublicKey);
            return { ...m, text };
          });
          setMessages(decrypted);
        } catch {}
      }
    };

    // If socket is connected, poll every 25s as a gentle health check; if disconnected, poll every 7s
    const pollIntervalMs = socketService.isConnected() ? 25000 : 7000;
    const interval = setInterval(poll, pollIntervalMs);

    return () => clearInterval(interval);
  }, [currentUser?.id, isAppLocked]);

  // 4. Realtime Socket Listeners (presence, incoming messages, call signals, typing)
  useEffect(() => {
    if (!currentUser) return;

    // Incoming Contact Request
    const unsubReqReceived = socketService.onContactRequestReceived(async req => {
      await reloadDynamicData(currentUser.id);
      if (!isDecoyMode) {
        notificationService.showSecurityNotification({
          title: 'Contact Request',
          message: `@${req.sender.handle.replace(/^@+/, '')} (${req.sender.name}) wants to connect securely.`,
          type: 'verification',
          onPress: () => setShowRequestsModal(true),
        }).catch(() => {});
      }
    });

    // Contact Request Accepted
    const unsubReqAccepted = socketService.onContactRequestAccepted(async () => {
      await reloadDynamicData(currentUser.id);
      if (!isDecoyMode) {
        notificationService.showSecurityNotification({
          title: 'Connection Established',
          message: 'Contact request accepted. End-to-end encrypted messaging is now active.',
          type: 'verification',
        }).catch(() => {});
      }
    });

    // Incoming Encrypted Message
    const unsubMsg = socketService.onReceiveMessage((incoming: Message) => {
      if (incoming.receiverId === currentUser.id) {
        const knownPublicKey = chatsRef.current.find(c => c.id === incoming.senderId)?.participant.publicKey;
        const { text, keyMismatch } = decryptVerified(incoming.encryptedPayload, knownPublicKey);
        const msg: Message = { ...incoming, text, keyMismatch: incoming.keyMismatch ?? keyMismatch };

        if (keyMismatch && !isDecoyMode) {
          notificationService.showSecurityNotification({
            title: 'Key Mismatch Warning',
            message: 'Incoming message public key does not match verified recipient fingerprint. Possible MITM or key rotation.',
            type: 'key_change',
            onPress: () => {
              const chat = chatsRef.current.find(c => c.id === msg.senderId);
              if (chat) setSafetyModalChat(chat);
            },
          }).catch(() => {});
        }

        const isCurrentlyOpen = activeChatIdRef.current === msg.senderId && currentScreenRef.current === 'chat_detail';

        // Append to messages only if belonging to the currently open chat, and deduplicate
        if (activeChatIdRef.current === msg.senderId || activeChatIdRef.current === msg.chatId) {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
        if (msg.senderId) {
          setLastSeenMap(prev => ({ ...prev, [msg.senderId]: msg.timestamp || Date.now() }));
        }

        callAudio.playMessageSound();

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
          api.markMessagesAsRead(msg.senderId, msg.chatId).catch(() => {});
        } else {
          socketService.sendStatus(msg.id, msg.chatId, 'delivered');

          // When new message arrives from another user, include them in chat heads (max 3 users).
          // Normalize to the chat THREAD id (not the raw sender/participant id) so the
          // same conversation can never occupy two bubble slots at once.
          const headThreadId =
            chatsRef.current.find(
              c => c.id === msg.senderId || c.id === msg.chatId || c.participant?.id === msg.senderId
            )?.id || msg.chatId || msg.senderId;
          setChatHeadContactIds(prev => {
            const normalized = prev.map(
              pid => chatsRef.current.find(c => c.id === pid || c.participant?.id === pid)?.id || pid
            );
            const filtered = normalized.filter(id => id !== headThreadId);
            return [headThreadId, ...filtered].slice(0, 3);
          });
          setActiveChatHeadContactId(headThreadId);
          setIsChatHeadDismissed(false);

          const senderProfile = chatsRef.current.find(c => c.id === msg.senderId)?.participant;
          const currentChat = chatsRef.current.find(c => c.id === msg.senderId);
          const showPreview = currentChat?.notificationSettings?.showPreview !== false;
          const isMuted = currentChat?.notificationSettings?.muted === true;

          if (!isMuted) {
            notificationService.showMessageNotification({
              senderId: msg.senderId,
              senderName: senderProfile?.name || 'Encrypted Chat',
              text: msg.text || '🔒 Encrypted message',
              chatId: msg.chatId || msg.senderId,
              avatarUri: senderProfile?.avatar,
              showPreview,
              isDecoyMode,
              onPress: () => {
                setActiveChatId(msg.senderId);
                setCurrentScreen('chat_detail');
              },
            }).catch(() => {});
          }
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
    const handleIncomingCallSignal = async (signal: any) => {
      if (signal.targetId !== currentUser.id) return;

      if (signal.signalType === 'offer') {
        // Already on a call (either as caller or callee) — auto-decline the new one
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
          chatsRef.current.find(c => c.participant?.id === signal.senderId || c.id === signal.senderId)?.participant || {
            id: signal.senderId,
            name: 'Unknown Caller',
            handle: '@unknown',
            avatar: '',
            statusMessage: 'Calling...',
            publicKey: '',
            inviteCodesRemaining: 0,
            isVerifiedMember: true,
            memberSince: '2026',
            twoFactorEnabled: true,
            passkeyRegistered: true,
            fingerprintHash: '',
          };

        let sas: string[] = signal.sasWords || [];
        if (sas.length === 0 && mySecretKeyRef.current && callerProfile.publicKey && callerProfile.publicKey.length >= 32) {
          try {
            let callTimestamp = signal.timestamp;
            if (!callTimestamp && signal.callId && signal.callId.startsWith('call_')) {
              const parts = signal.callId.split('_');
              if (parts[1] && !isNaN(Number(parts[1]))) {
                callTimestamp = Number(parts[1]);
              }
            }
            if (!callTimestamp) callTimestamp = Date.now();
            sas = await generateCallSasWords(mySecretKeyRef.current, callerProfile.publicKey, callTimestamp);
          } catch (sasErr) {
            console.warn('[Call] SAS calculation failed:', sasErr);
            sas = [];
          }
        }

        if (signal.senderId) {
          setLastSeenMap(prev => ({ ...prev, [signal.senderId]: signal.timestamp || Date.now() }));
        }

        pendingIncomingCallRef.current = { callId: signal.callId, senderId: signal.senderId, sdp: signal.sdp };
        activeCallIdRef.current = signal.callId;
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

        notificationService.showCallNotification({
          callId: signal.callId,
          callerId: signal.senderId,
          callerName: callerProfile.name,
          callType: signal.type || 'audio',
          avatarUri: callerProfile.avatar,
          isDecoyMode,
          onAccept: () => handleAcceptIncomingCall(),
          onDecline: () => handleHangupCall(),
        }).catch(() => {});

        api.ackPendingCall().catch(() => {});
      } else if (signal.signalType === 'answer') {
        notificationService.cancelCallNotification().catch(() => {});
        if (activeCallIdRef.current && signal.callId && signal.callId !== activeCallIdRef.current) {
          return;
        }
        await callAudio.stopAudio();
        await webrtcCallEngine.handleRemoteAnswer(signal.sdp, callStateRef.current.isSpeakerOn);
        setCallState(prev => ({ ...prev, status: 'connected' }));
        startCallTimer();
      } else if (signal.signalType === 'restart-offer' || signal.signalType === 'restart-answer') {
        // Mid-call ICE restart renegotiation (same callId, never a new call —
        // must NOT go through the offer path or the peer would re-ring).
        if (!activeCallIdRef.current || !signal.callId || signal.callId !== activeCallIdRef.current) {
          return;
        }
        if (!callStateRef.current.active) return;
        try {
          if (signal.signalType === 'restart-offer') {
            await webrtcCallEngine.handleRestartOffer(signal.sdp);
          } else {
            await webrtcCallEngine.handleRestartAnswer(signal.sdp);
          }
        } catch (err) {
          console.warn('[Call] ICE restart signaling failed:', err);
        }
      } else if (signal.signalType === 'ice-candidate') {
        if (activeCallIdRef.current && signal.callId && signal.callId !== activeCallIdRef.current) {
          return;
        }
        await webrtcCallEngine.handleRemoteIceCandidate(signal.candidate);
      } else if (signal.signalType === 'hangup' || signal.signalType === 'reject') {
        notificationService.cancelCallNotification().catch(() => {});
        if (activeCallIdRef.current && signal.callId && signal.callId !== activeCallIdRef.current && pendingIncomingCallRef.current?.callId !== signal.callId) {
          return;
        }
        stopCallTimer();
        webrtcCallEngine.cleanup();
        callAudio.playHangup();
        setLocalStream(null);
        setRemoteStream(null);
        pendingIncomingCallRef.current = null;
        activeCallIdRef.current = null;
        logCallToChat(callStateRef.current, signal.signalType === 'reject' ? 'declined' : 'missed');
        setCallState(prev => ({ ...prev, active: false, status: 'ended', duration: 0 }));
      }
    };

    const unsubCall = socketService.onCallSignal(handleIncomingCallSignal);

    // Start background sync / polling for calls and messages when outside app
    if (backgroundSyncEnabled) {
      startBackgroundSync({
        onIncomingCall: signal => {
          handleIncomingCallSignal(signal);
        },
        onUnreadUpdate: data => {
          if (data.unreadThreads && data.unreadThreads.length > 0) {
            setIsChatHeadDismissed(false);
            const rawId = data.unreadThreads[0].peerId;
            const normalizedId =
              chatsRef.current.find(c => c.id === rawId || c.participant?.id === rawId)?.id || rawId;
            setActiveChatHeadContactId(normalizedId);
            reloadDynamicData(currentUser.id);
          }
        },
      });
    } else {
      stopBackgroundSync();
    }

    // Presence: snapshot on connect (with last-seen timestamps), then incremental updates.
    const unsubPresenceSnapshot = socketService.onPresenceSnapshot(data => {
      if (Array.isArray(data)) {
        setOnlineUserIds(new Set(data));
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.online)) {
          setOnlineUserIds(new Set(data.online));
        }
        if (data.lastSeen) {
          setLastSeenMap(prev => ({ ...prev, ...data.lastSeen }));
        }
      }
    });
    const unsubPresenceUpdate = socketService.onPresenceUpdate(({ userId, status, timestamp }) => {
      setOnlineUserIds(prev => {
        const next = new Set(prev);
        if (status === 'online') next.add(userId);
        else next.delete(userId);
        return next;
      });
      if (status === 'offline') {
        const ts = timestamp || Date.now();
        setLastSeenMap(prev => ({ ...prev, [userId]: ts }));
      }
    });

    return () => {
      stopBackgroundSync();
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
  }, [currentUser?.id, backgroundSyncEnabled]);

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

  // Handler: Send Message to Any Chat (used by both Full Chat & ChatHeadOverlay)
  const sendMessageToChat = async (targetChatId: string, text: string, attachment?: Attachment, replyToId?: string) => {
    if (isDecoyMode) {
      const newDecoyMsg: Message = {
        id: `decoy_msg_${Date.now()}`,
        chatId: targetChatId,
        senderId: 'decoy_operative',
        receiverId: targetChatId,
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
        [targetChatId]: [...(prev[targetChatId] || []), newDecoyMsg],
      }));
      setDecoyChats(prev =>
        prev.map(c => (c.id === targetChatId ? { ...c, lastMessage: newDecoyMsg } : c))
      );
      return;
    }

    if (!currentUser || !targetChatId || !mySecretKey) return;

    const targetChat = chats.find(c => c.id === targetChatId);
    if (!targetChat) return;

    const targetUserId = targetChat.participant.id;
    const disappearingSecs = targetChat.disappearingTimer;

    let encryptedPayload: EncryptedPayload;
    try {
      encryptedPayload = encryptMessage(
        text,
        mySecretKey,
        targetChat.participant.publicKey,
        currentUser.publicKey
      );
    } catch (encErr) {
      console.warn('Encryption failed:', encErr);
      Alert.alert('Encryption Error', 'Failed to encrypt message with recipient public key.');
      return;
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newMsg: Message = {
      id: messageId,
      chatId: targetChatId,
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

    if (targetChatId === activeChatId) {
      setMessages(prev => [...prev, newMsg]);
    }
    setChatHeadMessages(prev => [...prev, newMsg]);

    setChats(prev =>
      prev.map(c =>
        c.id === targetChatId ? { ...c, lastMessage: newMsg, unreadCount: 0 } : c
      )
    );

    // Guaranteed database write to backend (text stripped on wire for zero plaintext exposure)
    const wireMsg: Message = { ...newMsg, text: '' };
    api.sendMessage(wireMsg).catch(err => console.warn('REST send err:', err));

    // Real-time forward via Socket.IO
    socketService.sendMessage(wireMsg);
  };

  const handleSendMessage = async (text: string, attachment?: Attachment, replyToId?: string) => {
    if (activeChatId) {
      await sendMessageToChat(activeChatId, text, attachment, replyToId);
    }
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
        const newInvite = res.invite;
        setInvites(prev => [newInvite, ...prev]);
        if (typeof res.remainingCodes === 'number') {
          const remaining = res.remainingCodes;
          setCurrentUser(prev => prev ? { ...prev, inviteCodesRemaining: remaining } : null);
        }
        Alert.alert('Invite Code Created', `Code: ${newInvite.code}\nValid for 7 days.`);
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
    stopBackgroundSync();
    setIsChatHeadDismissed(false);
    setActiveChatHeadContactId(null);
    await clearSession();
    socketService.disconnect({ clearListeners: true });
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
  // Messenger-style: in-app bubble exists ONLY for explicitly minimized /
  // unread threads (chatHeadContactIds). No fallback to displayedChats[0] —
  // that fallback is what kept a head floating over the chat list on fresh
  // launch with zero unread. The outside-the-app case is covered by the
  // native OS overlay (chatHeadNative), not this in-app view.
  const chatHeadThread = activeChatHeadContactId
    ? displayedChats.find(c => c.id === activeChatHeadContactId || c.participant?.id === activeChatHeadContactId) || null
    : null;

  // Multi-user Chat Head threads (up to 3 users max), deduped by thread id so
  // one conversation can never render two bubbles even if the id list ever
  // mixes raw participant ids and thread ids.
  const chatHeadThreads: ChatThread[] = (() => {
    const seen = new Set<string>();
    const out: ChatThread[] = [];
    for (const id of chatHeadContactIds) {
      const t = displayedChats.find(c => c.id === id || c.participant?.id === id);
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
      if (out.length >= 3) break;
    }
    return out;
  })();

  const effectiveChatHeadThreads: ChatThread[] = chatHeadThreads.length > 0
    ? chatHeadThreads
    : (chatHeadThread ? [chatHeadThread] : []);

  const activeChatHeadThread = (activeChatHeadContactId
    ? effectiveChatHeadThreads.find(c => c.id === activeChatHeadContactId)
    : null) || effectiveChatHeadThreads[0] || null;

  // While the in-app mini-chat is expanded, make sure the OS-level bubble is
  // hidden so the two systems never show the same contact twice at once.
  useEffect(() => {
    if (isChatHeadExpanded) {
      chatHeadNative.hideNativeChatHead().catch(() => {});
    }
  }, [isChatHeadExpanded]);

  // Load full conversation history for the active Chat Head (all messages decrypted)
  useEffect(() => {
    if (!activeChatHeadThread || !currentUser || !mySecretKey) {
      setChatHeadMessages([]);
      return;
    }
    if (activeChatHeadThread.id === activeChatId) {
      setChatHeadMessages(messages);
      return;
    }
    let isMounted = true;
    api
      .getMessages(activeChatHeadThread.id, currentUser.id)
      .then(rawMessages => {
        if (!isMounted) return;
        const knownPublicKey = activeChatHeadThread.participant.publicKey;
        const decrypted: Message[] = rawMessages.map(msg => {
          if (msg.isDeletedForEveryone) return { ...msg, text: '' };
          if (msg.text) return msg;
          const { text } = decryptVerified(msg.encryptedPayload, knownPublicKey);
          return { ...msg, text: text || '[Encrypted message]' };
        });
        setChatHeadMessages(decrypted);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [activeChatHeadThread?.id, activeChatId, messages, currentUser?.id, mySecretKey]);

  // Send Attachment directly from Chat Head Overlay
  const handleSendAttachmentFromChatHead = async (
    targetChatId: string,
    asset: ChatHeadAttachmentData
  ) => {
    if (!currentUser || !mySecretKey) return;
    const targetChat = chats.find(c => c.id === targetChatId);
    if (!targetChat) return;

    try {
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const encryptedPayload = encryptMessage(
        base64Data,
        mySecretKey,
        targetChat.participant.publicKey,
        currentUser.publicKey
      );

      const mimeType = asset.mimeType || (asset.type === 'audio' ? 'audio/m4a' : 'image/jpeg');
      const uploadResult = await api.uploadMedia({
        name: asset.name || (asset.type === 'audio' ? 'Voice Note' : 'photo.jpg'),
        type: asset.type === 'audio' ? 'audio' : 'image',
        size: asset.size || base64Data.length,
        mimeType,
        receiverId: targetChat.participant.id,
        encryptedPayload,
      });

      if (uploadResult.success && uploadResult.attachment) {
        await sendMessageToChat(
          targetChatId,
          asset.type === 'audio' ? '🎤 Encrypted Voice Message' : '📷 Encrypted Image',
          uploadResult.attachment
        );
      }
    } catch (err) {
      console.warn('[App] Failed to send attachment from chat head:', err);
    }
  };

  // Outside-the-App Messenger Chat Heads: Automatically activates when app is minimized / in background
  useEffect(() => {
    const handleChatHeadIntent = (data: { chatId: string; contactName?: string; fromChatHead?: boolean }) => {
      if (data && data.chatId) {
        // Native side sends a contact/thread id — normalize to thread id.
        const normalizedId =
          chatsRef.current.find(c => c.id === data.chatId || c.participant?.id === data.chatId)?.id || data.chatId;
        setActiveChatHeadContactId(normalizedId);
        setChatHeadContactIds(prev => {
          const normalized = prev.map(
            pid => chatsRef.current.find(c => c.id === pid || c.participant?.id === pid)?.id || pid
          );
          const filtered = normalized.filter(id => id !== normalizedId);
          return [normalizedId, ...filtered].slice(0, 3);
        });
        setIsChatHeadDismissed(false);
        setIsChatHeadExpanded(true); // Open floating quick chat directly!
        if (data.fromChatHead) {
          setIsOpenedFromChatHead(true);
        }
      }
    };

    // Check if app was opened by tapping a floating Chat Head from outside the app
    const checkPendingIntent = async () => {
      try {
        const pending = await chatHeadNative.getPendingChatIntent();
        if (pending) {
          handleChatHeadIntent(pending);
        }
      } catch (err) {
        console.warn('[ChatHead] Pending intent notice:', err);
      }
    };

    checkPendingIntent().catch(() => {});

    const intentSub = DeviceEventEmitter.addListener('onChatHeadIntent', handleChatHeadIntent);

    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        // App returned to foreground: hide outside native overlay so it can
        // never linger on top of the in-app bubble (the double-bubble bug)
        // and check for pending tap intent.
        chatHeadNative.hideNativeChatHead().catch(() => {});
        checkPendingIntent().catch(() => {});
      } else if (nextState.match(/inactive|background/)) {
        setIsOpenedFromChatHead(false);
        setIsChatHeadExpanded(false);
        // App minimized: show the native bubble ONLY if there are genuinely
        // unread messages waiting (most recent first). Exiting after a normal
        // chat with nothing unread leaves no bubble behind.
        if (chatHeadsEnabled && currentUser && !isAppLocked && !isDecoyMode) {
          const freshChats = chatsRef.current;
          const unreadThreads = freshChats
            .filter(c => (c.unreadCount || 0) > 0)
            .sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
          const preferred = activeChatHeadContactIdRef.current
            ? unreadThreads.find(
                t =>
                  t.id === activeChatHeadContactIdRef.current ||
                  t.participant?.id === activeChatHeadContactIdRef.current
              )
            : null;
          const top = preferred || unreadThreads[0] || null;
          if (top) {
            chatHeadNative
              .showNativeChatHead({
                contactId: top.id,
                contactName: top.participant.name,
                avatarUrl: top.participant.avatar,
                unreadCount: top.unreadCount || 0,
                isOnline: onlineUserIds.has(top.participant.id),
              })
              .catch(() => {});
          } else {
            chatHeadNative.hideNativeChatHead().catch(() => {});
          }
        } else {
          chatHeadNative.hideNativeChatHead().catch(() => {});
        }
      }
    });

    return () => {
      sub.remove();
      intentSub.remove();
    };
  }, [chatHeadsEnabled, currentUser, isAppLocked, isDecoyMode, onlineUserIds]);

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[
          styles.safeArea,
          isOpenedFromChatHead && isChatHeadExpanded && styles.safeAreaTranslucent,
        ]}
      >
        <StatusBar
          barStyle={isOpenedFromChatHead && isChatHeadExpanded ? 'light-content' : 'dark-content'}
          backgroundColor={isOpenedFromChatHead && isChatHeadExpanded ? 'transparent' : colors.background}
          translucent={isOpenedFromChatHead && isChatHeadExpanded}
        />

        {/* Screen Render: only rendered when NOT in floating chat head mode */}
        {!(isOpenedFromChatHead && isChatHeadExpanded) && (
          <>
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
                lastSeenMap={lastSeenMap}
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                onSelectChat={chatId => {
                  setActiveChatId(chatId);
                  setActiveChatHeadContactId(chatId);
                  // User opened it full-screen — drop it from the minimized
                  // bubble stack so the bubble doesn't linger over the chat.
                  setChatHeadContactIds(prev => prev.filter(id => {
                    const t = chats.find(c => c.id === id || c.participant?.id === id);
                    return t ? t.id !== chatId : id !== chatId;
                  }));
                  setIsChatHeadExpanded(false);
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
                lastActiveAt={lastSeenMap[activeChat.participant.id] ?? activeChat.participant.lastActiveAt}
                onBack={() => {
                  setActiveChatId(null);
                  setCurrentScreen('chat_list');
                }}
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
                onToggleAntiScreenshot={handleToggleAntiScreenshot}
                callVerificationEnabled={callVerificationEnabled}
                onToggleCallVerification={handleToggleCallVerification}
                autoLockDelay={autoLockDelay}
                onChangeAutoLockDelay={handleChangeAutoLockDelay}
                onOpenInvites={() => setShowInvitesModal(true)}
                onOpenLinkedDevices={() => setShowLinkedDevicesModal(true)}
                onOpenCloudBackup={() => {
                  setCloudBackupInitialMode('backup');
                  setShowCloudBackupModal(true);
                }}
                backupFrequency={backupFrequency}
                onChangeBackupFrequency={handleUpdateBackupFrequency}
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
                backgroundSyncEnabled={backgroundSyncEnabled}
                onToggleBackgroundSync={handleToggleBackgroundSync}
                chatHeadsEnabled={chatHeadsEnabled}
                onToggleChatHeads={handleToggleChatHeads}
              />
            )}
          </View>
        )}
          </>
        )}

        {/* Contact Requests Modal */}
        <ContactRequestsModal
          visible={!isDecoyMode && showRequestsModal}
          incomingRequests={incomingRequests}
          outgoingRequests={outgoingRequests}
          onAccept={handleAcceptContactRequest}
          onDecline={handleDeclineContactRequest}
          onClose={() => setShowRequestsModal(false)}
        />

        {/* Search Operative & Connect Modal */}
        <SearchOperativeModal
          visible={!isDecoyMode && showSearchModal}
          currentUserId={currentUser?.id || ''}
          onSendRequest={handleSendContactRequest}
          onOpenChat={peerId => {
            setActiveChatId(peerId);
            setActiveChatHeadContactId(peerId);
            setChatHeadContactIds(prev => prev.filter(id => id !== peerId));
            setIsChatHeadExpanded(false);
            setCurrentScreen('chat_detail');
          }}
          onClose={() => setShowSearchModal(false)}
        />

        {/* Ciphertext Inspector Modal */}
        <CipherInspectorModal
          visible={!isDecoyMode && !!inspectingMessage}
          message={inspectingMessage}
          onClose={() => setInspectingMessage(null)}
        />

        {/* Safety Number Verification Modal */}
        <SafetyNumberModal
          visible={!isDecoyMode && !!safetyModalChat}
          chat={safetyModalChat}
          currentUser={currentUser}
          participant={safetyModalChat?.participant || null}
          safetyNumber={safetyModalChat?.safetyNumber}
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
          visible={!isDecoyMode && showInvitesModal}
          invites={invites}
          remainingCount={currentUser?.inviteCodesRemaining ?? 0}
          onGenerateInvite={handleGenerateInvite}
          onClose={() => setShowInvitesModal(false)}
        />

        {/* Linked Devices Modal */}
        <LinkedDevicesModal
          visible={!isDecoyMode && showLinkedDevicesModal}
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
          visible={!isDecoyMode && showCloudBackupModal}
          initialMode={cloudBackupInitialMode}
          metadata={cloudBackupMetadata}
          backupFrequency={backupFrequency}
          onChangeFrequency={handleUpdateBackupFrequency}
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
              backupFrequency,
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

        {/* Restore Previous Session Custom Confirmation Modal */}
        <RestoreSessionModal
          visible={Boolean(restoreSessionPrompt?.visible)}
          onRestore={() => {
            restoreSessionPrompt?.resolve(true);
            setRestoreSessionPrompt(null);
          }}
          onStartFresh={() => {
            restoreSessionPrompt?.resolve(false);
            setRestoreSessionPrompt(null);
          }}
        />

        {/* Floating mini-chat — OUTSIDE-ONLY. It renders solely for the
            OS-bubble launch flow (isOpenedFromChatHead); inside the app there
            is deliberately no floating bubble, only the native overlay when
            the app is backgrounded. */}
        {currentUser &&
          chatHeadsEnabled &&
          !isAppLocked &&
          isOpenedFromChatHead &&
          effectiveChatHeadThreads.length > 0 && (
            <ChatHeadOverlay
              threads={effectiveChatHeadThreads}
              activeThreadId={activeChatHeadThread?.id}
              currentUser={displayedUser || currentUser}
              messages={activeChatHeadThread?.id === activeChatId ? messages : chatHeadMessages}
              unreadCount={activeChatHeadThread?.unreadCount || 0}
              isOnline={activeChatHeadThread ? onlineUserIds.has(activeChatHeadThread.participant.id) : false}
              onlineUserIds={onlineUserIds}
              lastSeenMap={lastSeenMap}
              isExpanded={isChatHeadExpanded}
              onToggleExpand={setIsChatHeadExpanded}
              isOpenedFromChatHead={isOpenedFromChatHead}
              onSelectThread={threadId => setActiveChatHeadContactId(threadId)}
              onCloseThread={threadId => {
                setChatHeadContactIds(prev => {
                  const updated = prev.filter(id => id !== threadId);
                  if (updated.length === 0) {
                    setIsChatHeadDismissed(true);
                    setIsChatHeadExpanded(false);
                  }
                  return updated;
                });
                if (activeChatHeadContactId === threadId) {
                  setActiveChatHeadContactId(null);
                }
              }}
              onSendMessage={text => {
                if (activeChatHeadThread) {
                  sendMessageToChat(activeChatHeadThread.id, text);
                }
              }}
              onSendAttachment={handleSendAttachmentFromChatHead}
              onOpenFullChat={chatId => {
                setIsOpenedFromChatHead(false);
                setIsChatHeadExpanded(false);
                setActiveChatId(chatId);
                setActiveChatHeadContactId(chatId);
                setChatHeadContactIds(prev => prev.filter(id => id !== chatId));
                setCurrentScreen('chat_detail');
              }}
              onStartCall={(type, threadId) => {
                const targetId = threadId || activeChatHeadThread?.id;
                if (targetId) {
                  setActiveChatId(targetId);
                  handleStartCall(type);
                }
              }}
              onDismiss={() => {
                if (isOpenedFromChatHead) {
                  handleCloseFloatingWindow();
                } else {
                  setIsChatHeadDismissed(true);
                  setIsChatHeadExpanded(false);
                }
              }}
              onDismissFloating={handleCloseFloatingWindow}
            />
          )}

        {/* Heads-Up In-App Notification Banner (Interactive In-Header Quick Chat, Attachments & Calls) */}
        <InAppNotificationBanner
          onQuickReply={(chatId, text) => sendMessageToChat(chatId, text)}
          onSendAttachment={handleSendAttachmentFromChatHead}
          onStartCall={(type, chatId) => {
            setActiveChatId(chatId);
            handleStartCall(type);
          }}
          onOpenChat={chatId => {
            setActiveChatId(chatId);
            setActiveChatHeadContactId(chatId);
            setCurrentScreen('chat_detail');
          }}
          onOpenSecurity={() => {
            const chat = chats.find(c => c.id === activeChatId);
            if (chat) setSafetyModalChat(chat);
            else setCurrentScreen('settings');
          }}
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
  safeAreaTranslucent: {
    backgroundColor: 'transparent',
  },
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
