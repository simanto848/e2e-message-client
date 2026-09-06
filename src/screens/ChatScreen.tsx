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
  Lock,
  MoreVertical,
  X,
} from '../components/Icons';
import { ChatThread, Message, UserProfile, Attachment, DisappearingTimer } from '../types';
import { ChatBubble } from '../components/ChatBubble';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { ChatMenuModal } from '../components/ChatMenuModal';
import { DisappearingTimerModal } from '../components/DisappearingTimerModal';
import { colors, shadows } from '../theme';
import { encryptMessage, decryptMessage, IdentityKeyPair } from '../utils/crypto';
import { api } from '../services/api';
import { formatDisappearingTimer } from '../utils/timerUtils';
import { formatLastSeen } from '../utils/dateUtils';
import { beginExternalActivity, endExternalActivity } from '../utils/appLockGuard';

// Matches the server's MAX_ATTACHMENT_BYTES (server/src/routes/media.routes.ts).
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

interface Props {
  chat: ChatThread;
  currentUser: UserProfile;
  mySecretKey: string;
  historicalKeys?: IdentityKeyPair[];
  messages: Message[];
  isOnline: boolean;
  lastActiveAt?: number;
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

export function ChatScreen({
  chat,
  currentUser,
  mySecretKey,
  historicalKeys,
  messages,
  isOnline,
  lastActiveAt,
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
  const [playingAudioMsgId, setPlayingAudioMsgId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [localReactions, setLocalReactions] = useState<Record<string, string>>({});
  const soundRef = useRef<Audio.Sound | null>(null);
  const flatListRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
  const isNearBottomRef = useRef(true);
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

  // Reset per-chat transient state when switching conversations so drafts,
  // replies, reactions and audio never leak into the wrong thread.
  useEffect(() => {
    setInputText('');
    setReplyingTo(null);
    setIsRecording(false);
    setPlayingAudioMsgId(null);
    setLocalReactions({});
    setResolvedImages({});
    imageLoadingRef.current.clear();
    if (soundRef.current) {
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    isNearBottomRef.current = true;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    });
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
    if (showDisappearingModal) {
      setShowDisappearingModal(false);
      return;
    }
    if (showMenuModal) {
      setShowMenuModal(false);
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
  }, [showDisappearingModal, showMenuModal, replyingTo, isRecording, playingAudioMsgId, stopActiveAudio, onBack]);

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
      setResolvedImages(prev => ({
        ...prev,
        [attachmentId]: { status: 'ready', dataUri: `data:${mimeType};base64,${base64Data}` },
      }));

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
    setResolvedImages(prev => ({ ...prev, ...loadingPatch }));

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
        setResolvedImages(prev => ({ ...prev, ...patch }));
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
            {chat.isVerifiedSafetyNumber && (
              <View style={styles.verifiedBadge}>
                <CheckCircle2 size={13} color="#ffffff" />
              </View>
            )}
          </View>

          <View style={styles.peerTextContainer}>
            <View style={styles.nameRow}>
              <Text style={styles.peerName} numberOfLines={1} ellipsizeMode="tail">
                {participant.name}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.peerStatus, { color: statusColor }]} numberOfLines={1} ellipsizeMode="tail">
                {statusText}
              </Text>
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

      {/* Messages + input live inside the KAV so the header never resizes */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages Thread */}
        <FlatList
          ref={flatListRef}
          data={safeMessages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={11}
          removeClippedSubviews={Platform.OS === 'android'}
          onScroll={e => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            isNearBottomRef.current =
              layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
          }}
          scrollEventThrottle={200}
          onContentSizeChange={scrollToBottomIfNeeded}
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Lock size={22} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>Messages here are end-to-end encrypted.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const imageAttachment = item.attachment?.type === 'image' ? item.attachment : undefined;
            const displayMessage = localReactions[item.id]
              ? { ...item, reaction: localReactions[item.id] }
              : item;
            return (
              <ChatBubble
                message={displayMessage}
                isMe={item.senderId === currentUser.id}
                onInspectCiphertext={onInspectCiphertext}
                onDeleteForEveryone={onDeleteForEveryone}
                onPlayAudio={handlePlayAudio}
                isPlayingAudio={playingAudioMsgId === item.id}
                playbackSpeed={playbackSpeed}
                onToggleSpeed={handleToggleSpeed}
                onReact={handleReact}
                replyMessage={item.replyToId ? replyLookup.get(item.replyToId) : undefined}
                onReply={setReplyingTo}
                imageResolution={imageAttachment ? resolvedImages[imageAttachment.id] : undefined}
              />
            );
          }}
        />

        {/* Input Bar */}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(10, insets.bottom * 0.6) }]}>
          {/* Reply Quote Preview Bar */}
          {replyingTo && (
            <View style={styles.replyBar}>
              <View style={styles.replyBarBorder} />
              <View style={styles.replyBarContent}>
                <Text style={styles.replyBarHeader} numberOfLines={1}>
                  Replying to {replyingTo.senderId === currentUser.id ? 'yourself' : participant.name}
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
});
