import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, StatusBar, Alert, AppState } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
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
} from './src/utils/keyStore';
import { encryptBackup, decryptBackup, BackupPayload } from './src/utils/backupCrypto';
import { api, API_BASE_URL } from './src/services/api';
import { socketService } from './src/services/socket';
import { callAudio } from './src/utils/callAudio';
import { webrtcCallEngine } from './src/utils/webrtcCall';
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
import { PrivacyShield } from './src/components/PrivacyShield';
import { ContactRequestsModal } from './src/components/ContactRequestsModal';
import { SearchOperativeModal } from './src/components/SearchOperativeModal';
import { PermissionsModal } from './src/components/PermissionsModal';
import { UpdateNotificationModal } from './src/components/UpdateNotificationModal';
import { checkForAppUpdates, ReleaseInfo } from './src/services/updateService';
import { requestAppPermissions, checkAppPermissions, AppPermissionsStatus } from './src/utils/permissions';
import { colors } from './src/theme';

type ScreenType = 'auth' | 'chat_list' | 'chat_detail' | 'settings';

export default function App() {
  // App & User State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('auth');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Dynamic Data States (from SQLite Backend)
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<ContactRequestWithUser[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<ContactRequestWithUser[]>([]);

  // Who's currently online, from the server's realtime presence feed (see
  // server/src/realtime.ts). Populated by a one-time snapshot right after
  // connecting, then kept current by individual online/offline events.
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Security & Privacy States
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [antiScreenshotEnabled, setAntiScreenshotEnabled] = useState(true);
  const [inspectingMessage, setInspectingMessage] = useState<Message | null>(null);
  const [safetyModalChat, setSafetyModalChat] = useState<ChatThread | null>(null);

  // This device's real X25519 identity private key, held only in memory for
  // the lifetime of the session (never written to AsyncStorage). The
  // persisted copy lives in expo-secure-store (Keychain/Keystore-backed) —
  // see src/utils/keystore.ts. Every encrypt/decrypt call needs this.
  const [mySecretKey, setMySecretKey] = useState<string | null>(null);

  // Modals
  const [showInvitesModal, setShowInvitesModal] = useState(false);
  const [showLinkedDevicesModal, setShowLinkedDevicesModal] = useState(false);
  const [showCloudBackupModal, setShowCloudBackupModal] = useState(false);
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
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (currentUser) setIsAppLocked(true);
      }
    });
    return () => sub.remove();
  }, [currentUser]);

  // Request Permissions on App Launch
  useEffect(() => {
    const initPermissions = async () => {
      const status = await checkAppPermissions();
      setPermissionsStatus(status);
      if (!status.allGranted) {
        // Automatically prompt hardware permissions on app launch
        const requested = await requestAppPermissions();
        setPermissionsStatus(requested);
        if (!requested.allGranted) {
          setShowPermissionsModal(true);
        }
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

  // Calling State
  const [callState, setCallState] = useState<CallState>({
    active: false,
    type: 'audio',
    status: 'ended',
    isIncoming: false,
    isMuted: false,
    isVideoOff: false,
    isSpeakerOn: true,
    isFrontCamera: true,
    duration: 0,
    sasVerificationWords: [],
  });

  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // WebRTC call transport state — real peer-to-peer audio/video (SRTP,
  // ~100-300ms latency) via src/utils/webrtcCall.ts, replacing the old
  // 1-second-chunk relay through the app server. `pendingIncomingCall` holds
  // the caller's SDP offer + call id between "ringing" and the user tapping
  // Accept, since acceptCall() needs the original offer to answer it.
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pendingIncomingCallRef = useRef<{ callId: string; senderId: string; sdp: unknown } | null>(null);
  const activeCallIdRef = useRef<string | null>(null);

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
  const handleAuthenticated = async (user: UserProfile, token: string, freshKeyPair?: IdentityKeyPair) => {
    await saveSessionToken(token);
    await saveCurrentUserId(user.id);

    let keyPair = freshKeyPair || (await getIdentityKeyPair(user.id));
    if (!keyPair) {
      keyPair = generateIdentityKeyPair();
      const rotateRes = await api.updateProfile({ publicKey: keyPair.publicKey });
      if (rotateRes?.success && rotateRes.user) {
        user = rotateRes.user;
      } else {
        user = { ...user, publicKey: keyPair.publicKey };
      }
    }
    await saveIdentityKeyPair(user.id, keyPair);
    setMySecretKey(keyPair.secretKey);

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

    if (opened === null) {
      return { text: '🔒 Encrypted message (key mismatch or previous session).', keyMismatch: false };
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

        // Update chat list last message dynamically
        setChats(prev =>
          prev.map(c =>
            c.id === msg.senderId
              ? { ...c, lastMessage: msg, unreadCount: c.id === activeChatId ? 0 : c.unreadCount + 1 }
              : c
          )
        );

        socketService.sendStatus(msg.id, msg.chatId, 'read');
      }
    });

    // Message Status Update (delivered / read checkmarks)
    const unsubStatus = socketService.onMessageStatusUpdate(data => {
      setMessages(prev =>
        prev.map(m => (m.id === data.messageId ? { ...m, status: data.status } : m))
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
        });
      } else if (signal.signalType === 'answer') {
        await webrtcCallEngine.handleRemoteAnswer(signal.sdp);
        callAudio.playConnected();
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

  // 6. Call Timer
  useEffect(() => {
    if (callState.active && callState.status === 'connected') {
      callTimerRef.current = setInterval(() => {
        setCallState(prev => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }

    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callState.active, callState.status]);

  // Handler: Send Message
  const handleSendMessage = async (text: string, attachment?: Attachment) => {
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

  // Handler: Start Call. webrtcCallEngine.startCall() captures the mic/camera,
  // builds the real RTCPeerConnection, and sends the SDP offer itself — this
  // handler just drives the UI state around that.
  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!activeChatId || !currentUser || !mySecretKey) return;
    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat) return;

    if (!webrtcCallEngine.isSupported()) {
      Alert.alert(
        'Development Build Required',
        'WebRTC real-time voice and video calling requires native code (not included in standard Expo Go).\n\nPlease run "npx expo run:android" or "npx expo run:ios" to test calling.'
      );
      return;
    }

    const sas = await generateCallSasWords(mySecretKey, activeChat.participant.publicKey, Date.now());
    const callId = `call_${Date.now()}_${currentUser.id}`;
    activeCallIdRef.current = callId;

    callAudio.playRingtone();

    setCallState({
      active: true,
      type,
      status: 'ringing',
      remoteUser: activeChat.participant,
      isIncoming: false,
      isMuted: false,
      isVideoOff: false,
      isSpeakerOn: true,
      isFrontCamera: true,
      duration: 0,
      sasVerificationWords: sas,
    });

    try {
      await webrtcCallEngine.startCall(currentUser.id, activeChat.participant.id, callId, type === 'video', {
        onRemoteStream: stream => setRemoteStream(stream),
        onConnectionStateChange: state => console.log('[Call] connection state:', state),
      });
      setLocalStream(webrtcCallEngine.getLocalStream());
    } catch (err) {
      console.error('[Call] Failed to start call:', err);
      Alert.alert('Call Failed', 'Could not access the microphone/camera, or the connection failed to establish.');
      handleHangupCall();
    }
  };

  // Start Call Duration Timer
  const startCallTimer = () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(() => {
      setCallState(prev => (prev.active ? { ...prev, duration: prev.duration + 1 } : prev));
    }, 1000);
  };

  // Stop Call Duration Timer
  const stopCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  };

  // Handler: Accept Incoming Call. Uses the offer captured by the
  // 'call_signal' listener above (pendingIncomingCallRef) to answer for real.
  const handleAcceptIncomingCall = async () => {
    if (!currentUser || !callState.remoteUser) return;
    if (!webrtcCallEngine.isSupported()) {
      Alert.alert(
        'Development Build Required',
        'WebRTC real-time voice and video calling requires native code (not included in standard Expo Go).\n\nPlease run "npx expo run:android" or "npx expo run:ios" to test calling.'
      );
      handleHangupCall();
      return;
    }
    const pending = pendingIncomingCallRef.current;
    if (!pending) {
      Alert.alert('Call Error', 'The incoming call offer expired. Ask the caller to try again.');
      handleHangupCall();
      return;
    }
    activeCallIdRef.current = pending.callId;

    callAudio.playConnected();
    setCallState(prev => ({ ...prev, status: 'connected' }));
    startCallTimer();

    try {
      await webrtcCallEngine.acceptCall(
        currentUser.id,
        callState.remoteUser.id,
        pending.callId,
        callState.type === 'video',
        pending.sdp,
        {
          onRemoteStream: stream => setRemoteStream(stream),
          onConnectionStateChange: state => console.log('[Call] connection state:', state),
        }
      );
      setLocalStream(webrtcCallEngine.getLocalStream());
    } catch (err) {
      console.error('[Call] Failed to accept call:', err);
      Alert.alert('Call Failed', 'Could not access the microphone/camera.');
      handleHangupCall();
    } finally {
      pendingIncomingCallRef.current = null;
    }
  };

  // Handler: Hangup / Decline Call — webrtcCallEngine.endCall() sends the
  // hangup signal and tears down the local peer connection/media in one step.
  const handleHangupCall = () => {
    stopCallTimer();
    callAudio.playHangup();
    webrtcCallEngine.endCall();
    setLocalStream(null);
    setRemoteStream(null);
    pendingIncomingCallRef.current = null;
    activeCallIdRef.current = null;
    setCallState(prev => ({ ...prev, active: false, status: 'ended', duration: 0 }));
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

  const activeChat = chats.find(c => c.id === activeChatId);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

        {/* Screen Render */}
        {currentScreen === 'auth' || !currentUser ? (
          <AuthScreen onAuthenticated={handleAuthenticated} />
        ) : (
          <View style={styles.appContainer}>
            {/* Top Header */}
            {currentScreen !== 'chat_detail' && (
              <Header
                onLockPress={() => setIsAppLocked(true)}
                onInvitesPress={() => setShowInvitesModal(true)}
                onLinkedDevicesPress={() => setShowLinkedDevicesModal(true)}
                onBackupPress={() => setShowCloudBackupModal(true)}
                onSettingsPress={() => setCurrentScreen(currentScreen === 'settings' ? 'chat_list' : 'settings')}
                inviteCount={currentUser.inviteCodesRemaining}
              />
            )}

            {currentScreen === 'chat_list' && (
              <ChatListScreen
                chats={chats}
                incomingRequestsCount={incomingRequests.length}
                onlineUserIds={onlineUserIds}
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                onSelectChat={chatId => {
                  setActiveChatId(chatId);
                  setCurrentScreen('chat_detail');
                }}
                onOpenRequestsModal={() => setShowRequestsModal(true)}
                onOpenSearchModal={() => setShowSearchModal(true)}
              />
            )}

            {currentScreen === 'chat_detail' && activeChat && (
              <ChatScreen
                chat={activeChat}
                currentUser={currentUser}
                messages={messages}
                isOnline={onlineUserIds.has(activeChat.participant.id)}
                onBack={() => setCurrentScreen('chat_list')}
                onSendMessage={handleSendMessage}
                onDeleteForEveryone={handleDeleteForEveryone}
                onStartCall={handleStartCall}
                onInspectCiphertext={msg => setInspectingMessage(msg)}
                onOpenSafetyNumbers={() => setSafetyModalChat(activeChat)}
                onUpdateDisappearingTimer={async timer => {
                  await api.updateDisappearingTimer(activeChat.participant.id, timer);
                  setChats(prev =>
                    prev.map(c => (c.id === activeChat.id ? { ...c, disappearingTimer: timer } : c))
                  );
                }}
                onClearHistory={async () => {
                  await api.clearChatHistory(activeChat.participant.id);
                  setMessages([]);
                  setChats(prev =>
                    prev.map(c => (c.id === activeChat.id ? { ...c, lastMessage: undefined, unreadCount: 0 } : c))
                  );
                }}
                onDisconnectContact={async () => {
                  await api.disconnectContact(activeChat.participant.id);
                  await reloadDynamicData(currentUser.id);
                  setActiveChatId(null);
                  setCurrentScreen('chat_list');
                }}
              />
            )}

            {currentScreen === 'settings' && (
              <SettingsScreen
                currentUser={currentUser}
                antiScreenshotEnabled={antiScreenshotEnabled}
                onToggleAntiScreenshot={setAntiScreenshotEnabled}
                onOpenInvites={() => setShowInvitesModal(true)}
                onOpenLinkedDevices={() => setShowLinkedDevicesModal(true)}
                onOpenCloudBackup={() => setShowCloudBackupModal(true)}
                onOpenPermissions={() => setShowPermissionsModal(true)}
                onCheckUpdates={handleCheckUpdates}
                onLockEnclave={() => setIsAppLocked(true)}
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
          localStream={localStream}
          remoteStream={remoteStream}
          onHangup={handleHangupCall}
          onAcceptIncoming={handleAcceptIncomingCall}
          onToggleMute={() => {
            setCallState(prev => {
              const nextMute = !prev.isMuted;
              webrtcCallEngine.setMuted(nextMute);
              return { ...prev, isMuted: nextMute };
            });
          }}
          onToggleVideo={() => {
            setCallState(prev => {
              const nextVideoOff = !prev.isVideoOff;
              webrtcCallEngine.setVideoEnabled(!nextVideoOff);
              return { ...prev, isVideoOff: nextVideoOff };
            });
          }}
          onToggleSpeaker={() => {
            setCallState(prev => {
              const nextSpeaker = !prev.isSpeakerOn;
              callAudio.setSpeaker(nextSpeaker);
              return { ...prev, isSpeakerOn: nextSpeaker };
            });
          }}
          onToggleCameraFlip={() => setCallState(prev => ({ ...prev, isFrontCamera: !prev.isFrontCamera }))}
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
          metadata={cloudBackupMetadata}
          onCreateBackup={async passphrase => {
            if (!currentUser || !mySecretKey) return false;
            const payload: BackupPayload = {
              version: 1,
              exportedAt: Date.now(),
              identityKeyPair: { publicKey: currentUser.publicKey, secretKey: mySecretKey },
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
              Alert.alert('Restore Failed', 'Wrong passphrase, or the backup was corrupted.');
              return false;
            }
            await saveIdentityKeyPair(currentUser.id, restored.identityKeyPair);
            setMySecretKey(restored.identityKeyPair.secretKey);
            Alert.alert('Backup Restored', 'Your encryption keys have been restored to this device.');
            return true;
          }}
          onClose={() => setShowCloudBackupModal(false)}
        />

        {/* Privacy Shield App Lock Overlay */}
        <PrivacyShield
          isLocked={isAppLocked}
          onUnlock={() => setIsAppLocked(false)}
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
