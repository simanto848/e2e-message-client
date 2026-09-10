import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, StatusBar, Alert, AppState, BackHandler, InteractionManager, DeviceEventEmitter } from 'react-native';
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
  getPrimaryPin,
  getHistoricalKeyPairs,
  saveHistoricalKeyPair,
  saveBackupFrequency,
  getBackupFrequency,
  saveBackupPassphrase,
  getBackupPassphrase,
  wipeAllSecureData,
} from './src/utils/keyStore';
import { clearDuressConfig } from './src/utils/duressConfig';

import { encryptBackup, decryptBackup, BackupPayload, BACKUP_MIN_PASSPHRASE_LENGTH } from './src/utils/backupCrypto';
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
import { InAppNotificationBanner } from './src/components/InAppNotificationBanner';
import { Header } from './src/components/Header';
import { BottomNavBar } from './src/components/BottomNavBar';
import { CipherInspectorModal } from './src/components/CipherInspectorModal';
import { SafetyNumberModal } from './src/components/SafetyNumberModal';
import { CallModal } from './src/components/CallModal';
import { CallsModal } from './src/components/CallsModal';
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
import { ForwardPickerModal } from './src/components/ForwardPickerModal';
import { RestoreSessionModal } from './src/components/RestoreSessionModal';
import { notificationService } from './src/services/notificationService';
import {
  ensureAndroidChannels,
  configureForegroundHandler,
  registerPushToken,
  addPushResponseListener,
} from './src/services/pushNotifications';
import {
  setupCallKeep,
  displayIncomingCall,
  reportAllCallsEnded,
  newCallUUID,
  addCallKeepListeners,
} from './src/services/callKeepService';
import {
  startBackgroundSync,
  stopBackgroundSync,
  getBackgroundSyncSettings,
  setBackgroundSyncEnabled,
} from './src/services/backgroundSync';
import { perfMark, perfSince, perfLog } from './src/utils/perf';
import { loadOutbox, saveOutbox, clearOutbox, removeOutboxEntry } from './src/utils/outboxStore';
import {
  saveCachedProfile,
  loadCachedProfile,
  clearCachedProfile,
  clearUserCache,
  saveCachedChats,
  loadCachedChats,
  mergeCachedMessages,
  loadCachedMessageList,
  removeCachedMessage,
  purgeExpiredCachedMessages,
  tombstoneCachedMessage,
} from './src/utils/messageCache';
import type { WireMessage } from './src/services/api';
import {
  DECOY_USER,
  DECOY_ENCRYPTED_PAYLOAD,
  INITIAL_DECOY_CHATS,
  INITIAL_DECOY_MESSAGES,
} from './src/data/decoy';
import { formatCallDuration } from './src/utils/format';
import { logger } from './src/utils/logger';
import { useAppNavigation } from './src/hooks/useAppNavigation';
import { useAppModals } from './src/hooks/useAppModals';
import { useHardwareBack } from './src/hooks/useHardwareBack';
import type { ModalKey } from './src/hooks/useHardwareBack';

perfMark('app_start');

export default function App() {
  // App & User State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const {
    currentScreen,
    setCurrentScreen,
    activeChatId,
    setActiveChatId,
    resetToAuth,
    enterApp,
  } = useAppNavigation();

  // Duress & Decoy State (modal visibility lives in useAppModals)
  const [decoyChats, setDecoyChats] = useState<ChatThread[]>(INITIAL_DECOY_CHATS);
  const [decoyMessages, setDecoyMessages] = useState<Record<string, Message[]>>(INITIAL_DECOY_MESSAGES);

  // Dynamic Data States (from Postgres Backend)
  const [chats, setChats] = useState<ChatThread[]>([]);
  // True only until the very first contacts fetch after login resolves —
  // lets the chat list show loading skeletons instead of momentarily
  // looking identical to "you have zero contacts" during normal startup latency.
  const [isInitialChatsLoading, setIsInitialChatsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  // Paged history: latest PAGE_SIZE first, older windows on scroll-to-top.
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const hasMoreRef = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const MESSAGE_PAGE_SIZE = 50;
  // Realtime connectivity (drives offline banner + outbox flushing).
  const [isSocketConnected, setIsSocketConnected] = useState(socketService.isConnected());
  // Offline outbox: wire payloads whose REST persist failed (offline send).
  // The socket layer has its own queue for realtime delivery; this one guards
  // the DATABASE write, which used to be fire-and-forget (lost forever).
  // Entries persist in AsyncStorage so a force-kill can't eat unsent mail.
  const outboxRef = useRef<Map<string, { wire: Message; display: Message }>>(new Map());
  const [outboxCount, setOutboxCount] = useState(0);

  const persistOutbox = useCallback(() => {
    const uid = currentUserRef.current?.id;
    if (!uid) return;
    saveOutbox(uid, Array.from(outboxRef.current.values())).catch(() => {});
  }, []);
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

    if (isIncoming && status === 'missed') {
      notificationService.showMissedCallNotification({
        callerId: peer.id,
        callerName: peer.name || peer.handle || 'Contact',
        callType: finalState.type || 'audio',
        chatId: peer.id,
        isDecoyMode: isDecoyModeRef.current,
        onPress: () => {
          setActiveChatId(peer.id);
          setCurrentScreen('chat_detail');
        },
      }).catch(() => {});
    }

    let encryptedPayload;
    try {
      encryptedPayload = encryptMessage(text, secret, peer.publicKey, user.publicKey);
    } catch (err) {
      logger.warn('CallLog', 'Encryption notice:', err);
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
      const wireMsg = { ...newMsg, text: '' } as WireMessage;
      const clientMessageId = newMsg.id;
      api.sendMessage(wireMsg, { clientMessageId }).catch(err => logger.warn('CallLog', 'REST send err:', err));
      try {
        socketService.sendMessage(wireMsg as unknown as Message, { clientMessageId });
      } catch (err) {
        logger.warn('CallLog', 'Socket send notice:', err);
      }
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
  const isDecoyModeRef = useRef(isDecoyMode);
  isDecoyModeRef.current = isDecoyMode;
  const isAppLockedRef = useRef(isAppLocked);
  isAppLockedRef.current = isAppLocked;
  // Idempotency for read receipts: one conversation is marked once per open,
  // retries reuse the same clientMessageId so the server dedupes.
  const sentReadReceiptsRef = useRef<Set<string>>(new Set());
  // Stable chronological order for paged history: (timestamp, id) tie-break
  // so equal-timestamp messages never flip or duplicate across pages.
  const sortMessagesStable = (list: Message[]): Message[] =>
    [...list].sort((a, b) => (a.timestamp - b.timestamp) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Single-source read receipt: socket when live, REST fallback when offline —
  // never both for the same event. Suppressed while locked / in decoy mode.
  const sendReadReceiptSingleSource = (peerId: string, chatId: string, scope: string) => {
    if (isAppLockedRef.current || isDecoyModeRef.current) return;
    if (sentReadReceiptsRef.current.has(scope)) return;
    sentReadReceiptsRef.current.add(scope);
    const clientMessageId = `read_${chatId}_${scope}`;
    if (socketService.isConnected()) {
      try {
        socketService.markRead(peerId, chatId, clientMessageId);
      } catch {}
    } else {
      api.markMessagesAsRead(peerId, chatId, clientMessageId).catch(() => {});
    }
  };
  const sendStatusSingleSource = (
    messageId: string,
    chatId: string,
    status: 'delivered' | 'read',
    peerId?: string
  ) => {
    if (isAppLockedRef.current || isDecoyModeRef.current) return;
    const scope = `${status}_${messageId}`;
    if (sentReadReceiptsRef.current.has(scope)) return;
    sentReadReceiptsRef.current.add(scope);
    const clientMessageId = `${status}_${messageId}`;
    if (socketService.isConnected()) {
      try {
        socketService.sendStatus(messageId, chatId, status, clientMessageId);
      } catch {}
    } else if (status === 'read' && peerId) {
      api.markMessagesAsRead(peerId, chatId, clientMessageId).catch(() => {});
    }
  };
  // Explicit "lose history" gate for fresh-install key rotation: never
  // auto-mint a new identity key without the user understanding that every
  // message encrypted to the old key becomes permanently unreadable.
  const confirmLoseHistory = (): Promise<boolean> =>
    new Promise(resolve => {
      Alert.alert(
        'No Backup Found — Start Fresh?',
        'This device has no encryption keys for this account and no restorable backup was unlocked. Generating a new identity key will PERMANENTLY lose access to your previous message history (contacts will also see a safety-number change). Restore from backup instead if you have your backup password.',
        [
          { text: 'Restore Instead', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Lose History & Continue', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
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
      logger.warn('AntiScreenshot', 'Screen-capture toggle notice:', err);
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
        logger.warn('AntiScreenshot', 'Enforce notice:', err);
      }
    };
    enforce();
  }, [antiScreenshotEnabled, currentUser]);

  // Screenshot-attempt notice: if a capture succeeds while viewing a real
  // conversation (blocking off or unsupported device), warn loudly and tell
  // the peer over the verified socket channel (rate-limited server-side).
  useEffect(() => {
    if (!currentUser || !activeChatId || isDecoyMode || isAppLocked) return;
    let sub: { remove: () => void } | null = null;
    try {
      sub = ScreenCapture.addScreenshotListener(() => {
        const chatId = activeChatIdRef.current;
        if (!chatId || isDecoyModeRef.current) return;
        const chat = chatsRef.current.find(c => c.id === chatId);
        if (!chat) return;
        socketService.sendScreenshotNotice(chat.participant.id, chatId);
        notificationService.showSecurityNotification({
          title: 'Screenshot Captured',
          message: `This chat screen was captured. ${chat.participant.name} has been notified. Enable screenshot blocking in Settings for stronger protection.`,
          type: 'verification',
        }).catch(() => {});
      });
    } catch (err) {
      logger.warn('AntiScreenshot', 'Listener notice:', err);
    }
    return () => {
      try {
        sub?.remove();
      } catch {}
    };
  }, [currentUser, activeChatId, isDecoyMode, isAppLocked]);

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

  // Modals (visibility state lives in useAppModals; release payload stays
  // here next to the update-check effect that produces it).
  const {
    showInvitesModal,
    setShowInvitesModal,
    showLinkedDevicesModal,
    setShowLinkedDevicesModal,
    showCloudBackupModal,
    setShowCloudBackupModal,
    showEditProfileModal,
    setShowEditProfileModal,
    showChangePasswordModal,
    setShowChangePasswordModal,
    showRequestsModal,
    setShowRequestsModal,
    showSearchModal,
    setShowSearchModal,
    showPermissionsModal,
    setShowPermissionsModal,
    showUpdateModal,
    setShowUpdateModal,
    showDuressModal,
    setShowDuressModal,
  } = useAppModals();
  const [availableRelease, setAvailableRelease] = useState<ReleaseInfo | null>(null);
  const [showCallsModal, setShowCallsModal] = useState(false);

  // Expo notification channels + foreground handler (once, launch).
  // Registration itself happens post-auth (registerPushToken) so the token
  // can be attributed to a user once the server endpoint lands.
  useEffect(() => {
    configureForegroundHandler();
    ensureAndroidChannels().catch(() => {});
    // System call UI (CallKit / ConnectionService). No-op in Expo Go.
    setupCallKeep().catch(() => {});
  }, []);

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
        logger.info('Updates', 'Update check notice:', err);
      }
    };
    checkUpdates();
  }, []);

  // Background Sync & Notifications
  const [backgroundSyncEnabled, setBackgroundSyncEnabledState] = useState(true);

  useEffect(() => {
    getBackgroundSyncSettings().then(settings => {
      setBackgroundSyncEnabledState(settings.backgroundSyncEnabled);
    });
  }, []);

  const handleToggleBackgroundSync = async (val: boolean) => {
    setBackgroundSyncEnabledState(val);
    await setBackgroundSyncEnabled(val);
  };

  // Android Hardware / Swipe Back Navigation Handler. The priority chain
  // lives in useHardwareBack (pure + unit-tested); here we only bind state.
  const closeBackModal = (modal: ModalKey) => {
    switch (modal) {
      case 'update': setShowUpdateModal(false); break;
      case 'permissions': setShowPermissionsModal(false); break;
      case 'changePassword': setShowChangePasswordModal(false); break;
      case 'editProfile': setShowEditProfileModal(false); break;
      case 'duress': setShowDuressModal(false); break;
      case 'cloudBackup': setShowCloudBackupModal(false); break;
      case 'linkedDevices': setShowLinkedDevicesModal(false); break;
      case 'invites': setShowInvitesModal(false); break;
      case 'search': setShowSearchModal(false); break;
      case 'requests': setShowRequestsModal(false); break;
      case 'calls': setShowCallsModal(false); break;
    }
  };

  useHardwareBack(
    () => ({
      isAppLocked,
      hasRestorePrompt: Boolean(restoreSessionPrompt),
      callActive: Boolean(callState.active || callState.isIncoming),
      hasInspectingMessage: Boolean(inspectingMessage),
      hasSafetyModalChat: Boolean(safetyModalChat),
      openModals: [
        showUpdateModal ? ('update' as const) : null,
        showPermissionsModal ? ('permissions' as const) : null,
        showChangePasswordModal ? ('changePassword' as const) : null,
        showEditProfileModal ? ('editProfile' as const) : null,
        showDuressModal ? ('duress' as const) : null,
        showCloudBackupModal ? ('cloudBackup' as const) : null,
        showLinkedDevicesModal ? ('linkedDevices' as const) : null,
        showInvitesModal ? ('invites' as const) : null,
        showSearchModal ? ('search' as const) : null,
        showRequestsModal ? ('requests' as const) : null,
        showCallsModal ? ('calls' as const) : null,
      ].filter((m): m is ModalKey => m !== null),
      currentScreen,
    }),
    {
      clearInspectingMessage: () => setInspectingMessage(null),
      clearSafetyModalChat: () => setSafetyModalChat(null),
      closeModal: closeBackModal,
      backFromChatDetail: () => {
        setActiveChatId(null);
        setCurrentScreen('chat_list');
      },
      backFromSettings: () => setCurrentScreen('chat_list'),
    }
  );

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
        socketService.setQueueUserId(null);
      } catch {}
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
      outboxRef.current.clear();
      setOutboxCount(0);
      if (currentUser?.id) {
        clearOutbox(currentUser.id).catch(() => {});
        clearUserCache(currentUser.id, chatsRef.current.map(c => c.id)).catch(() => {});
      }
      setActiveChatId(null);
      setHistoricalKeys([]);
      setInvites([]);
      setLinkedDevices([]);
      setIsAppLocked(false);
      setCurrentScreen('auth');
      Alert.alert('Enclave Zeroized', 'All keys, sessions, and cached data have been completely wiped.');
    } catch (err) {
      logger.warn('EmergencyWipe', 'Error:', err);
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
        socketService.reconnectIfNeeded().catch(err => logger.warn('Socket', 'Reconnect notice:', err));
        // Internet may have returned while we were away — flush queued mail
        // even if the socket hasn't finished reconnecting (REST needs no socket).
        flushOutbox().catch(() => {});
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
        logger.warn('App', 'Initial permissions check notice:', err);
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

        let profile: UserProfile | null = null;
        try {
          const res = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (!data.success || !data.user) {
            await clearSession();
            return;
          }
          profile = data.user;
          // Refresh the offline profile snapshot on every online launch.
          saveCachedProfile(userId, data.user).catch(() => {});
        } catch (netErr) {
          // No internet: fall back to the cached profile + on-device keys and
          // enter the app in offline mode (cached chats, outbox sends). Auth
          // failures above still clear the session — only network errors land
          // here, never a rejected login.
          logger.info('Cache', 'Offline launch, using cached profile');
          profile = await loadCachedProfile(userId);
          if (!profile) {
            logger.warn('Session', 'Restore notice: offline with no cached profile');
            return;
          }
        }
        if (!profile) {
          await clearSession();
          return;
        }

        // Synchronize privacy preferences from database
        applyPrivacySettings({
          blockScreenshots: profile.blockScreenshots,
          callVerification: profile.callVerification,
          autoLockDelay: profile.autoLockDelay,
        });

        const userFreq = profile.backupFrequency as BackupFrequency | undefined;
        const savedFreq = userFreq || (await getBackupFrequency());
        if (userFreq) {
          await saveBackupFrequency(userFreq);
        }
        setBackupFrequency(savedFreq);
        setCloudBackupMetadata(prev => ({ ...prev, backupFrequency: savedFreq }));

        setMySecretKey(keyPair.secretKey);
        setCurrentUser(profile);
        enterApp();
        try {
          socketService.setQueueUserId(profile.id);
        } catch {}
        await socketService.connect();
        registerPushToken().catch(() => {});
        await reloadDynamicData(profile.id, { secret: keyPair.secretKey, user: profile });
        restoreOutbox(profile.id).catch(() => {});
        performAutoBackupIfNeeded(profile, keyPair.secretKey, savedFreq);
      } catch (err) {
        logger.warn('Session', 'Restore notice:', err);
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
      // PIN-as-passphrase separation: never escrow under a weak/short login
      // PIN. Require the separate strong backup password (>=12) collected via
      // CloudBackupModal; skip + warn so the next manual backup prompts.
      if (passphrase.trim().length < BACKUP_MIN_PASSPHRASE_LENGTH) {
        logger.warn(
          'AutoBackup',
          `Saved backup secret too short (>=${BACKUP_MIN_PASSPHRASE_LENGTH} required) — skipping auto-backup until the user sets a strong backup password.`
        );
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
        logger.info('AutoBackup', `Completed ${freq} backup successfully at ${new Date(now).toISOString()}`);
      }
    } catch (err) {
      logger.info('AutoBackup', 'Notice during auto-backup:', err);
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
        logger.info('Updates', 'OTA check notice:', err);
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

    if (!keyPair) {
      // Restore-first flow: never auto-rotate on a fresh install. The server
      // escrow (if any) is tried BEFORE minting a new key, because rotation
      // permanently orphans every message encrypted to the old key and flips
      // every safety number. decryptBackup stays backward-compatible with old
      // short login PINs (null-path), so legacy vaults still unlock here.
      let backupChecked = false;
      let backupExists = false;
      try {
        const backupRes = await api.getCloudBackup(user.id, token);
        if (backupRes?.success && backupRes.backup) {
          backupChecked = true;
          backupExists = true;
          // Try the login PIN first (legacy vaults), then any saved separate
          // backup passphrase already on this device.
          const candidates: string[] = [];
          if (pinCode) candidates.push(pinCode);
          try {
            const saved = await getBackupPassphrase();
            if (saved && !candidates.includes(saved)) candidates.push(saved);
          } catch {}
          let restoredPayload: BackupPayload | null = null;
          for (const cand of candidates) {
            try {
              restoredPayload = decryptBackup(
                {
                  encryptedData: backupRes.backup.encryptedData,
                  salt: backupRes.backup.salt,
                  iv: backupRes.backup.iv,
                },
                cand
              );
            } catch {
              restoredPayload = null;
            }
            if (restoredPayload?.identityKeyPair) break;
          }

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
              if (restoredPayload.historicalKeyPairs) {
                for (const hp of restoredPayload.historicalKeyPairs) {
                  await saveHistoricalKeyPair(user.id, hp);
                }
              }
            }
          } else if (backupChecked) {
            // Vault exists but none of the supplied secrets opened it — do NOT
            // rotate yet. The user must either retry restore with their backup
            // password or explicitly accept history loss below.
            logger.warn('Backup', 'Vault exists but PIN/passphrase did not unlock it; requiring explicit choice');
          }
        }
      } catch (err) {
        logger.warn('Backup', 'Auto-restore check notice:', err);
      }

      if (!keyPair) {
        // BLOCKED auto-rotate: require an explicit "lose history" confirm
        // before generateIdentityKeyPair + updateProfile. This is the only
        // place a fresh key may be minted for an existing account.
        const confirmed = await confirmLoseHistory();
        if (!confirmed) {
          // User chose restore-instead: send them to the restore flow so they
          // can supply their strong backup password (separate from login PIN).
          setCurrentUser(user);
          setCloudBackupInitialMode('restore');
          setShowCloudBackupModal(true);
          await clearSession();
          Alert.alert(
            'Restore Required',
            'Sign in again after restoring your backup, or confirm history loss to continue with a new key.'
          );
          resetToAuth();
          return;
        }
        keyPair = generateIdentityKeyPair();
        const rotateRes = await api.updateProfile({ publicKey: keyPair.publicKey });
        if (rotateRes?.success && rotateRes.user) {
          user = rotateRes.user;
        } else {
          user = { ...user, publicKey: keyPair.publicKey };
        }
        if (backupExists) {
          logger.warn('Backup', 'Rotated keys after explicit history-loss confirm despite existing vault');
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
    enterApp();
    // useAppSecurity defaults locked=true (fail-closed): an interactive login
    // just proved the user, so unlock explicitly — otherwise a fresh login
    // would sit behind the shield until the next relock cycle.
    setIsAppLocked(false);
    sentReadReceiptsRef.current.clear();
    try {
      socketService.setQueueUserId(user.id);
    } catch {}
    saveCachedProfile(user.id, user).catch(() => {});
    perfLog('login → chat list', perfSince('app_start'));

    // PIN-as-passphrase migration: the login PIN is NEVER used as the backup
    // encryption passphrase anymore (backupCrypto requires >= 12 chars).
    // If a short login PIN is present, warn once and require a strong,
    // separate backup password on the next backup via CloudBackupModal.
    if (pinCode && pinCode.trim().length < BACKUP_MIN_PASSPHRASE_LENGTH) {
      logger.warn(
        'Backup',
        `Login PIN is not a backup passphrase (>=${BACKUP_MIN_PASSPHRASE_LENGTH} required). Prompting for a separate backup password.`
      );
      setTimeout(() => {
        Alert.alert(
          'Backup Password Required',
          `Your login PIN can no longer encrypt backups (minimum ${BACKUP_MIN_PASSPHRASE_LENGTH} characters). Please set a separate strong backup password on your next backup — your keys are NOT yet escrowed under the new policy.`
        );
      }, 1200);
    }

    // Connect realtime socket and load dynamic contacts without blocking
    socketService.connect().catch(() => {});
    registerPushToken().catch(() => {});
    reloadDynamicData(user.id, { secret: keyPair.secretKey, user }).catch(() => {});
    restoreOutbox(user.id).catch(() => {});

    // Defer scheduled auto-backup until after transitions. NOTE: no
    // PIN-escrow here by design — backups are encrypted ONLY with the
    // separate backup passphrase collected via CloudBackupModal (see
    // onCreateBackup) and remembered via getBackupPassphrase(). Using the
    // login PIN would both violate separation and throw under the >=12 rule.
    InteractionManager.runAfterInteractions(() => {
      setTimeout(async () => {
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

  // Offline fallback: decrypt the ciphertext cache into state (same rules as
  // live data — no alerts here, just visibility).
  const loadCachedDataIntoState = async (
    userId: string,
    secret: string | null,
    user: UserProfile | null
  ) => {
    try {
      const cached = await loadCachedChats(userId);
      if (cached.length === 0) return;
      const withDecrypted = cached.map(c => {
        if (!c.lastMessage || (c.lastMessage as any).isDeletedForEveryone) return c;
        const { text } = decryptWithKeys(secret, user, c.lastMessage.encryptedPayload, c.participant.publicKey);
        return { ...c, lastMessage: { ...c.lastMessage, text } };
      });
      setChats(withDecrypted);
    } catch (err) {
      logger.warn('Cache', 'Load notice:', err);
    } finally {
      setIsInitialChatsLoading(false);
    }
  };

  // 2. Reload contacts & requests from the server. Pass explicit keys on the
  // post-login path — state/refs haven't re-rendered yet at that point, so
  // the closure would otherwise decrypt every preview as "Locked".
  const reloadDynamicData = async (
    userId: string,
    override?: { secret?: string; user?: UserProfile }
  ) => {
    const secret = override?.secret ?? mySecretKeyRef.current;
    const user = override?.user ?? currentUserRef.current;
    const reloadStart = Date.now();
    try {
      const [contactsRes, reqs, userInvites, devices] = await Promise.all([
        api.getContacts(userId),
        api.getContactRequests(userId),
        api.getUserInvites(userId),
        api.getLinkedDevices(userId),
      ]);

      if (!contactsRes.success) {
        // Offline / failed fetch: never wipe visible chats or the cache.
        // Fall back to the ciphertext cache so history stays readable.
        logger.info('Cache', 'Contacts fetch failed, serving cache:', contactsRes.error || '');
        await loadCachedDataIntoState(userId, secret, user);
        return;
      }
      const contactList = contactsRes.contacts;

      // Persist the RAW server threads (ciphertext previews) for offline use.
      saveCachedChats(userId, contactList).catch(() => {});

      // The server never sees plaintext (it only stores ciphertext), so each
      // contact's "last message" preview comes back encrypted — decrypt it
      // here, the same way individual conversation messages are decrypted,
      // so the chat list can actually show a preview instead of a fixed
      // placeholder string.
      const withDecryptedPreviews = contactList.map(c => {
        if (!c.lastMessage || c.lastMessage.isDeletedForEveryone) return c;
        const { text } = decryptWithKeys(secret, user, c.lastMessage.encryptedPayload, c.participant.publicKey);
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
      // Safety-number key-change detection: the server revokes verification
      // when either party rotates keys. If a contact we had verified flips to
      // unverified with a different number, warn loudly (possible MITM or
      // legitimate reinstall — either way the user must re-check in person).
      try {
        const prevById = new Map(chatsRef.current.map(c => [c.id, c]));
        for (const c of withDecryptedPreviews) {
          const prev = prevById.get(c.id);
          if (!prev || isDecoyMode) continue;
          const wasVerified = prev.isVerifiedSafetyNumber === true;
          const nowUnverified = c.isVerifiedSafetyNumber !== true;
          const numberChanged = Boolean(prev.safetyNumber && c.safetyNumber && prev.safetyNumber !== c.safetyNumber);
          if (wasVerified && nowUnverified && numberChanged) {
            notificationService.showSecurityNotification({
              title: 'Safety Number Changed',
              message: `${c.participant.name}'s safety number changed. Verify again in person before trusting this chat.`,
              type: 'key_change',
              onPress: () => setSafetyModalChat(c),
            }).catch(() => {});
          }
        }
      } catch {}
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
      logger.info('App', 'Dynamic data fetch notice:', err);
    } finally {
      setIsInitialChatsLoading(false);
      perfLog('contacts reload', Date.now() - reloadStart);
    }
  };

  // Decrypt a payload with real key verification: the payload carries the
  // sender's public key, but we only trust it if it matches the public key
  // we actually have on file for that contact (from the directory / a prior
  // safety-number verification).
  //
  // Pure in (secret, user) so background loaders (outbox flush, pagination)
  // and post-login reloads can pass explicit keys instead of reading a stale
  // render closure — the old closure version decrypted everything as
  // "Locked — sign in again" on the first fetch after login.
  const decryptWithKeys = (
    secret: string | null,
    user: UserProfile | null,
    payload: EncryptedPayload,
    expectedPublicKey?: string
  ): { text: string; keyMismatch: boolean } => {
    if (!secret) return { text: 'Locked — sign in again to view', keyMismatch: false };
    if (!payload?.ciphertext || !payload?.iv) {
      return { text: '', keyMismatch: false };
    }

    const isSentByMe = user && payload.senderPublicKey === user.publicKey;
    const peerPublicKey = isSentByMe ? expectedPublicKey : (expectedPublicKey || payload.senderPublicKey);

    if (!peerPublicKey) {
      return { text: '⚠️ Missing recipient cryptographic public key.', keyMismatch: true };
    }

    let opened = decryptMessage(payload, secret, peerPublicKey);
    let isMismatch = !isSentByMe && Boolean(expectedPublicKey && payload.senderPublicKey && payload.senderPublicKey !== expectedPublicKey);

    // Fallbacks: if sender used a mismatched public key, flag keyMismatch
    if (opened === null && payload.senderPublicKey && payload.senderPublicKey !== peerPublicKey) {
      opened = decryptMessage(payload, secret, payload.senderPublicKey);
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

  const decryptVerified = (payload: EncryptedPayload, expectedPublicKey?: string): { text: string; keyMismatch: boolean } =>
    decryptWithKeys(mySecretKeyRef.current, currentUserRef.current, payload, expectedPublicKey);

  // 3. Load conversation messages dynamically when opening a chat
  // (latest page only — older history pages in via loadOlderMessages).
  useEffect(() => {
    if (!currentUser || !activeChatId || !mySecretKey) return;

    const targetChatId = activeChatId;
    const uid = currentUser.id;
    let cancelled = false;
    hasMoreRef.current = false;
    setHasMoreMessages(false);
    loadingMoreRef.current = false;
    setIsLoadingMore(false);
    const loadMessages = async () => {
      setIsMessagesLoading(true);
      try {
        const page = await api.getMessagesPage(targetChatId, currentUser.id, { limit: MESSAGE_PAGE_SIZE });
        const rawMessages = page.messages;
        if (cancelled || activeChatIdRef.current !== targetChatId) return;
        const knownPublicKey = chatsRef.current.find(c => c.id === targetChatId)?.participant.publicKey;

        // Empty response with a warm cache = offline (or failed page): serve
        // the cache instead of blanking the thread. A genuinely empty chat
        // has an empty cache too, so this is a no-op there.
        const source = rawMessages.length > 0 ? rawMessages : await loadCachedMessageList(uid, targetChatId);
        if (cancelled || activeChatIdRef.current !== targetChatId) return;
        if (rawMessages.length > 0) {
          mergeCachedMessages(uid, targetChatId, rawMessages).catch(() => {});
        }

        const decryptedList = source.map(m => {
          if (m.isDeletedForEveryone) return { ...m, text: '' };
          const { text, keyMismatch } = decryptVerified(m.encryptedPayload, knownPublicKey);
          return { ...m, text, keyMismatch: m.keyMismatch ?? keyMismatch };
        });

        setMessages(mergeOutboxDisplays(targetChatId, sortMessagesStable(decryptedList)));
        // hasMore = full page AND server says more (old servers: full page alone).
        const more = rawMessages.length === MESSAGE_PAGE_SIZE && page.serverHasMore;
        hasMoreRef.current = more;
        setHasMoreMessages(more);
      } catch (err) {
        if (!cancelled) logger.warn('Chat', 'Failed to load messages for chat:', targetChatId, err);
      } finally {
        if (!cancelled && activeChatIdRef.current === targetChatId) setIsMessagesLoading(false);
      }
    };

    loadMessages();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, currentUser?.id, mySecretKey]);

  // Older-history pager: prepends the next window above the current oldest.
  // No-op while a page is in flight or the server reported the beginning.
  const loadOlderMessages = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || isDecoyModeRef.current) return;
    const chatId = activeChatIdRef.current;
    const user = currentUserRef.current;
    if (!chatId || !user || !mySecretKeyRef.current) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      // (timestamp, id) cursor: the oldest visible message bounds the next
      // window. beforeId breaks equal-timestamp ties so pages never skip or
      // repeat when several messages share a millisecond.
      const sorted = [...messagesRef.current].sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : 1));
      const oldestMsg = sorted.length > 0 ? sorted[0] : null;
      const oldest = oldestMsg ? oldestMsg.timestamp : Date.now();
      const beforeId = oldestMsg ? oldestMsg.id : undefined;
      const page = await api.getMessagesPage(chatId, user.id, { limit: MESSAGE_PAGE_SIZE, before: oldest, beforeId });
      const raw = page.messages;
      if (activeChatIdRef.current !== chatId) return;
      if (raw.length === 0) {
        // Offline (or true beginning): prepend any cached history older than
        // what's on screen, then stop — no spinner loop with no network.
        const cached = await loadCachedMessageList(user.id, chatId);
        const seenIds = new Set(messagesRef.current.map(m => m.id));
        const older = cached.filter(
          m =>
            !seenIds.has(m.id) &&
            (m.timestamp < oldest || (m.timestamp === oldest && beforeId !== undefined && m.id < beforeId))
        );
        if (older.length > 0) {
          const knownPublicKey = chatsRef.current.find(c => c.id === chatId)?.participant.publicKey;
          const decryptedOlder = older.map(m => {
            if (m.isDeletedForEveryone) return { ...m, text: '' };
            const { text, keyMismatch } = decryptWithKeys(
              mySecretKeyRef.current,
              currentUserRef.current,
              m.encryptedPayload,
              knownPublicKey
            );
            return { ...m, text, keyMismatch: m.keyMismatch ?? keyMismatch };
          });
          setMessages(prev => {
            if (activeChatIdRef.current !== chatId) return prev;
            const seen = new Set(prev.map(mm => mm.id));
            const merged = [...decryptedOlder.filter(m => !seen.has(m.id)), ...prev];
            return merged.sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : 1));
          });
        }
        hasMoreRef.current = false;
        setHasMoreMessages(false);
        return;
      }
      mergeCachedMessages(user.id, chatId, raw).catch(() => {});
      const knownPublicKey = chatsRef.current.find(c => c.id === chatId)?.participant.publicKey;
      const decrypted = raw.map(m => {
        if (m.isDeletedForEveryone) return { ...m, text: '' };
        const { text, keyMismatch } = decryptWithKeys(
          mySecretKeyRef.current,
          currentUserRef.current,
          m.encryptedPayload,
          knownPublicKey
        );
        return { ...m, text, keyMismatch: m.keyMismatch ?? keyMismatch };
      });
      setMessages(prev => {
        if (activeChatIdRef.current !== chatId) return prev;
        // Dedupe by id, then stable (timestamp, id) sort so pages merge
        // deterministically even with equal timestamps.
        const byId = new Map(prev.map(mm => [mm.id, mm] as [string, Message]));
        for (const m of decrypted) {
          if (!byId.has(m.id)) byId.set(m.id, m);
        }
        return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : 1));
      });
      // hasMore = full page AND server says more (no more guessing from length alone).
      const more = raw.length === MESSAGE_PAGE_SIZE && page.serverHasMore;
      hasMoreRef.current = more;
      setHasMoreMessages(more);
    } catch (err) {
      logger.warn('History', 'Older-page fetch notice:', err);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

  // Periodic background/fallback sync: only active when app is active, unlocked, and authenticated
  useEffect(() => {
    if (!currentUser || isAppLocked) return;

    const poll = async () => {
      if (AppState.currentState !== 'active' || isAppLocked) return;
      await reloadDynamicData(currentUser.id);

      // Only re-fetch messages if socket is not connected (fallback mode).
      // Merges into the paged list (never replaces) so loaded older pages
      // survive each poll.
      if (activeChatIdRef.current && !socketService.isConnected()) {
        try {
          const raw = await api.getMessages(activeChatIdRef.current, currentUser.id, { limit: MESSAGE_PAGE_SIZE });
          const knownPublicKey = chatsRef.current.find(c => c.id === activeChatIdRef.current)?.participant.publicKey;
          const decrypted = raw.map(m => {
            if (m.isDeletedForEveryone) return { ...m, text: '' };
            const { text, keyMismatch } = decryptWithKeys(
              mySecretKeyRef.current,
              currentUserRef.current,
              m.encryptedPayload,
              knownPublicKey
            );
            return { ...m, text, keyMismatch: m.keyMismatch ?? keyMismatch };
          });
          setMessages(prev => {
            const byId = new Map(prev.map(m => [m.id, m]));
            for (const m of decrypted) byId.set(m.id, { ...byId.get(m.id), ...m });
            return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : 1));
          });
          if (raw.length > 0 && activeChatIdRef.current) {
            mergeCachedMessages(currentUser.id, activeChatIdRef.current, raw).catch(() => {});
          }
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

    // Sync immediately in case the socket connected before we subscribed.
    setIsSocketConnected(socketService.isConnected());

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

        // Cache the ciphertext immediately so it survives offline.
        if (currentUser && !isDecoyModeRef.current) {
          const cacheChatId = msg.chatId || msg.senderId;
          mergeCachedMessages(currentUser.id, cacheChatId, [{ ...incoming, text: '' }]).catch(() => {});
        }

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
          // Single-source auto-read (socket live, REST fallback), suppressed
          // while locked / in decoy mode inside the helper.
          sendStatusSingleSource(msg.id, msg.chatId, 'read', msg.senderId);
        } else {
          sendStatusSingleSource(msg.id, msg.chatId, 'delivered');

          const senderProfile = chatsRef.current.find(c => c.id === msg.senderId)?.participant;
          const currentChat = chatsRef.current.find(c => c.id === msg.senderId);
          // Secure default: previews OFF unless the thread explicitly opts in.
          const showPreview = currentChat?.notificationSettings?.showPreview === true;
          const isMuted = currentChat?.notificationSettings?.muted === true;

          if (!isMuted) {
            notificationService.showMessageNotification({
              senderId: msg.senderId,
              senderName: senderProfile?.name || 'Encrypted Chat',
              text: msg.text || '🔒 Encrypted message',
              chatId: msg.chatId || msg.senderId,
              avatarUri: senderProfile?.avatar,
              showPreview,
              isDecoyMode: isDecoyModeRef.current,
              isAppLocked: isAppLockedRef.current,
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

    // Ephemeral Delete for Everyone: tombstone RAM + cache + outbox + tray + chat preview.
    const unsubDelete = socketService.onMessageDeletedEveryone(data => {
      setMessages(prev =>
        prev.map(m =>
          m.id === data.messageId
            ? { ...m, isDeletedForEveryone: true, text: '', deletedAt: data.deletedAt }
            : m
        )
      );
      setChats(prev =>
        prev.map(c => {
          if (c.lastMessage?.id === data.messageId) {
            return {
              ...c,
              lastMessage: {
                ...c.lastMessage,
                isDeletedForEveryone: true,
                text: 'This message was deleted',
                deletedAt: data.deletedAt,
              },
            };
          }
          return c;
        })
      );
      const uid = currentUserRef.current?.id;
      if (uid) {
        if (data.chatId) {
          tombstoneCachedMessage(uid, data.chatId, data.messageId, data.deletedAt).catch(() => {});
          notificationService.cancelMessageNotification(data.chatId).catch(() => {});
        }
        chatsRef.current.forEach(c => {
          tombstoneCachedMessage(uid, c.id, data.messageId, data.deletedAt).catch(() => {});
        });
        removeOutboxEntry(uid, data.messageId).catch(() => {});
        outboxRef.current.delete(data.messageId);
        setOutboxCount(outboxRef.current.size);
      }
    });

    // Auth rejection: stop-retry already handled in socket.ts (session
    // cleared, reconnect disabled). Here we route back to auth instead of
    // spinning forever on a dead token.
    const unsubUnauthorized = socketService.onUnauthorized(() => {
      setIsSocketConnected(false);
      setCurrentUser(null);
      setMySecretKey(null);
      setChats([]);
      setMessages([]);
      outboxRef.current.clear();
      setOutboxCount(0);
      resetToAuth();
    });
    // Never-silently-dropped signaling: surface dead-letter as a missed-call /
    // not-delivered notice so the user knows the peer never got the offer.
    const unsubNotDelivered = socketService.onNotDelivered(info => {
      if (isDecoyModeRef.current || isAppLockedRef.current) return;
      if (info.queue === 'signal') {
        const kind = (info.payload as any)?.signalType || 'signal';
        logger.warn('Call', `Signaling not delivered (${kind}):`, info.reason);
        notificationService
          .showSecurityNotification({
            title: 'Call Not Delivered',
            message: `Your ${kind} could not be delivered (${info.reason}). The peer may show this as a missed call.`,
            type: 'verification',
          })
          .catch(() => {});
      }
    });

    // Connection lifecycle: drive the offline banner, flush the outbox, and
    // resync anything missed while disconnected.
    const unsubConnect = socketService.onConnect(() => {
      setIsSocketConnected(true);
      flushOutbox().catch(() => {});
      if (currentUser) reloadDynamicData(currentUser.id).catch(() => {});
    });
    const unsubDisconnect = socketService.onDisconnect(() => {
      setIsSocketConnected(false);
    });

    // Peer captured the chat screen (Signal-style screenshot notice).
    const unsubScreenshot = socketService.onScreenshotNotice(data => {
      if (isDecoyModeRef.current) return;
      const chat = chatsRef.current.find(
        c => c.participant?.id === data.senderId || c.id === data.senderId || c.id === data.chatId
      );
      notificationService.showSecurityNotification({
        title: 'Chat Screen Captured',
        message: `${data.senderName} may have captured your chat screen.`,
        type: 'verification',
        onPress: chat
          ? () => {
              setActiveChatId(chat.id);
              setCurrentScreen('chat_detail');
            }
          : undefined,
      }).catch(() => {});
    });
    // Safety-number verification changed on another of this user's sessions:
    // patch every matching thread (+ the open modal) so devices agree.
    const unsubSafety = socketService.onSafetyNumberUpdated(data => {
      setChats(prev =>
        prev.map(c =>
          c.participant?.id === data.peerId || c.id === data.peerId
            ? {
                ...c,
                isVerifiedSafetyNumber: Boolean(data.isVerified),
                safetyNumber: data.safetyNumber || c.safetyNumber,
                verifiedSafetyNumber: data.verifiedSafetyNumber ?? null,
              }
            : c
        )
      );
      setSafetyModalChat(prev =>
        prev && (prev.participant?.id === data.peerId || prev.id === data.peerId)
          ? {
              ...prev,
              isVerifiedSafetyNumber: Boolean(data.isVerified),
              safetyNumber: data.safetyNumber || prev.safetyNumber,
              verifiedSafetyNumber: data.verifiedSafetyNumber ?? null,
            }
          : prev
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
            logger.warn('Call', 'SAS calculation failed:', sasErr);
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
          isDecoyMode: isDecoyModeRef.current,
          isAppLocked: isAppLockedRef.current,
          onAccept: () => handleAcceptIncomingCall(),
          onDecline: () => handleHangupCall(),
        }).catch(() => {});

        // System incoming-call UI (dev builds only; no-op in Expo Go).
        // In-app CallModal stays the fallback/answer surface.
        displayIncomingCall({
          callUUID: newCallUUID(),
          handle: callerProfile.handle || callerProfile.id,
          callerName: callerProfile.name,
          hasVideo: (signal.type || 'audio') === 'video',
        });

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
          logger.warn('Call', 'ICE restart signaling failed:', err);
        }
      } else if (signal.signalType === 'ice-candidate') {
        if (activeCallIdRef.current && signal.callId && signal.callId !== activeCallIdRef.current) {
          return;
        }
        await webrtcCallEngine.handleRemoteIceCandidate(signal.candidate);
      } else if (signal.signalType === 'hangup' || signal.signalType === 'reject') {
        notificationService.cancelCallNotification().catch(() => {});
        reportAllCallsEnded();
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

    // System call-UI answer/decline (dev builds only) → same handlers as
    // the in-app CallModal buttons.
    const unsubCallKeep = addCallKeepListeners({
      onAnswerCall: () => handleAcceptIncomingCall(),
      onEndCall: () => handleHangupCall(),
    });

    // Start background sync / polling for calls and messages when outside app
    if (backgroundSyncEnabled) {
      startBackgroundSync({
        onIncomingCall: signal => {
          handleIncomingCallSignal(signal);
        },
        onUnreadUpdate: data => {
          if (data.unreadThreads && data.unreadThreads.length > 0) {
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
      unsubCallKeep();
      unsubReqReceived();
      unsubReqAccepted();
      unsubMsg();
      unsubStatus();
      unsubTyping();
      unsubDelete();
      unsubUnauthorized();
      unsubNotDelivered();
      unsubConnect();
      unsubDisconnect();
      unsubScreenshot();
      unsubSafety();
      unsubCall();
      unsubPresenceSnapshot();
      unsubPresenceUpdate();
    };
  }, [currentUser?.id, backgroundSyncEnabled]);

  // 5. Ephemeral Message Self-Destruction Loop: purge EVERYWHERE, not just
  // from RAM. Each expired message is (a) tombstoned on the server via
  // api.deleteMessage + realtime delete_for_everyone, (b) removed from the
  // ciphertext cache, (c) dropped from the offline outbox, and (d) dismissed
  // from the notification tray. Fire-and-forget per message so one failure
  // never blocks the rest of the sweep.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const expired = messagesRef.current.filter(
        m => m.expiresAt && m.expiresAt <= now && !m.isDeletedForEveryone
      );
      if (expired.length === 0) return;
      const uid = currentUserRef.current?.id;
      setMessages(prev => prev.filter(m => !(m.expiresAt && m.expiresAt <= now && !m.isDeletedForEveryone)));
      setChats(prev =>
        prev.map(c => {
          const last = c.lastMessage;
          if (last && last.expiresAt && last.expiresAt <= now && !last.isDeletedForEveryone) {
            return { ...c, lastMessage: undefined };
          }
          return c;
        })
      );
      for (const m of expired) {
        const chatId = m.chatId || m.receiverId || m.senderId;
        // Server tombstone (REST best-effort + realtime authoritative).
        api.deleteMessage(m.id, chatId).catch(() => {});
        try {
          const peerId =
            chatsRef.current.find(c => c.id === chatId)?.participant.id ||
            (m.senderId === uid ? m.receiverId : m.senderId);
          if (peerId) socketService.deleteForEveryone(m.id, chatId, peerId);
        } catch {}
        // Local cache + outbox purge + tray dismissal.
        if (uid && chatId) {
          removeCachedMessage(uid, chatId, m.id).catch(() => {});
          tombstoneCachedMessage(uid, chatId, m.id, now).catch(() => {});
          removeOutboxEntry(uid, m.id).catch(() => {});
          outboxRef.current.delete(m.id);
          notificationService.cancelMessageNotification(chatId).catch(() => {});
        }
      }
      setOutboxCount(outboxRef.current.size);
      persistOutbox();
      // Batch-purge any other cached threads that expired off-screen.
      if (uid) {
        const chatIds = chatsRef.current.map(c => c.id);
        if (chatIds.length > 0) {
          purgeExpiredCachedMessages(uid, chatIds, now).catch(() => {});
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Handler: Send Message to Any Chat
  const sendMessageToChat = async (
    targetChatId: string,
    text: string,
    attachment?: Attachment,
    replyToId?: string,
    opts?: { forwarded?: boolean }
  ) => {
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
      logger.warn('Chat', 'Encryption failed:', encErr);
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
      forwarded: opts?.forwarded || undefined,
    };

    if (targetChatId === activeChatId) {
      setMessages(prev => [...prev, newMsg]);
    }

    setChats(prev =>
      prev.map(c =>
        c.id === targetChatId ? { ...c, lastMessage: newMsg, unreadCount: 0 } : c
      )
    );

    // Guaranteed database write to backend (text stripped on wire for zero plaintext exposure).
    // Awaited (not fire-and-forget): on failure the message drops into the
    // offline outbox with a pending clock instead of vanishing silently.
    // Idempotency: the same clientMessageId rides both REST and socket so a
    // double-delivery / retry dedupes instead of duplicating.
    const wireMsg = { ...newMsg, text: '' } as WireMessage;
    const clientMessageId = messageId;
    // Cache our own wire copy (ciphertext) so sent mail stays visible offline.
    if (!isDecoyModeRef.current) {
      mergeCachedMessages(currentUser.id, targetChatId, [wireMsg as unknown as Message]).catch(() => {});
    }
    try {
      const res = await api.sendMessage(wireMsg, { clientMessageId });
      if (!res?.success) throw new Error(res?.error || 'Persist failed');
    } catch (err) {
      logger.warn('Outbox', 'REST persist failed, queued:', (err as Error)?.message || err);
      outboxRef.current.set(messageId, { wire: wireMsg as unknown as Message, display: newMsg });
      setOutboxCount(outboxRef.current.size);
      persistOutbox();
      const markPending = (m: Message) => (m.id === messageId ? { ...m, status: 'sending' as const } : m);
      if (targetChatId === activeChatIdRef.current) {
        setMessages(prev => prev.map(markPending));
      }
      setChats(prev =>
        prev.map(c =>
          c.id === targetChatId && c.lastMessage?.id === messageId
            ? { ...c, lastMessage: { ...c.lastMessage, status: 'sending' as const } }
            : c
        )
      );
    }

    // Real-time forward via Socket.IO (durable message queue while offline)
    try {
      socketService.sendMessage(wireMsg as unknown as Message, { clientMessageId });
    } catch (err) {
      logger.warn('Outbox', 'Socket enqueue notice:', err);
    }
  };

  const markOutboxSent = (messageId: string) => {
    outboxRef.current.delete(messageId);
    setOutboxCount(outboxRef.current.size);
    persistOutbox();
    const markSent = (m: Message) => (m.id === messageId ? { ...m, status: 'sent' as const } : m);
    setMessages(prev => prev.map(markSent));
    setChats(prev =>
      prev.map(c =>
        c.lastMessage?.id === messageId
          ? { ...c, lastMessage: { ...c.lastMessage, status: 'sent' as const } }
          : c
      )
    );
  };

  // Flush the offline outbox (REST persist works over plain HTTP — no socket
  // needed — then re-emit on the socket for realtime delivery). Same
  // clientMessageId on both legs keeps the retry idempotent.
  const flushOutbox = useCallback(async () => {
    if (outboxRef.current.size === 0 || isDecoyModeRef.current) return;
    const pending = Array.from(outboxRef.current.entries());
    for (const [id, entry] of pending) {
      const wireMsg = { ...entry.wire, text: '' } as WireMessage;
      try {
        const res = await api.sendMessage(wireMsg, { clientMessageId: id });
        if (!res?.success) throw new Error(res?.error || 'Persist failed');
        try {
          socketService.sendMessage(wireMsg as unknown as Message, { clientMessageId: id });
        } catch {}
        markOutboxSent(id);
      } catch (err) {
        logger.warn('Outbox', 'Flush retry failed for', id);
        // Keep going with the rest — one poisoned entry (e.g. a removed
        // contact that 403s forever) must not head-of-line-block the queue.
      }
    }
  }, []);

  // Manual single-message retry (tap the clock bubble).
  const retryOutboxMessage = useCallback(
    async (messageId: string) => {
      const entry = outboxRef.current.get(messageId);
      if (!entry) return;
      const wireMsg = { ...entry.wire, text: '' } as WireMessage;
      try {
        const res = await api.sendMessage(wireMsg, { clientMessageId: messageId });
        if (!res?.success) throw new Error(res?.error || 'Persist failed');
        try {
          socketService.sendMessage(wireMsg as unknown as Message, { clientMessageId: messageId });
        } catch {}
        markOutboxSent(messageId);
      } catch (err) {
        Alert.alert('Still Offline', 'Could not send yet. It will retry automatically on reconnect.');
      }
    },
    []
  );

  // Active internet-return watchdog: while anything is queued, retry every
  // 15s regardless of socket state. Socket reconnect covers the common case;
  // this covers the rest (socket stuck, HTTP-only recovery, flaky toggles).
  // No new dependencies — plain REST reachability is the probe.
  const hasQueuedMail = outboxCount > 0;
  useEffect(() => {
    if (!hasQueuedMail || !currentUser || isDecoyMode) return;
    flushOutbox().catch(() => {});
    const t = setInterval(() => {
      flushOutbox().catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [hasQueuedMail, currentUser, isDecoyMode, flushOutbox]);

  // Merge durable outbox displays into a freshly loaded page so queued mail
  // stays visible (history loads would otherwise wipe it).
  const mergeOutboxDisplays = useCallback((chatId: string, list: Message[]): Message[] => {
    const mine = Array.from(outboxRef.current.values())
      .map(e => e.display)
      .filter(m => (m.chatId === chatId || m.receiverId === chatId) && !list.some(x => x.id === m.id));
    if (mine.length === 0) return list;
    return [...list, ...mine].sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : 1));
  }, []);

  // Restore durable outbox after login/launch: repopulate the queue, revive
  // the visible previews, then flush what the network allows.
  const restoreOutbox = useCallback(
    async (userId: string) => {
      const entries = await loadOutbox(userId);
      if (entries.length === 0) return;
      for (const e of entries) outboxRef.current.set(e.wire.id, e);
      setOutboxCount(outboxRef.current.size);
      setMessages(prev => {
        const mine = entries.map(e => e.display).filter(m => !prev.some(x => x.id === m.id));
        return mine.length
          ? [...prev, ...mine].sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : 1))
          : prev;
      });
      setChats(prev =>
        prev.map(c => {
          const mine = entries.map(e => e.display).filter(m => m.chatId === c.id);
          if (mine.length === 0) return c;
          const latest = mine[mine.length - 1];
          if (c.lastMessage && c.lastMessage.timestamp >= latest.timestamp) return c;
          return { ...c, lastMessage: latest };
        })
      );
      flushOutbox().catch(() => {});
    },
    [flushOutbox]
  );

  // Forward picker state + engine. Forwarding RE-ENCRYPTS content for each
  // recipient (text directly; media via fetch → decrypt with the original
  // thread's key → re-encrypt) — ciphertext is never copied across chats,
  // since it's keyed to the wrong recipient. Cap 5 targets per forward.
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [isForwarding, setIsForwarding] = useState(false);

  const handleForwardMessage = useCallback(
    async (targetChatIds: string[]) => {
      const msg = forwardingMessage;
      if (!msg || !currentUser || !mySecretKey || targetChatIds.length === 0) return;
      if (msg.attachment?.type === 'call') {
        Alert.alert('Cannot Forward', 'Call history entries cannot be forwarded.');
        return;
      }
      if (!msg.text && !msg.attachment) return;
      setIsForwarding(true);
      let ok = 0;
      let failed = 0;
      try {
        for (const targetId of targetChatIds.slice(0, 5)) {
          try {
            const targetChat = chatsRef.current.find(c => c.id === targetId);
            if (!targetChat) {
              failed++;
              continue;
            }
            const kind = msg.attachment?.type;
            if ((kind === 'image' || kind === 'audio') && msg.attachment?.id) {
              const mediaRes = await api.getMedia(msg.attachment.id);
              if (!mediaRes.success || !mediaRes.attachment) throw new Error('Media fetch failed');
              const peerId = msg.senderId === currentUser.id ? msg.receiverId : msg.senderId;
              const peerKey = chatsRef.current.find(
                c => c.participant.id === peerId || c.id === peerId
              )?.participant.publicKey;
              const { text: base64, keyMismatch } = decryptWithKeys(
                mySecretKeyRef.current,
                currentUserRef.current,
                mediaRes.attachment.encryptedPayload,
                peerKey
              );
              if (!base64 || keyMismatch) throw new Error('Original media unavailable');
              const isAudio = kind === 'audio';
              const encryptedPayload = encryptMessage(
                base64,
                mySecretKey,
                targetChat.participant.publicKey,
                currentUser.publicKey
              );
              const up = await api.uploadMedia({
                name: msg.attachment.name || (isAudio ? 'Voice Note' : 'photo.jpg'),
                type: isAudio ? 'audio' : 'image',
                size: Math.floor(base64.length * 0.75),
                mimeType: msg.attachment.mimeType || (isAudio ? 'audio/m4a' : 'image/jpeg'),
                ...(isAudio
                  ? { duration: msg.attachment.duration, waveform: msg.attachment.waveform }
                  : {}),
                receiverId: targetChat.participant.id,
                encryptedPayload,
              });
              if (!up.success || !up.attachment) throw new Error(up.error || 'Upload failed');
              await sendMessageToChat(
                targetId,
                isAudio ? '🎤 Encrypted Voice Message' : '📷 Encrypted Image',
                up.attachment,
                undefined,
                { forwarded: true }
              );
            } else if (!msg.attachment && msg.text) {
              await sendMessageToChat(targetId, msg.text, undefined, undefined, { forwarded: true });
            } else {
              // Document/video/call attachments can't be faithfully re-encrypted here.
              throw new Error('Unsupported attachment kind for forward');
            }
            ok++;
          } catch (e) {
            logger.warn('Forward', 'failed for', targetId, e);
            failed++;
          }
        }
      } finally {
        setIsForwarding(false);
        setForwardingMessage(null);
        if (failed > 0) {
          Alert.alert('Forward Partial', `${ok} sent, ${failed} failed.`);
        }
      }
    },
    [forwardingMessage, currentUser, mySecretKey]
  );

  const handleSendMessage = async (text: string, attachment?: Attachment, replyToId?: string) => {
    if (activeChatId) {
      await sendMessageToChat(activeChatId, text, attachment, replyToId);
    }
  };

  // Handler: Delete for Me — drop from RAM + local cache on this device only.
  const handleDeleteForMe = (messageId: string) => {
    if (!activeChatId || !currentUser) return;
    Alert.alert(
      'Delete for Me?',
      'This message will be removed from your device only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for Me',
          style: 'destructive',
          onPress: () => {
            setMessages(prev => prev.filter(m => m.id !== messageId));
            removeCachedMessage(currentUser.id, activeChatId, messageId).catch(() => {});
            removeOutboxEntry(currentUser.id, messageId).catch(() => {});
            outboxRef.current.delete(messageId);
            setOutboxCount(outboxRef.current.size);
            setChats(prev =>
              prev.map(c => {
                if (c.id === activeChatId && c.lastMessage?.id === messageId) {
                  const remaining = messages.filter(m => m.id !== messageId);
                  const newLast = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
                  return { ...c, lastMessage: newLast };
                }
                return c;
              })
            );
          },
        },
      ]
    );
  };

  // Handler: Delete for Everyone — purge server + cache + outbox + tray.
  const handleDeleteForEveryone = (messageId: string) => {
    if (!activeChatId || !currentUser) return;
    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat) return;

    Alert.alert(
      'Delete message?',
      'This message will be deleted for everyone on both sides.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for Everyone',
          style: 'destructive',
          onPress: () => {
            const peerId = activeChat.participant.id;
            try {
              socketService.deleteForEveryone(messageId, activeChatId, peerId);
            } catch {}
            api.deleteMessage(messageId, activeChatId).catch(() => {});

            const now = Date.now();
            setMessages(prev =>
              prev.map(m =>
                m.id === messageId
                  ? { ...m, isDeletedForEveryone: true, text: '', deletedAt: now }
                  : m
              )
            );
            setChats(prev =>
              prev.map(c => {
                if (c.lastMessage?.id === messageId) {
                  return {
                    ...c,
                    lastMessage: {
                      ...c.lastMessage,
                      isDeletedForEveryone: true,
                      text: 'This message was deleted',
                      deletedAt: now,
                    },
                  };
                }
                return c;
              })
            );
            tombstoneCachedMessage(currentUser.id, activeChatId, messageId, now).catch(() => {});
            removeOutboxEntry(currentUser.id, messageId).catch(() => {});
            outboxRef.current.delete(messageId);
            setOutboxCount(outboxRef.current.size);
            persistOutbox();
            notificationService.cancelMessageNotification(activeChatId).catch(() => {});
          },
        },
      ]
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
    } catch (err) {
      logger.error('Contacts', 'Error declining request:', err);
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
      } else {
        Alert.alert('No Invites Left', res.error || 'You have used all your invites.');
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
    await clearSession();
    socketService.disconnect({ clearListeners: true });
    try {
      socketService.setQueueUserId(null);
    } catch {}
    setCurrentUser(null);
    setMySecretKey(null);
    resetToAuth();
    setChats([]);
    setMessages([]);
    outboxRef.current.clear();
    setOutboxCount(0);
    if (currentUser?.id) {
      clearOutbox(currentUser.id).catch(() => {});
      clearUserCache(currentUser.id, chatsRef.current.map(c => c.id)).catch(() => {});
    }
  };

  const displayedUser = isDecoyMode ? DECOY_USER : currentUser;
  const displayedChats = isDecoyMode ? decoyChats : chats;
  const displayedMessages = isDecoyMode
    ? (activeChatId ? decoyMessages[activeChatId] || [] : [])
    : messages;
  const activeChat = displayedChats.find(c => c.id === activeChatId);

  // Send Attachment from Heads-Up Banner
  const handleSendAttachmentFromBanner = async (
    targetChatId: string,
    asset: { uri: string; name: string; type: 'image' | 'audio'; size: number; mimeType?: string }
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
      logger.warn('App', 'Failed to send attachment from banner:', err);
    }
  };

  // Notification Intent Listener (Answer/Decline calls, open chats on notification tap)
  useEffect(() => {
    const handleNotificationAction = (data: {
      chatId?: string;
      callAction?: string;
      callId?: string;
      peerId?: string;
    }) => {
      if (!data) return;
      if (data.callAction === 'accept') {
        handleAcceptIncomingCall();
        return;
      }
      if (data.callAction === 'decline') {
        handleHangupCall();
        return;
      }
      if (data.chatId) {
        const found = chatsRef.current.find(c => c.id === data.chatId || c.participant?.id === data.chatId);
        if (found) {
          setActiveChatId(found.id);
          setCurrentScreen('chat_detail');
        }
      }
    };

    // Check if app was opened via notification tap or full-screen call intent
    notificationService.getInitialNotification().then(initial => {
      if (initial) {
        handleNotificationAction(initial);
      }
    }).catch(() => {});

    // Listen for notification action / tap events while app is running
    const intentSub = DeviceEventEmitter.addListener('onNotificationIntent', handleNotificationAction);

    // Also handle Expo Push Notification interaction
    const unsubPush = addPushResponseListener(targetChatId => {
      if (targetChatId) {
        const found = chatsRef.current.find(c => c.id === targetChatId || c.participant?.id === targetChatId);
        if (found) {
          setActiveChatId(found.id);
          setCurrentScreen('chat_detail');
        }
      }
    });

    return () => {
      intentSub.remove();
      unsubPush();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

        {currentScreen === 'auth' || !displayedUser ? (
          <AuthScreen onAuthenticated={handleAuthenticated} />
        ) : (
          <View style={styles.appContainer}>
            {/* Top Header */}
            {currentScreen !== 'chat_detail' && (
              <Header
                currentUser={displayedUser}
                onAvatarPress={() => {
                  setShowCallsModal(false);
                  setShowRequestsModal(false);
                  setCurrentScreen(currentScreen === 'settings' ? 'chat_list' : 'settings');
                }}
                onInvitesPress={() => setShowInvitesModal(true)}
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
                isOffline={!isDecoyMode && !!currentUser && !isSocketConnected}
                onRefresh={handleRefresh}
                onSelectChat={chatId => {
                  setActiveChatId(chatId);
                  setCurrentScreen('chat_detail');
                  // Read receipts are single-source (socket live, REST fallback)
                  // and suppressed while locked / in decoy mode.
                  if (!isDecoyModeRef.current && !isAppLockedRef.current && currentUser) {
                    const targetChat = chats.find(c => c.id === chatId);
                    const peerId = targetChat ? targetChat.participant.id : chatId;
                    sendReadReceiptSingleSource(peerId, chatId, `open_${chatId}_${Date.now()}`);
                    setChats(prev => prev.map(c => (c.id === chatId ? { ...c, unreadCount: 0 } : c)));
                    setMessages(prev =>
                      prev.map(m => (m.chatId === chatId && m.senderId !== currentUser.id ? { ...m, status: 'read' } : m))
                    );
                  } else if (currentUser) {
                    setChats(prev => prev.map(c => (c.id === chatId ? { ...c, unreadCount: 0 } : c)));
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
                messagesLoading={!isDecoyMode && isMessagesLoading}
                isOffline={!isDecoyMode && !!currentUser && !isSocketConnected}
                pendingCount={outboxCount}
                onRetrySend={retryOutboxMessage}
                onLoadOlder={loadOlderMessages}
                hasMoreMessages={hasMoreMessages}
                loadingMore={isLoadingMore}
                onForwardMessage={setForwardingMessage}
                isOnline={onlineUserIds.has(activeChat.participant.id)}
                lastActiveAt={lastSeenMap[activeChat.participant.id] ?? activeChat.participant.lastActiveAt}
                onBack={() => {
                  setActiveChatId(null);
                  setCurrentScreen('chat_list');
                }}
                onSendMessage={handleSendMessage}
                onDeleteForMe={handleDeleteForMe}
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
              />
            )}

            {/* Bottom navigation bar (4 tabs: Chat, Request, Calls, Settings) */}
            {currentScreen !== 'chat_detail' && (
              <BottomNavBar
                activeTab={
                  showCallsModal
                    ? 'calls'
                    : showRequestsModal
                      ? 'requests'
                      : currentScreen === 'settings'
                        ? 'settings'
                        : 'chats'
                }
                unreadCount={displayedChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0)}
                requestsCount={isDecoyMode ? 0 : incomingRequests.length}
                onTabPress={tab => {
                  if (isDecoyMode) return;
                  switch (tab) {
                    case 'chats':
                      setShowCallsModal(false);
                      setShowRequestsModal(false);
                      setActiveChatId(null);
                      setCurrentScreen('chat_list');
                      break;
                    case 'requests':
                      setShowCallsModal(false);
                      setShowRequestsModal(true);
                      break;
                    case 'calls':
                      setShowRequestsModal(false);
                      setShowCallsModal(true);
                      break;
                    case 'settings':
                      setShowCallsModal(false);
                      setShowRequestsModal(false);
                      setCurrentScreen('settings');
                      break;
                  }
                }}
              />
            )}
          </View>
        )}

        {/* Encrypted Calls Hub Modal */}
        <CallsModal
          visible={!isDecoyMode && showCallsModal}
          chats={displayedChats}
          onlineUserIds={onlineUserIds}
          messages={messages}
          onCallContact={(targetChat, type) => {
            setShowCallsModal(false);
            setActiveChatId(targetChat.id);
            setCurrentScreen('chat_detail');
            setTimeout(() => {
              handleStartCall(type);
            }, 250);
          }}
          onClose={() => setShowCallsModal(false)}
        />

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

        {/* Forward Message Picker */}
        <ForwardPickerModal
          visible={!isDecoyMode && !!forwardingMessage}
          threads={displayedChats.map(c => ({
            id: c.id,
            name: c.participant.name,
            handle: c.participant.handle,
            avatar: c.participant.avatar,
          }))}
          excludeChatId={activeChatId}
          sending={isForwarding}
          onClose={() => {
            if (!isForwarding) setForwardingMessage(null);
          }}
          onForward={handleForwardMessage}
        />

        {/* Safety Number Verification Modal */}
        <SafetyNumberModal
          visible={!isDecoyMode && !!safetyModalChat}
          chat={safetyModalChat}
          currentUser={currentUser}
          participant={safetyModalChat?.participant || null}
          safetyNumber={safetyModalChat?.safetyNumber}
          isVerified={safetyModalChat?.isVerifiedSafetyNumber ?? false}
          verifiedSafetyNumber={safetyModalChat?.verifiedSafetyNumber ?? null}
          onToggleVerify={async (safetyNumber, nextVerified) => {
            if (!safetyModalChat || !currentUser || !safetyNumber) return false;
            const peerId = safetyModalChat.participant.id;
            try {
              const res = await api.verifySafetyNumber(peerId, safetyNumber, nextVerified);
              if (!res?.success) {
                throw new Error(res?.error || 'Verification rejected');
              }
              const patch = {
                isVerifiedSafetyNumber: Boolean(res.isVerified),
                safetyNumber: res.safetyNumber || safetyNumber,
                verifiedSafetyNumber: res.verifiedSafetyNumber ?? null,
              };
              setChats(prev => prev.map(c => (c.id === safetyModalChat.id ? { ...c, ...patch } : c)));
              setSafetyModalChat(prev => (prev ? { ...prev, ...patch } : null));
              return true;
            } catch (err: any) {
              logger.warn('SafetyNumber', 'Verify failed:', err);
              Alert.alert(
                'Verification Failed',
                err?.message || 'Could not update verification. The safety number may have changed — re-check in person.'
              );
              // Resync from server so a stale local state can't linger.
              if (currentUser) reloadDynamicData(currentUser.id).catch(() => {});
              return false;
            }
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
            // PIN-as-passphrase separation: backups require a SEPARATE strong
            // password (>=12), never the short login PIN. Reject weak input
            // here (encryptBackup would throw) with a migration-grade message.
            if (!passphrase || passphrase.trim().length < BACKUP_MIN_PASSPHRASE_LENGTH) {
              Alert.alert(
                'Weak Backup Password',
                `Backup passwords must be at least ${BACKUP_MIN_PASSPHRASE_LENGTH} characters and DIFFERENT from your login PIN. Short PINs no longer encrypt backups.`
              );
              return false;
            }
            try {
              const primaryPin = await getPrimaryPin().catch(() => null);
              if (primaryPin && passphrase === primaryPin) {
                Alert.alert(
                  'Use a Different Password',
                  'Your backup password must be different from your login PIN so a stolen PIN alone cannot unlock your key vault.'
                );
                return false;
              }
            } catch {}
            const payload: BackupPayload = {
              version: 2,
              exportedAt: Date.now(),
              identityKeyPair: { publicKey: currentUser.publicKey, secretKey: mySecretKey },
              historicalKeyPairs: historicalKeys,
            };
            let blob;
            try {
              blob = encryptBackup(payload, passphrase);
            } catch (err: any) {
              Alert.alert('Backup Failed', err?.message || 'Could not encrypt backup with that password.');
              return false;
            }
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

        {/* Heads-Up In-App Notification Banner (Interactive In-Header Quick Chat, Attachments & Calls) */}
        <InAppNotificationBanner
          onQuickReply={(chatId, text) => sendMessageToChat(chatId, text)}
          onSendAttachment={handleSendAttachmentFromBanner}
          onStartCall={(type, chatId) => {
            setActiveChatId(chatId);
            handleStartCall(type);
          }}
          onOpenChat={chatId => {
            setActiveChatId(chatId);
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
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
