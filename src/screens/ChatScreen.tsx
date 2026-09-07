import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  BackHandler,
  Animated,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { Avatar } from '../components/Avatar';
import {
  ArrowLeft,
  Phone,
  Video,
  Flame,
  Send,
  Paperclip,
  CheckCircle2,
  ShieldAlert,
  Lock,
  MoreVertical,
  Search,
  ChevronUp,
  ChevronDown,
  X,
} from '../components/Icons';
import { ChatThread, Message, UserProfile, Attachment, DisappearingTimer } from '../types';
import { isSafetyNumberChanged } from '../utils/verification';
import { ChatBubble } from '../components/ChatBubble';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { ChatMenuModal } from '../components/ChatMenuModal';
import { DisappearingTimerModal } from '../components/DisappearingTimerModal';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { colors, shadows } from '../theme';
import { encryptMessage, decryptMessage, IdentityKeyPair } from '../utils/crypto';
import { api } from '../services/api';
import { formatDisappearingTimer } from '../utils/timerUtils';
import { formatLastSeen } from '../utils/dateUtils';
import { perfMark, perfSince, perfLog } from '../utils/perf';
import { beginExternalActivity, endExternalActivity } from '../utils/appLockGuard';

// Matches the server's MAX_ATTACHMENT_BYTES (server/src/routes/media.routes.ts).
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

interface Props {
  chat: ChatThread;
  currentUser: UserProfile;
  mySecretKey: string;
  historicalKeys?: IdentityKeyPair[];
  messages: Message[];
  messagesLoading?: boolean;
  isOnline: boolean;
  lastActiveAt?: number;
  isOffline?: boolean;
  pendingCount?: number;
  onRetrySend?: (messageId: string) => void;
  onLoadOlder?: () => void;
  hasMoreMessages?: boolean;
  loadingMore?: boolean;
  onBack: () => void;
  onSendMessage: (text: string, attachment?: Attachment, replyToId?: string) => void;
  onDeleteForEveryone: (messageId: string) => void;
  onStartCall: (type: 'audio' | 'video') => void;
  onInspectCiphertext: (message: Message) => void;
  onOpenSafetyNumbers: () => void;
  onUpdateDisappearingTimer: (timer: DisappearingTimer) => void;
  onClearHistory?: () => void;
  onDisconnectContact?: () => void;
  onOpenRestoreSession?: () => void;
}

type ImageResolution = { status: 'loading' } | { status: 'ready'; dataUri: string } | { status: 'error' };

const PLAYBACK_SPEEDS = [1.0, 1.5, 2.0];
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

type ThreadItem =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'msg'; id: string; message: Message };

function formatDayLabel(timestamp: number): string {
  const ts = typeof timestamp === 'number' && timestamp > 0 ? timestamp : Date.now();
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
  const datePart = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return d.getFullYear() !== now.getFullYear() ? `${datePart}, ${d.getFullYear()}` : datePart;
}

function MessageListSkeleton() {
  const rows = [false, true, false, true];
  return (
    <View style={styles.skeletonList}>
      {rows.map((me, i) => (
        <View key={i} style={[styles.skeletonRow, me ? styles.skeletonMeRow : styles.skeletonTheirRow]}>
          <View style={[styles.skeletonBubble, me ? styles.skeletonMeBubble : styles.skeletonTheirBubble]}>
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, styles.skeletonShortLine]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** One bouncing dot of the header typing indicator (staggered by delay). */
function TypingDot({ color, delay }: { color: string; delay: number }) {
  const v = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    const t = setTimeout(() => {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: 350, useNativeDriver: true }),
        ])
      );
      loop.start();
    }, delay);
    return () => {
      clearTimeout(t);
      loop?.stop();
    };
  }, [v, delay]);
  return <Animated.View style={[styles.typingDot, { backgroundColor: color, opacity: v }]} />;
}

export function ChatScreen({
  chat,
  currentUser,
  mySecretKey,
  historicalKeys,
  messages,
  messagesLoading = false,
  isOnline,
  lastActiveAt,
  isOffline = false,
  pendingCount = 0,
  onRetrySend,
  onLoadOlder,
  hasMoreMessages = false,
  loadingMore = false,
  onBack,
  onSendMessage,
  onDeleteForEveryone,
  onStartCall,
  onInspectCiphertext,
  onOpenSafetyNumbers,
  onUpdateDisappearingTimer,
  onClearHistory,
  onDisconnectContact,
  onOpenRestoreSession,
}: Props) {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showDisappearingModal, setShowDisappearingModal] = useState(false);
  const [resolvedImages, setResolvedImages] = useState<Record<string, ImageResolution>>({});
  const [viewingImageId, setViewingImageId] = useState<string | null>(null);

  // Decrypted-image cache is base64 data URIs (MBs per image) — cap it with
  // oldest-first eviction so long image threads can't grow state without
  // bound. The open viewer image is always spared; evicted entries simply
  // re-decrypt on demand via the effect below.
  const IMAGE_CACHE_CAP = 25;
  const viewingImageIdRef = useRef<string | null>(null);
  viewingImageIdRef.current = viewingImageId;
  const mergeImageCache = useCallback(
    (prev: Record<string, ImageResolution>, patch: Record<string, ImageResolution>) => {
      const next = { ...prev, ...patch };
      const keys = Object.keys(next);
      if (keys.length <= IMAGE_CACHE_CAP) return next;
      const spare = viewingImageIdRef.current;
      const droppable = keys.filter(k => k !== spare && next[k].status !== 'loading');
      const overflow = keys.length - IMAGE_CACHE_CAP;
      for (let i = 0; i < overflow && i < droppable.length; i++) {
        delete next[droppable[i]];
      }
      return next;
    },
    []
  );
  const [playingAudioMsgId, setPlayingAudioMsgId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [localReactions, setLocalReactions] = useState<Record<string, string>>({});
  const soundRef = useRef<Audio.Sound | null>(null);
  const flatListRef = useRef<FlatList<ThreadItem>>(null);
  const inputRef = useRef<TextInput>(null);
  const searchInputRef = useRef<TextInput>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [newArrivedCount, setNewArrivedCount] = useState(0);
  const prevMsgCountRef = useRef(0);
  // In-conversation search
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  // Brief highlight when jumping to a quoted original message.
  const [jumpHighlightId, setJumpHighlightId] = useState<string | null>(null);
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingAudioRef = useRef(false);
  const imageLoadingRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Defensive defaults — parent may pass undefined during loading transitions.
  const safeMessages: Message[] = useMemo(
    () => (Array.isArray(messages) ? messages.filter((m): m is Message => !!m && typeof m.id === 'string') : []),
    [messages]
  );
  const participant = chat?.participant;
  const replyLookup = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of safeMessages) map.set(m.id, m);
    return map;
  }, [safeMessages]);

  const effectiveLastActiveAt = useMemo(() => {
    if (isOnline) return Date.now();
    if (typeof lastActiveAt === 'number' && lastActiveAt > 0) return lastActiveAt;
    if (participant && typeof participant.lastActiveAt === 'number' && participant.lastActiveAt > 0) {
      return participant.lastActiveAt;
    }
    for (let i = safeMessages.length - 1; i >= 0; i--) {
      const ts = safeMessages[i]?.timestamp;
      if (typeof ts === 'number' && ts > 0) return ts;
    }
    const lastTs = chat?.lastMessage?.timestamp;
    if (typeof lastTs === 'number' && lastTs > 0) return lastTs;
    return Date.now() - 5 * 60 * 1000;
  }, [isOnline, lastActiveAt, participant?.lastActiveAt, safeMessages, chat?.lastMessage?.timestamp]);

  const hasKeyMismatch = useMemo(
    () =>
      safeMessages.some(
        m => m.keyMismatch === true || (typeof m.text === 'string' && m.text.includes('previous session'))
      ),
    [safeMessages]
  );

  // Flat thread model with day separators (date pills).
  const threadItems = useMemo<ThreadItem[]>(() => {
    const items: ThreadItem[] = [];
    let lastDay = '';
    for (const m of safeMessages) {
      const ts = typeof m.timestamp === 'number' && m.timestamp > 0 ? m.timestamp : Date.now();
      const dayKey = new Date(ts).toDateString();
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        items.push({ kind: 'date', id: `date-${dayKey}`, label: formatDayLabel(ts) });
      }
      items.push({ kind: 'msg', id: m.id, message: m });
    }
    return items;
  }, [safeMessages]);

  // In-conversation search matches (message ids, chronological).
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!searchVisible || !q) return [] as string[];
    return safeMessages
      .filter(
        m =>
          !m.isDeletedForEveryone &&
          ((typeof m.text === 'string' && m.text.toLowerCase().includes(q)) ||
            (m.attachment?.name && m.attachment.name.toLowerCase().includes(q)))
      )
      .map(m => m.id);
  }, [searchVisible, searchQuery, safeMessages]);

  const currentMatchId =
    searchMatches.length > 0 ? searchMatches[((searchMatchIdx % searchMatches.length) + searchMatches.length) % searchMatches.length] : null;

  const jumpToMatch = useCallback(
    (idx: number) => {
      if (searchMatches.length === 0) return;
      const clamped = ((idx % searchMatches.length) + searchMatches.length) % searchMatches.length;
      setSearchMatchIdx(clamped);
      const flatIdx = threadItems.findIndex(it => it.id === searchMatches[clamped]);
      if (flatIdx >= 0) {
        try {
          flatListRef.current?.scrollToIndex({ index: flatIdx, viewPosition: 0.5, animated: true });
        } catch {
          // Variable-height rows: best effort, fallback below handles it.
        }
      }
    },
    [searchMatches, threadItems]
  );

  // Auto-jump to the first match shortly after the query changes.
  useEffect(() => {
    if (!searchVisible || !searchQuery.trim() || searchMatches.length === 0) return;
    const t = setTimeout(() => jumpToMatch(0), 180);
    return () => clearTimeout(t);
  }, [searchQuery, searchVisible, searchMatches.length, jumpToMatch]);

  useEffect(() => {
    setSearchMatchIdx(0);
  }, [searchQuery]);

  const openSearch = useCallback(() => {
    setSearchVisible(true);
    setSearchQuery('');
    setSearchMatchIdx(0);
    setTimeout(() => searchInputRef.current?.focus(), 120);
  }, []);

  // Jump to the original message a reply quotes (tap the quote block).
  const jumpToOriginalMessage = useCallback(
    (msgId: string) => {
      const flatIdx = threadItems.findIndex(it => it.id === msgId);
      if (flatIdx < 0) return;
      try {
        flatListRef.current?.scrollToIndex({ index: flatIdx, viewPosition: 0.4, animated: true });
      } catch {
        // Variable-height rows: best effort.
      }
      setJumpHighlightId(msgId);
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
      jumpTimerRef.current = setTimeout(() => setJumpHighlightId(null), 1800);
    },
    [threadItems]
  );

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery('');
    setSearchMatchIdx(0);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    isNearBottomRef.current = true;
    setShowScrollDown(false);
    setNewArrivedCount(0);
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  // First-paint timing: open → first messages visible (dev only).
  const firstPaintLoggedRef = useRef(false);
  useEffect(() => {
    firstPaintLoggedRef.current = false;
  }, [chat?.id]);
  useEffect(() => {
    if (!firstPaintLoggedRef.current && safeMessages.length > 0) {
      firstPaintLoggedRef.current = true;
      perfLog('chat open → messages', perfSince(`chat_open_${chat?.id}`));
    }
  }, [safeMessages.length, chat?.id]);
  // Count newly arrived messages while scrolled up (drives the ↓ pill).
  useEffect(() => {
    if (safeMessages.length > prevMsgCountRef.current) {
      if (!isNearBottomRef.current) {
        setNewArrivedCount(c => c + (safeMessages.length - prevMsgCountRef.current));
        setShowScrollDown(true);
      }
    }
    prevMsgCountRef.current = safeMessages.length;
  }, [safeMessages.length]);

  // Reset per-chat transient state when switching conversations so drafts,
  // replies, reactions and audio never leak into the wrong thread.
  useEffect(() => {
    perfMark(`chat_open_${chat?.id}`);
    setInputText('');
    setReplyingTo(null);
    setIsRecording(false);
    setPlayingAudioMsgId(null);
    setLocalReactions({});
    setResolvedImages({});
    setSearchVisible(false);
    setSearchQuery('');
    setSearchMatchIdx(0);
    setJumpHighlightId(null);
    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    setViewingImageId(null);
    setShowScrollDown(false);
    setNewArrivedCount(0);
    prevMsgCountRef.current = safeMessages.length;
    imageLoadingRef.current.clear();
    if (soundRef.current) {
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    isNearBottomRef.current = true;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id]);

  const stopActiveAudio = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    loadingAudioRef.current = false;
    if (mountedRef.current) setPlayingAudioMsgId(null);
  }, []);

  // Unified back behavior: close topmost layer first, stop audio, then leave.
  const handleBack = useCallback(() => {
    if (viewingImageId) {
      setViewingImageId(null);
      return;
    }
    if (showDisappearingModal) {
      setShowDisappearingModal(false);
      return;
    }
    if (showMenuModal) {
      setShowMenuModal(false);
      return;
    }
    if (searchVisible) {
      closeSearch();
      return;
    }
    if (replyingTo) {
      setReplyingTo(null);
      return;
    }
    if (isRecording) {
      setIsRecording(false);
      return;
    }
    if (playingAudioMsgId || soundRef.current) {
      stopActiveAudio();
      return;
    }
    onBack();
  }, [viewingImageId, showDisappearingModal, showMenuModal, searchVisible, closeSearch, replyingTo, isRecording, playingAudioMsgId, stopActiveAudio, onBack]);

  // Handle hardware / swipe back gesture
  useEffect(() => {
    const onHardwareBack = () => {
      handleBack();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [handleBack]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSendMessage(inputText.trim(), undefined, replyingTo?.id);
    setInputText('');
    setReplyingTo(null);
  };

  const handleSendVoiceNote = (attachment: Attachment) => {
    onSendMessage('🎤 Encrypted Voice Message', attachment, replyingTo?.id);
    setReplyingTo(null);
  };

  const handleAttachImage = async () => {
    if (!participant) return;
    beginExternalActivity();
    let perm: ImagePicker.PermissionResponse | null = null;
    let result: ImagePicker.ImagePickerResult | null = null;
    try {
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo access needed', 'JABY needs photo library access to send encrypted images. Enable it in Settings.');
        return;
      }

      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: false,
      });
    } catch (err) {
      console.warn('[ChatScreen] Error selecting image:', err);
      return;
    } finally {
      endExternalActivity();
    }
    if (!result || result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setIsSendingImage(true);
    try {
      let fileSize: number | undefined;
      try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        fileSize = info.exists ? (info.size ?? undefined) : undefined;
      } catch {
        fileSize = undefined;
      }
      if (typeof fileSize === 'number' && fileSize > MAX_ATTACHMENT_BYTES) {
        Alert.alert('Image too large', `Please choose an image under ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB.`);
        return;
      }

      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Same E2E crypto used for text messages — the image's raw bytes,
      // base64-encoded, are just the "plaintext" being encrypted.
      let encryptedPayload;
      try {
        encryptedPayload = encryptMessage(base64Data, mySecretKey, participant.publicKey, currentUser.publicKey);
      } catch {
        Alert.alert('Encryption failed', 'Could not encrypt this image with the current session keys.');
        return;
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      const uploadResult = await api.uploadMedia({
        name: asset.fileName || 'photo.jpg',
        type: 'image',
        size: fileSize ?? base64Data.length,
        mimeType,
        receiverId: participant.id,
        encryptedPayload,
      });

      if (!uploadResult.success || !uploadResult.attachment) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      const attachmentId = uploadResult.attachment.id;
      if (!attachmentId) {
        throw new Error('Upload returned no attachment id');
      }

      // We already have the plaintext locally — seed the resolved-image
      // cache immediately so the bubble we're about to send renders instantly
      // instead of round-tripping back through the server to decrypt its own upload.
      setResolvedImages(prev =>
        mergeImageCache(prev, {
          [attachmentId]: { status: 'ready', dataUri: `data:${mimeType};base64,${base64Data}` },
        })
      );

      onSendMessage('📷 Encrypted Image', uploadResult.attachment);
    } catch (err) {
      console.warn('[ChatScreen] Image send failed:', err);
      Alert.alert('Could not send image', 'Please check your connection and try again.');
    } finally {
      if (mountedRef.current) setIsSendingImage(false);
    }
  };

  // Lazily decrypt every received image not yet resolved — decryption stays
  // here (not in ChatBubble) because this screen is the one that holds the
  // crypto keys. Runs as an effect (not during FlatList's renderItem) so it
  // never triggers a state update mid-render. Batched into a single state
  // update with an in-flight guard to avoid duplicate fetches.
  useEffect(() => {
    if (!participant) return;
    let isCancelled = false;
    const pending = safeMessages.filter(
      m => m.attachment?.type === 'image' && !resolvedImages[m.attachment.id] && !imageLoadingRef.current.has(m.attachment.id)
    );
    if (pending.length === 0) return;

    const loadingPatch: Record<string, ImageResolution> = {};
    for (const msg of pending) {
      const id = msg.attachment?.id;
      if (id) {
        imageLoadingRef.current.add(id);
        loadingPatch[id] = { status: 'loading' };
      }
    }
    setResolvedImages(prev => mergeImageCache(prev, loadingPatch));

    const theirKeyFor = (msg: Message) =>
      msg.senderId === currentUser.id ? participant.publicKey : undefined;

    (async () => {
      const results = await Promise.all(
        pending.map(async msg => {
          const attachment = msg.attachment;
          if (!attachment) return null;
          try {
            const res = await api.getMedia(attachment.id);
            if (isCancelled) return null;
            if (!res.success || !res.attachment) throw new Error(res.error || 'Not found');
            const key = theirKeyFor(msg) || res.attachment.encryptedPayload.senderPublicKey;
            let plaintext = decryptMessage(res.attachment.encryptedPayload, mySecretKey, key);
            if (!plaintext && historicalKeys && historicalKeys.length > 0) {
              for (const hk of historicalKeys) {
                plaintext = decryptMessage(res.attachment.encryptedPayload, hk.secretKey, key);
                if (plaintext) break;
              }
            }
            if (!plaintext) throw new Error('Decryption failed');
            const mimeType = attachment.mimeType || 'image/jpeg';
            return { id: attachment.id, value: { status: 'ready', dataUri: `data:${mimeType};base64,${plaintext}` } as ImageResolution };
          } catch (err) {
            if (!isCancelled) console.warn('[ChatScreen] Image decrypt failed:', err);
            return { id: attachment.id, value: { status: 'error' } as ImageResolution };
          } finally {
            imageLoadingRef.current.delete(attachment.id);
          }
        })
      );
      if (isCancelled || !mountedRef.current) return;
      const patch: Record<string, ImageResolution> = {};
      for (const r of results) {
        if (r) patch[r.id] = r.value;
      }
      if (Object.keys(patch).length > 0) {
        setResolvedImages(prev => mergeImageCache(prev, patch));
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [safeMessages, mySecretKey, historicalKeys, currentUser.id, participant?.publicKey, participant?.id]);

  // Reset any failed image resolutions when keys change so they retry.
  useEffect(() => {
    setResolvedImages(prev => {
      const next = { ...prev };
      let updated = false;
      for (const k of Object.keys(next)) {
        if (next[k].status === 'error') {
          delete next[k];
          updated = true;
        }
      }
      return updated ? next : prev;
    });
  }, [mySecretKey, historicalKeys]);

  // Clean up sound instance on unmount
  useEffect(() => {
    return () => {
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const handleToggleSpeed = async () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const nextSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(nextSpeed);
    if (soundRef.current) {
      await soundRef.current.setRateAsync(nextSpeed, true).catch(() => {});
    }
  };

  const handlePlayAudio = async (msg: Message) => {
    if (!msg.attachment || msg.attachment.type !== 'audio') return;
    if (loadingAudioRef.current) return;
    if (!participant) return;

    if (playingAudioMsgId === msg.id && soundRef.current) {
      await stopActiveAudio();
      return;
    }

    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }

    loadingAudioRef.current = true;
    if (mountedRef.current) setPlayingAudioMsgId(msg.id);
    const targetMsgId = msg.id;

    try {
      const res = await api.getMedia(msg.attachment.id);
      if (!res.success || !res.attachment) {
        throw new Error(res.error || 'Media not found');
      }

      const isSentByMe = msg.senderId === currentUser.id;
      const theirPublicKey = isSentByMe ? participant.publicKey : undefined;
      const key = theirPublicKey || res.attachment.encryptedPayload.senderPublicKey;
      let base64Audio = decryptMessage(res.attachment.encryptedPayload, mySecretKey, key);
      if (!base64Audio && historicalKeys && historicalKeys.length > 0) {
        for (const hk of historicalKeys) {
          base64Audio = decryptMessage(res.attachment.encryptedPayload, hk.secretKey, key);
          if (base64Audio) break;
        }
      }

      if (!base64Audio) {
        throw new Error('Audio decryption failed');
      }
      if (!mountedRef.current) return;

      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) {
        throw new Error('No cache directory available');
      }
      const tempFileUri = `${cacheDir}voice_${msg.id}.m4a`;
      await FileSystem.writeAsStringAsync(tempFileUri, base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});

      const { sound } = await Audio.Sound.createAsync(
        { uri: tempFileUri },
        { shouldPlay: true, rate: playbackSpeed, shouldCorrectPitch: true },
        status => {
          if (status.isLoaded && status.didJustFinish) {
            // Only clear if this callback belongs to the currently playing msg.
            if (mountedRef.current && playingAudioMsgId !== null) {
              sound.unloadAsync().catch(() => {});
              if (soundRef.current === sound) soundRef.current = null;
              setPlayingAudioMsgId(current => (current === targetMsgId ? null : current));
            }
          }
        }
      );

      soundRef.current = sound;
    } catch (err) {
      console.warn('[ChatScreen] Failed to play voice note:', err);
      if (mountedRef.current) Alert.alert('Playback Failed', 'Could not decrypt or play this voice message.');
      if (mountedRef.current) setPlayingAudioMsgId(null);
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    } finally {
      loadingAudioRef.current = false;
    }
  };

  const handleReact = (msgId: string, emoji: string) => {
    setLocalReactions(prev => {
      const next = { ...prev, [msgId]: emoji };
      // Bound growth so long-lived threads don't accumulate unbounded state.
      const keys = Object.keys(next);
      if (keys.length > 200) {
        delete next[keys[0]];
      }
      return next;
    });
  };

  const openDisappearingModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowDisappearingModal(true);
  };

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !(e.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey) {
      e.preventDefault?.();
      handleSend();
    }
  };

  const scrollToBottomIfNeeded = () => {
    if (isNearBottomRef.current) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  };

  // Memoized row renderer: a stable reference across keystrokes so typing in
  // the input doesn't re-render every visible bubble (the classic chat-input
  // jank). It only refreshes when message data or bubble-relevant UI state
  // actually changes — inputText is deliberately not a dependency.
  const renderThreadItem = useCallback(
    ({ item }: { item: ThreadItem }) => {
      if (item.kind === 'date') {
        return (
          <View style={styles.datePillWrap}>
            <Text style={styles.datePill}>{item.label}</Text>
          </View>
        );
      }
      const msg = item.message;
      const imageAttachment = msg.attachment?.type === 'image' ? msg.attachment : undefined;
      const displayMessage = localReactions[msg.id] ? { ...msg, reaction: localReactions[msg.id] } : msg;
      const replyMsg = msg.replyToId ? replyLookup.get(msg.replyToId) : undefined;
      return (
        <ChatBubble
          message={displayMessage}
          isMe={msg.senderId === currentUser.id}
          onInspectCiphertext={onInspectCiphertext}
          onDeleteForEveryone={onDeleteForEveryone}
          onPlayAudio={handlePlayAudio}
          isPlayingAudio={playingAudioMsgId === msg.id}
          playbackSpeed={playbackSpeed}
          onToggleSpeed={handleToggleSpeed}
          onReact={handleReact}
          replyMessage={replyMsg}
          replySenderName={
            replyMsg ? (replyMsg.senderId === currentUser.id ? 'You' : participant?.name || 'Contact') : undefined
          }
          onJumpToReply={jumpToOriginalMessage}
          onRetrySend={onRetrySend}
          onPressImage={setViewingImageId}
          onReply={setReplyingTo}
          imageResolution={imageAttachment ? resolvedImages[imageAttachment.id] : undefined}
          highlight={msg.id === currentMatchId || msg.id === jumpHighlightId}
          searchQuery={searchVisible ? searchQuery : undefined}
        />
      );
    },
    [
      localReactions,
      currentUser.id,
      onInspectCiphertext,
      onDeleteForEveryone,
      handlePlayAudio,
      playingAudioMsgId,
      playbackSpeed,
      handleToggleSpeed,
      handleReact,
      replyLookup,
      participant?.name,
      jumpToOriginalMessage,
      onRetrySend,
      resolvedImages,
      currentMatchId,
      jumpHighlightId,
      searchVisible,
      searchQuery,
    ]
  );

  // Missing participant guard — never crash the whole screen on stale chat data.
  if (!chat || !participant) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>Conversation unavailable</Text>
        <Text style={styles.emptySubtitle}>This chat could not be loaded.</Text>
        <TouchableOpacity
          style={styles.backFallbackBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back to chats"
          hitSlop={HIT_SLOP}
        >
          <Text style={styles.backFallbackText}>Back to chats</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const timerActive = chat.disappearingTimer > 0;
  // Compact presence line for the narrow header slot — the full
  // "Active yesterday at 2:39 AM" string never fits next to the call
  // actions, so strip the clock part here (full text stays in the list).
  const statusText = useMemo(() => {
    if (chat.isTyping) return 'typing…';
    if (isOnline) return 'Online';
    const full = formatLastSeen(effectiveLastActiveAt);
    if (full === 'Active just now') return 'Active now';
    return full.replace(/ at .*$/, '');
  }, [chat.isTyping, isOnline, effectiveLastActiveAt]);
  const statusColor = chat.isTyping || isOnline ? colors.primaryDark : colors.textMuted;

  return (
    // Top inset comes from the parent SafeAreaView (same as the chat list),
    // so the header sits at exactly the same height as the main interface.
    <View style={styles.container}>
      {/* ── Redesigned Chat Header ─────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the chat list"
          hitSlop={HIT_SLOP}
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.peerHeaderInfo}
          onPress={onOpenSafetyNumbers}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Open safety numbers for ${participant.name}`}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <View style={styles.avatarWrap}>
            <View style={[styles.avatarRing, isOnline && styles.avatarRingOnline]}>
              <Avatar uri={participant.avatar} name={participant.name} size={40} />
            </View>
            <View style={[styles.presenceDot, isOnline ? styles.presenceOnline : styles.presenceOffline]} />
            {chat.isVerifiedSafetyNumber ? (
              <View style={styles.verifiedBadge}>
                <CheckCircle2 size={13} color="#ffffff" />
              </View>
            ) : isSafetyNumberChanged(chat) ? (
              <View style={[styles.verifiedBadge, styles.changedBadge]}>
                <ShieldAlert size={13} color="#ffffff" />
              </View>
            ) : null}
          </View>

          <View style={styles.peerTextContainer}>
            <View style={styles.nameRow}>
              <Text style={styles.peerName} numberOfLines={1} ellipsizeMode="tail">
                {participant.name}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              {chat.isTyping ? (
                <View
                  style={styles.typingRow}
                  accessibilityRole="text"
                  accessibilityLabel={`${participant.name} is typing`}
                >
                  <Text style={[styles.peerStatus, { color: statusColor }]}>typing</Text>
                  <TypingDot color={statusColor} delay={0} />
                  <TypingDot color={statusColor} delay={150} />
                  <TypingDot color={statusColor} delay={300} />
                </View>
              ) : (
                <Text style={[styles.peerStatus, { color: statusColor }]} numberOfLines={1} ellipsizeMode="tail">
                  {statusText}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {/* Action Buttons */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.timerToggle, timerActive && styles.timerToggleActive]}
            onPress={openDisappearingModal}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Disappearing messages timer, currently ${formatDisappearingTimer(chat.disappearingTimer)}`}
            hitSlop={HIT_SLOP}
          >
            <Flame size={14} color={timerActive ? '#d97706' : colors.textMuted} />
            {timerActive && (
              <Text style={[styles.timerToggleText, styles.activeTimerText]} numberOfLines={1}>
                {formatDisappearingTimer(chat.disappearingTimer)}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onStartCall('audio')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Voice call ${participant.name}`}
            hitSlop={HIT_SLOP}
          >
            <Phone size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onStartCall('video')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Video call ${participant.name}`}
            hitSlop={HIT_SLOP}
          >
            <Video size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowMenuModal(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Conversation options"
            hitSlop={HIT_SLOP}
          >
            <MoreVertical size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Ephemeral Timer Banner */}
      {timerActive && (
        <TouchableOpacity
          style={styles.ephemeralBanner}
          onPress={openDisappearingModal}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Ephemeral timer active. Tap to change."
        >
          <Flame size={12} color="#d97706" />
          <Text style={styles.ephemeralBannerText} numberOfLines={1} ellipsizeMode="tail">
            Ephemeral Timer · {formatDisappearingTimer(chat.disappearingTimer)} · Messages self-destruct
          </Text>
        </TouchableOpacity>
      )}

      {/* Session Lock Banner (Previous Session / Key Mismatch) */}
      {hasKeyMismatch && (
        <View style={styles.sessionLockBanner}>
          <View style={styles.sessionLockLeft}>
            <Lock size={15} color="#d97706" />
            <Text style={styles.sessionLockText} numberOfLines={2}>
              Previous session messages locked
            </Text>
          </View>
          {onOpenRestoreSession && (
            <TouchableOpacity
              style={styles.sessionLockBtn}
              onPress={onOpenRestoreSession}
              accessibilityRole="button"
              accessibilityLabel="Restore previous session keys"
              hitSlop={HIT_SLOP}
            >
              <Text style={styles.sessionLockBtnText}>Restore Keys</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* In-conversation search bar */}
      {searchVisible && (
        <View style={styles.searchBar}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search messages..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={text => {
              setSearchQuery(text);
              setSearchMatchIdx(0);
            }}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search messages in this conversation"
          />
          {searchQuery.length > 0 && (
            <Text style={styles.searchCount} numberOfLines={1}>
              {searchMatches.length > 0 ? `${searchMatchIdx + 1}/${searchMatches.length}` : '0'}
            </Text>
          )}
          <TouchableOpacity
            onPress={() => jumpToMatch(searchMatchIdx - 1)}
            disabled={searchMatches.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous match"
            hitSlop={HIT_SLOP}
            style={styles.searchNavBtn}
          >
            <ChevronUp size={18} color={searchMatches.length === 0 ? colors.textMuted : colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => jumpToMatch(searchMatchIdx + 1)}
            disabled={searchMatches.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Next match"
            hitSlop={HIT_SLOP}
            style={styles.searchNavBtn}
          >
            <ChevronDown size={18} color={searchMatches.length === 0 ? colors.textMuted : colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={closeSearch}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            hitSlop={HIT_SLOP}
            style={styles.searchNavBtn}
          >
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Offline Banner (realtime disconnected — outbox holds unsent) */}
      {isOffline && (
        <View style={styles.offlineBanner} accessibilityRole="alert" accessibilityLabel="You are offline. Messages will send automatically on reconnect.">
          <View style={styles.offlineDot} />
          <Text style={styles.offlineText} numberOfLines={2}>
            You're offline
            {pendingCount > 0
              ? ` · ${pendingCount} message${pendingCount === 1 ? '' : 's'} will send on reconnect`
              : ' · new messages will send on reconnect'}
          </Text>
        </View>
      )}

      {/* Key-Changed Banner (verified before, keys rotated since) */}
      {isSafetyNumberChanged(chat) && (
        <TouchableOpacity
          style={styles.keyChangeBanner}
          onPress={onOpenSafetyNumbers}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Safety number changed for ${participant.name}. Tap to review and re-verify.`}
        >
          <ShieldAlert size={15} color="#b45309" />
          <Text style={styles.keyChangeText} numberOfLines={2}>
            Safety number changed — re-verify {participant.name} in person
          </Text>
          <Text style={styles.keyChangeCta}>Review</Text>
        </TouchableOpacity>
      )}

      {/* Messages + input live inside the KAV so the header never resizes */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages Thread */}
        <FlatList
          ref={flatListRef}
          data={threadItems}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={11}
          removeClippedSubviews={Platform.OS === 'android'}
          onScroll={e => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            const near =
              layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
            isNearBottomRef.current = near;
            setShowScrollDown(!near);
            if (near) setNewArrivedCount(0);
          }}
          scrollEventThrottle={200}
          onContentSizeChange={scrollToBottomIfNeeded}
          onScrollToIndexFailed={info => {
            // Variable-height rows: fall back to an estimated offset.
            flatListRef.current?.scrollToOffset({
              offset: Math.max(0, info.averageItemLength * info.index - 200),
              animated: true,
            });
            setTimeout(() => {
              try {
                flatListRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true });
              } catch {}
            }, 250);
          }}
          onStartReached={() => {
            if (hasMoreMessages && !loadingMore && onLoadOlder) onLoadOlder();
          }}
          onStartReachedThreshold={0.4}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          ListHeaderComponent={
            loadingMore ? (
              <View style={styles.historyLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.historyLoaderText}>Loading older messages…</Text>
              </View>
            ) : !hasMoreMessages && safeMessages.length > 0 ? (
              <View style={styles.historyStart}>
                <Text style={styles.historyStartText}>Beginning of conversation</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            messagesLoading && safeMessages.length === 0 ? (
              <MessageListSkeleton />
            ) : (
              <View style={styles.emptyThread}>
                <Lock size={22} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySubtitle}>Messages here are end-to-end encrypted.</Text>
                <Text style={styles.emptyHint}>Tip: swipe any message sideways to reply to it.</Text>
              </View>
            )
          }
          renderItem={renderThreadItem}
        />

        {/* Jump-to-latest pill (appears when scrolled up) */}
        {showScrollDown && (
          <TouchableOpacity
            style={styles.scrollDownBtn}
            onPress={handleScrollToBottom}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={newArrivedCount > 0 ? `${newArrivedCount} new messages. Jump to latest.` : 'Jump to latest messages'}
            hitSlop={HIT_SLOP}
          >
            <ChevronDown size={18} color={colors.textPrimary} />
            {newArrivedCount > 0 && (
              <View style={styles.scrollDownBadge}>
                <Text style={styles.scrollDownBadgeText}>
                  {newArrivedCount > 99 ? '99+' : newArrivedCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Input Bar */}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(10, insets.bottom * 0.6) }]}>
          {/* Reply Quote Preview Bar */}
          {replyingTo && (
            <View style={styles.replyBar}>
              <View style={styles.replyBarBorder} />
              <View style={styles.replyBarContent}>
                <Text style={styles.replyBarHeader} numberOfLines={1}>
                  Replying to {replyingTo.senderId === currentUser.id ? 'yourself' : participant?.name || 'Contact'}
                </Text>
                <Text style={styles.replyBarText} numberOfLines={1}>
                  {replyingTo.attachment?.type === 'image'
                    ? '📷 Photo'
                    : replyingTo.attachment?.type === 'audio'
                    ? '🎤 Voice Message'
                    : replyingTo.text}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReplyingTo(null)}
                style={styles.replyBarClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                hitSlop={HIT_SLOP}
              >
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {isRecording ? (
            <VoiceRecorder
              isRecording={isRecording}
              onStartRecord={() => setIsRecording(true)}
              onStopRecord={() => setIsRecording(false)}
              onCancelRecord={() => setIsRecording(false)}
              onSendVoiceNote={handleSendVoiceNote}
              mySecretKey={mySecretKey}
              myPublicKey={currentUser.publicKey}
              receiverPublicKey={participant.publicKey}
              receiverId={participant.id}
            />
          ) : (
            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.attachButton}
                onPress={handleAttachImage}
                disabled={isSendingImage}
                accessibilityRole="button"
                accessibilityLabel="Attach image"
                hitSlop={HIT_SLOP}
              >
                {isSendingImage ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Paperclip size={18} color={colors.textSecondary} />
                )}
              </TouchableOpacity>

              <TextInput
                ref={inputRef}
                style={styles.textInput}
                placeholder="Encrypted message..."
                placeholderTextColor={colors.textMuted}
                value={inputText}
                onChangeText={setInputText}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
                enablesReturnKeyAutomatically={true}
                multiline={true}
                maxLength={4000}
                textAlignVertical="center"
                accessibilityLabel="Message input"
                accessibilityHint="Type an encrypted message"
                onKeyPress={handleKeyPress}
              />

              {inputText.trim().length > 0 ? (
                <TouchableOpacity
                  style={styles.sendButton}
                  onPress={handleSend}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  hitSlop={HIT_SLOP}
                >
                  <Send size={18} color="#ffffff" />
                </TouchableOpacity>
              ) : (
                <VoiceRecorder
                  isRecording={false}
                  onStartRecord={() => setIsRecording(true)}
                  onStopRecord={() => setIsRecording(false)}
                  onCancelRecord={() => setIsRecording(false)}
                  onSendVoiceNote={handleSendVoiceNote}
                  mySecretKey={mySecretKey}
                  myPublicKey={currentUser.publicKey}
                  receiverPublicKey={participant.publicKey}
                  receiverId={participant.id}
                />
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* In-Thread Conversation Controls Modal */}
      {onClearHistory && onDisconnectContact ? (
      <ChatMenuModal
        visible={showMenuModal}
        chat={chat}
        onOpenSafetyNumbers={onOpenSafetyNumbers}
        onUpdateDisappearingTimer={onUpdateDisappearingTimer}
        onClearHistory={onClearHistory}
        onDisconnectContact={onDisconnectContact}
        onSearchMessages={openSearch}
        onClose={() => setShowMenuModal(false)}
      />
      ) : null}

      {/* Disappearing Timer Selector Modal */}
      <DisappearingTimerModal
        visible={showDisappearingModal}
        currentTimer={chat.disappearingTimer}
        contactName={participant.name}
        onSelectTimer={onUpdateDisappearingTimer}
        onClose={() => setShowDisappearingModal(false)}
      />

      {/* Full-screen Encrypted Image Viewer */}
      {(() => {
        const viewingMsg = viewingImageId
          ? safeMessages.find(m => m.attachment?.id === viewingImageId)
          : undefined;
        const viewingRes = viewingImageId ? resolvedImages[viewingImageId] : undefined;
        return (
          <ImageViewerModal
            visible={!!viewingImageId}
            status={viewingRes?.status}
            dataUri={viewingRes?.status === 'ready' ? viewingRes.dataUri : undefined}
            senderName={
              viewingMsg
                ? viewingMsg.senderId === currentUser.id
                  ? 'You'
                  : participant.name
                : participant.name
            }
            timestamp={viewingMsg?.timestamp}
            onClose={() => setViewingImageId(null)}
          />
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  kav: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  // ── Header (redesigned) ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
    zIndex: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 6,
    flexShrink: 0,
  },
  peerHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 8,
    flexShrink: 0,
  },
  avatarRing: {
    borderRadius: 23,
    padding: 1.5,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatarRingOnline: {
    borderColor: colors.primary,
  },
  presenceDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  presenceOnline: {
    backgroundColor: colors.primary,
  },
  presenceOffline: {
    backgroundColor: '#94a3b8',
  },
  verifiedBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  changedBadge: {
    backgroundColor: '#d97706',
  },
  peerTextContainer: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  peerName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
    flexShrink: 1,
    minWidth: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 5,
    minWidth: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  typingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginLeft: 2,
  },
  peerStatus: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    marginLeft: 4,
  },
  timerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f1f5f9',
    height: 34,
    minWidth: 34,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexShrink: 0,
  },
  timerToggleActive: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
  },
  timerToggleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    fontVariant: ['tabular-nums'],
  },
  activeTimerText: {
    color: '#b45309',
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  ephemeralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.warningLight,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  ephemeralBannerText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  messagesList: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexGrow: 1,
  },
  datePillWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  datePill: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    height: 36,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 18,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderFocus,
  },
  searchCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    minWidth: 30,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  searchNavBtn: {
    padding: 4,
  },
  scrollDownBtn: {
    position: 'absolute',
    right: 16,
    bottom: 78,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  scrollDownBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  scrollDownBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  historyLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  historyLoaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  historyStart: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  historyStartText: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  skeletonList: {
    paddingVertical: 8,
    gap: 10,
  },
  skeletonRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  skeletonMeRow: {
    justifyContent: 'flex-end',
  },
  skeletonTheirRow: {
    justifyContent: 'flex-start',
  },
  skeletonBubble: {
    width: '62%',
    borderRadius: 16,
    padding: 12,
    gap: 8,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skeletonMeBubble: {
    opacity: 0.75,
  },
  skeletonTheirBubble: {},
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceHighlight,
  },
  skeletonShortLine: {
    width: '55%',
  },
  emptyThread: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  backFallbackBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backFallbackText: {
    color: '#fff',
    fontWeight: '700',
  },
  inputContainer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 10,
    paddingTop: 10,
    ...shadows.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  attachButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    paddingTop: 9,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 110,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  replyBarBorder: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginRight: 8,
  },
  replyBarContent: {
    flex: 1,
    minWidth: 0,
  },
  replyBarHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
    marginBottom: 2,
  },
  replyBarText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  replyBarClose: {
    padding: 8,
  },
  sessionLockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 10,
  },
  sessionLockLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  sessionLockText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
    flexShrink: 1,
  },
  sessionLockBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  sessionLockBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d97706',
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
    flexShrink: 1,
  },
  keyChangeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#f59e0b',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  keyChangeText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  keyChangeCta: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b45309',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
