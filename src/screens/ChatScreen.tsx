import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
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
} from '../components/Icons';
import { ChatThread, Message, UserProfile, Attachment, DisappearingTimer } from '../types';
import { ChatBubble } from '../components/ChatBubble';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { ChatMenuModal } from '../components/ChatMenuModal';
import { colors, shadows } from '../theme';

interface Props {
  chat: ChatThread;
  currentUser: UserProfile;
  messages: Message[];
  isOnline: boolean;
  onBack: () => void;
  onSendMessage: (text: string, attachment?: Attachment) => void;
  onDeleteForEveryone: (messageId: string) => void;
  onStartCall: (type: 'audio' | 'video') => void;
  onInspectCiphertext: (message: Message) => void;
  onOpenSafetyNumbers: () => void;
  onUpdateDisappearingTimer: (timer: DisappearingTimer) => void;
  onClearHistory?: () => void;
  onDisconnectContact?: () => void;
}

const TIMER_OPTIONS: DisappearingTimer[] = [0, 5, 15, 30, 60, 300, 3600, 86400];

export function ChatScreen({
  chat,
  currentUser,
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
}: Props) {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const participant = chat.participant;

  // Auto-focus input field on chat screen open
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, [chat.id]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleSendVoiceNote = (attachment: Attachment) => {
    onSendMessage('🎤 Encrypted Voice Message', attachment);
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
            <Image source={{ uri: participant.avatar }} style={styles.avatar} />
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

      {/* Messages Thread */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <ChatBubble
            message={item}
            isMe={item.senderId === currentUser.id}
            onInspectCiphertext={onInspectCiphertext}
            onDeleteForEveryone={onDeleteForEveryone}
          />
        )}
      />

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        {isRecording ? (
          <VoiceRecorder
            isRecording={isRecording}
            onStartRecord={() => setIsRecording(true)}
            onStopRecord={() => setIsRecording(false)}
            onCancelRecord={() => setIsRecording(false)}
            onSendVoiceNote={handleSendVoiceNote}
          />
        ) : (
          <View style={styles.inputRow}>
            <TouchableOpacity
              style={styles.attachButton}
              onPress={() => {
                Alert.alert(
                  'Encrypted Attachment',
                  'Select payload type to encrypt:',
                  [
                    { text: 'Confidential Photo', onPress: () => onSendMessage('📷 Encrypted Image Payload') },
                    { text: 'Confidential Doc', onPress: () => onSendMessage('📄 Encrypted Document (PDF)') },
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
            >
              <Paperclip size={18} color={colors.textSecondary} />
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
});
