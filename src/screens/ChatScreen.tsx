import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
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
import { colors, shadows } from '../theme';
import { encryptMessage, decryptMessage, IdentityKeyPair } from '../utils/crypto';
import { api } from '../services/api';
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

const TIMER_OPTIONS: DisappearingTimer[] = [0, 5, 15, 30, 60, 300, 3600, 86400];

export function ChatScreen({
  chat,
  currentUser,
  mySecretKey,
  historicalKeys,
  messages,
  isOnline,
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
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [resolvedImages, setResolvedImages] = useState<Record<string, ImageResolution>>({});
  const [playingAudioMsgId, setPlayingAudioMsgId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [localReactions, setLocalReactions] = useState<Record<string, string>>({});
  const soundRef = useRef<Audio.Sound | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const participant = chat.participant;

  const hasKeyMismatch = messages.some(
    m => m.keyMismatch || (typeof m.text === 'string' && m.text.includes('previous session'))
  );

  // Auto-focus input field on chat screen open
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, [chat.id]);

  // Reset the decrypted-image cache when switching chats — attachment ids
  // are unique enough that this isn't strictly required, but avoids holding
  // onto decrypted image data URIs for a chat that's no longer open.
  useEffect(() => {
    setResolvedImages({});
  }, [chat.id]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim(), undefined, replyingTo?.id);
    setInputText('');
    setReplyingTo(null);
  };

  const handleSendVoiceNote = (attachment: Attachment) => {
    onSendMessage('🎤 Encrypted Voice Message', attachment);
  };

  const handleAttachImage = async () => {
    beginExternalActivity();
    let perm: ImagePicker.PermissionResponse;
    let result: ImagePicker.ImagePickerResult;
    try {
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo access needed', 'JABY needs photo library access to send encrypted images. Enable it in Settings.');
        return;
      }

      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
    } finally {
      endExternalActivity();
    }
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setIsSendingImage(true);
    try {
      const info = await FileSystem.getInfoAsync(asset.uri);
      if (info.exists && info.size > MAX_ATTACHMENT_BYTES) {
        Alert.alert('Image too large', `Please choose an image under ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB.`);
        return;
      }

      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Same E2E crypto used for text messages — the image's raw bytes,
      // base64-encoded, are just the "plaintext" being encrypted.
      const encryptedPayload = encryptMessage(base64Data, mySecretKey, participant.publicKey, currentUser.publicKey);

      const mimeType = asset.mimeType || 'image/jpeg';
      const uploadResult = await api.uploadMedia({
        name: asset.fileName || 'photo.jpg',
        type: 'image',
        size: info.exists ? info.size : base64Data.length,
        mimeType,
        receiverId: participant.id,
        encryptedPayload,
      });

      if (!uploadResult.success || !uploadResult.attachment) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      // We already have the plaintext locally — seed the resolved-image
      // cache immediately so the bubble we're about to send renders instantly
      // instead of round-tripping back through the server to decrypt its own upload.
      setResolvedImages(prev => ({
        ...prev,
        [uploadResult.attachment!.id]: { status: 'ready', dataUri: `data:${mimeType};base64,${base64Data}` },
      }));

      onSendMessage('📷 Encrypted Image', uploadResult.attachment);
    } catch (err) {
      console.warn('[ChatScreen] Image send failed:', err);
      Alert.alert('Could not send image', 'Please check your connection and try again.');
    } finally {
      setIsSendingImage(false);
    }
  };

  // Lazily decrypt every received image not yet resolved — decryption stays
  // here (not in ChatBubble) because this screen is the one that holds the
  // crypto keys. Runs as an effect (not during FlatList's renderItem) so it
  // never triggers a state update mid-render.
  useEffect(() => {
    const pending = messages.filter(
      m => m.attachment?.type === 'image' && !resolvedImages[m.attachment.id]
    );

    for (const msg of pending) {
      const attachment = msg.attachment!;
      const isSentByMe = msg.senderId === currentUser.id;
      // Same key-selection rule as App.tsx's decryptVerified: nacl.box lets
      // the original sender decrypt their own ciphertext with (mySecretKey,
      // recipient's public key) — the payload's own senderPublicKey field is
      // only the right "their key" to use when *receiving*.
      const theirPublicKey = isSentByMe ? participant.publicKey : undefined;

      setResolvedImages(prev => ({ ...prev, [attachment.id]: { status: 'loading' } }));
      api.getMedia(attachment.id)
        .then(res => {
          if (!res.success || !res.attachment) throw new Error(res.error || 'Not found');
          const key = theirPublicKey || res.attachment.encryptedPayload.senderPublicKey;
          let plaintext = decryptMessage(res.attachment.encryptedPayload, mySecretKey, key);
          if (!plaintext && historicalKeys && historicalKeys.length > 0) {
            for (const hk of historicalKeys) {
              plaintext = decryptMessage(res.attachment.encryptedPayload, hk.secretKey, key);
              if (plaintext) break;
            }
          }
          if (!plaintext) throw new Error('Decryption failed');
          const mimeType = attachment.mimeType || 'image/jpeg';
          setResolvedImages(prev => ({ ...prev, [attachment.id]: { status: 'ready', dataUri: `data:${mimeType};base64,${plaintext}` } }));
        })
        .catch(err => {
          console.warn('[ChatScreen] Image decrypt failed:', err);
          setResolvedImages(prev => ({ ...prev, [attachment.id]: { status: 'error' } }));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, historicalKeys]);

  // Reset any failed image resolutions when keys change
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
    const speeds = [1.0, 1.5, 2.0];
    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    setPlaybackSpeed(nextSpeed);
    if (soundRef.current) {
      await soundRef.current.setRateAsync(nextSpeed, true).catch(() => {});
    }
  };

  const handlePlayAudio = async (msg: Message) => {
    if (!msg.attachment || msg.attachment.type !== 'audio') return;

    if (playingAudioMsgId === msg.id && soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
      setPlayingAudioMsgId(null);
      return;
    }

    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }

    setPlayingAudioMsgId(msg.id);

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

      const tempFileUri = `${FileSystem.cacheDirectory}voice_${msg.id}.m4a`;
      await FileSystem.writeAsStringAsync(tempFileUri, base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: tempFileUri },
        { shouldPlay: true, rate: playbackSpeed, shouldCorrectPitch: true },
        status => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            soundRef.current = null;
            setPlayingAudioMsgId(null);
          }
        }
      );

      soundRef.current = sound;
    } catch (err) {
      console.warn('[ChatScreen] Failed to play voice note:', err);
      Alert.alert('Playback Failed', 'Could not decrypt or play this voice message.');
      setPlayingAudioMsgId(null);
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    }
  };

  const handleReact = (msgId: string, emoji: string) => {
    setLocalReactions(prev => ({ ...prev, [msgId]: emoji }));
  };

  const cycleTimer = () => {
    const currentIndex = TIMER_OPTIONS.indexOf(chat.disappearingTimer);
    const nextIndex = (currentIndex + 1) % TIMER_OPTIONS.length;
    const nextTimer = TIMER_OPTIONS[nextIndex];
    onUpdateDisappearingTimer(nextTimer);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 25}
    >
      {/* Chat Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.peerHeaderInfo} onPress={onOpenSafetyNumbers}>
          <View style={styles.avatarContainer}>
            <Avatar uri={participant.avatar} name={participant.name} size={38} style={styles.avatar} />
            {isOnline && <View style={styles.onlineDot} />}
          </View>

          <View style={styles.peerTextContainer}>
            <View style={styles.nameRow}>
              <Text style={styles.peerName}>{participant.name}</Text>
              {chat.isVerifiedSafetyNumber && (
                <CheckCircle2 size={13} color={colors.primary} />
              )}
            </View>
            <Text style={styles.peerStatus}>
              {chat.isTyping ? 'typing...' : isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Action Buttons */}
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.timerToggle} onPress={cycleTimer}>
            <Flame size={14} color={chat.disappearingTimer > 0 ? '#d97706' : colors.textMuted} />
            <Text style={[styles.timerToggleText, chat.disappearingTimer > 0 && styles.activeTimerText]}>
              {chat.disappearingTimer > 0 ? `${chat.disappearingTimer}s` : 'Off'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={() => onStartCall('audio')}>
            <Phone size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={() => onStartCall('video')}>
            <Video size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={() => setShowMenuModal(true)}>
            <MoreVertical size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Ephemeral Timer Banner */}
      {chat.disappearingTimer > 0 && (
        <View style={styles.ephemeralBanner}>
          <Flame size={12} color="#d97706" />
          <Text style={styles.ephemeralBannerText}>
            Ephemeral Timer Active ({chat.disappearingTimer}s) · Messages self-destruct after viewing
          </Text>
        </View>
      )}

      {/* Session Lock Banner (Previous Session / Key Mismatch) */}
      {hasKeyMismatch && onOpenRestoreSession && (
        <View style={styles.sessionLockBanner}>
          <View style={styles.sessionLockLeft}>
            <Lock size={15} color="#d97706" />
            <Text style={styles.sessionLockText}>
              Previous session messages locked
            </Text>
          </View>
          <TouchableOpacity
            style={styles.sessionLockBtn}
            onPress={onOpenRestoreSession}
          >
            <Text style={styles.sessionLockBtnText}>Restore Keys</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages Thread */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
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
              replyMessage={item.replyToId ? messages.find(m => m.id === item.replyToId) : undefined}
              onReply={setReplyingTo}
              imageResolution={imageAttachment ? resolvedImages[imageAttachment.id] : undefined}
            />
          );
        }}
      />

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        {/* Reply Quote Preview Bar */}
        {replyingTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarBorder} />
            <View style={styles.replyBarContent}>
              <Text style={styles.replyBarHeader}>
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
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyBarClose}>
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
              autoFocus={true}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              enablesReturnKeyAutomatically={true}
              onKeyPress={(e: any) => {
                if (Platform.OS === 'web' && e.nativeEvent?.key === 'Enter' && !e.nativeEvent?.shiftKey) {
                  e.preventDefault?.();
                  handleSend();
                }
              }}
            />

            {inputText.trim().length > 0 ? (
              <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
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

      {/* In-Thread Conversation Controls Modal */}
      <ChatMenuModal
        visible={showMenuModal}
        chat={chat}
        onOpenSafetyNumbers={onOpenSafetyNumbers}
        onUpdateDisappearingTimer={onUpdateDisappearingTimer}
        onClearHistory={onClearHistory || (() => {})}
        onDisconnectContact={onDisconnectContact || (() => {})}
        onClose={() => setShowMenuModal(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  backButton: {
    padding: 6,
    marginRight: 6,
  },
  peerHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceElevated,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  peerTextContainer: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  peerName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  peerStatus: {
    fontSize: 11,
    color: colors.primaryDark,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  activeTimerText: {
    color: '#d97706',
  },
  iconButton: {
    padding: 7,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ephemeralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.warningLight,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  ephemeralBannerText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '700',
  },
  messagesList: {
    paddingVertical: 12,
  },
  inputContainer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 10,
    ...shadows.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachButton: {
    padding: 8,
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
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginRight: 8,
  },
  replyBarContent: {
    flex: 1,
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
    padding: 6,
  },
  sessionLockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sessionLockLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  sessionLockText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
  },
  sessionLockBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sessionLockBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
