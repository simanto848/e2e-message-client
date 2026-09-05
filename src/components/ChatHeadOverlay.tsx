import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  PanResponder,
  Dimensions,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { X, Send, Phone, ArrowRight, Video, Check, CheckCheck } from './Icons';
import { ChatThread, Message, UserProfile } from '../types';
import { colors, shadows } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HEAD_SIZE = 58;
const DISMISS_TARGET_SIZE = 64;
const DISMISS_THRESHOLD = 80;

interface Props {
  activeChat: ChatThread | null;
  currentUser: UserProfile;
  messages: Message[];
  unreadCount?: number;
  isOnline?: boolean;
  onSendMessage: (text: string) => void;
  onOpenFullChat: (chatId: string) => void;
  onStartCall: (type: 'audio' | 'video') => void;
  onDismiss: () => void;
}

export function ChatHeadOverlay({
  activeChat,
  currentUser,
  messages,
  unreadCount = 0,
  isOnline = false,
  onSendMessage,
  onOpenFullChat,
  onStartCall,
  onDismiss,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isNearDismiss, setIsNearDismiss] = useState(false);

  // Position of the floating chat head
  const pan = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - HEAD_SIZE - 16, y: 180 })).current;
  const dismissScale = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const isNearDismissRef = useRef(false);
  const panCoordsRef = useRef({ x: SCREEN_WIDTH - HEAD_SIZE - 16, y: 180 });

  useEffect(() => {
    const id = pan.addListener(val => {
      panCoordsRef.current = val;
    });
    return () => {
      pan.removeListener(id);
    };
  }, [pan]);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // PanResponder for smooth dragging and snapping
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
      },
      onPanResponderGrant: () => {
        setIsDragging(true);
        Animated.spring(dismissScale, {
          toValue: 1,
          useNativeDriver: true,
        }).start();
        pan.setOffset({
          x: panCoordsRef.current.x,
          y: panCoordsRef.current.y,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        pan.setValue({ x: gestureState.dx, y: gestureState.dy });

        // Check proximity to bottom center dismiss target
        const currentX = panCoordsRef.current.x + gestureState.dx;
        const currentY = panCoordsRef.current.y + gestureState.dy;
        const targetX = SCREEN_WIDTH / 2 - HEAD_SIZE / 2;
        const targetY = SCREEN_HEIGHT - 120;

        const distance = Math.hypot(currentX - targetX, currentY - targetY);
        if (distance < DISMISS_THRESHOLD) {
          if (!isNearDismissRef.current) {
            isNearDismissRef.current = true;
            setIsNearDismiss(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }
        } else {
          if (isNearDismissRef.current) {
            isNearDismissRef.current = false;
            setIsNearDismiss(false);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        setIsDragging(false);
        Animated.spring(dismissScale, {
          toValue: 0,
          useNativeDriver: true,
        }).start();

        pan.flattenOffset();

        // If dropped near dismiss zone, dismiss the chat head
        const finalX = panCoordsRef.current.x;
        const finalY = panCoordsRef.current.y;
        const targetX = SCREEN_WIDTH / 2 - HEAD_SIZE / 2;
        const targetY = SCREEN_HEIGHT - 120;
        const distance = Math.hypot(finalX - targetX, finalY - targetY);

        if (distance < DISMISS_THRESHOLD) {
          isNearDismissRef.current = false;
          setIsNearDismiss(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onDismissRef.current();
          return;
        }

        // Snap to nearest screen edge (left or right)
        const snapToRight = finalX > SCREEN_WIDTH / 2 - HEAD_SIZE / 2;
        const destX = snapToRight ? SCREEN_WIDTH - HEAD_SIZE - 12 : 12;
        const boundedY = Math.max(60, Math.min(SCREEN_HEIGHT - 160, finalY));

        Animated.spring(pan, {
          toValue: { x: destX, y: boundedY },
          friction: 6,
          tension: 40,
          useNativeDriver: false,
        }).start();

        // If it was just a tap (minimal drag distance), toggle expand
        if (Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6) {
          setIsExpanded(prev => !prev);
        }
      },
    })
  ).current;

  useEffect(() => {
    if (isExpanded) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 60);
    }
  }, [isExpanded, messages.length]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  if (!activeChat) return null;

  const participant = activeChat.participant;

  return (
    <>
      {/* Floating Messenger Head */}
      {!isExpanded && (
        <Animated.View
          style={[
            styles.floatingHeadContainer,
            {
              transform: [{ translateX: pan.x }, { translateY: pan.y }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.bubbleRing}>
            {participant.avatar ? (
              <Image source={{ uri: participant.avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{participant.name.slice(0, 2).toUpperCase()}</Text>
              </View>
            )}

            {/* Online Indicator */}
            {isOnline && <View style={styles.onlineDot} />}

            {/* Unread Counter Badge */}
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </View>
        </Animated.View>
      )}

      {/* Bottom Dismiss Target Zone ("X" like Messenger) */}
      {isDragging && (
        <Animated.View
          style={[
            styles.dismissTarget,
            {
              transform: [{ scale: dismissScale }],
              backgroundColor: isNearDismiss ? '#ef4444' : 'rgba(15, 23, 42, 0.85)',
              borderColor: isNearDismiss ? '#fca5a5' : '#334155',
            },
          ]}
        >
          <X size={26} color="#ffffff" />
        </Animated.View>
      )}

      {/* Expanded Floating Quick Chat Card */}
      {isExpanded && (
        <View style={styles.expandedBackdrop}>
          <TouchableWithoutFeedback onPress={() => setIsExpanded(false)}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.expandedContainer}
          >
            <View style={styles.quickChatCard}>
              {/* Header */}
              <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                  <View style={styles.headerAvatarContainer}>
                    {participant.avatar ? (
                      <Image source={{ uri: participant.avatar }} style={styles.headerAvatar} />
                    ) : (
                      <View style={[styles.headerAvatar, styles.avatarFallback]}>
                        <Text style={styles.headerAvatarText}>{participant.name.slice(0, 2).toUpperCase()}</Text>
                      </View>
                    )}
                    {isOnline && <View style={styles.headerOnlineDot} />}
                  </View>

                  <View style={styles.headerTextCol}>
                    <Text style={styles.headerName} numberOfLines={1}>{participant.name}</Text>
                    <Text style={styles.headerStatus}>{isOnline ? 'Online now' : 'Offline'}</Text>
                  </View>
                </View>

                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setIsExpanded(false);
                      onStartCall('audio');
                    }}
                  >
                    <Phone size={18} color={colors.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setIsExpanded(false);
                      onOpenFullChat(activeChat.id);
                    }}
                  >
                    <ArrowRight size={18} color={colors.textPrimary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => setIsExpanded(false)}
                  >
                    <X size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Message History */}
              <ScrollView
                ref={scrollViewRef}
                style={styles.messagesList}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
              >
                {messages.length === 0 ? (
                  <View style={styles.emptyMessagesContainer}>
                    <Text style={styles.emptyMessagesTitle}>End-to-End Encrypted</Text>
                    <Text style={styles.emptyMessagesSubtitle}>
                      Send a message to start chatting with {participant.name}.
                    </Text>
                  </View>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.senderId === currentUser.id;
                    const timeStr = msg.timestamp
                      ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '';
                    return (
                      <View
                        key={msg.id}
                        style={[
                          styles.msgRow,
                          isMe ? styles.myMsgRow : styles.theirMsgRow,
                        ]}
                      >
                        <View
                          style={[
                            styles.msgBubble,
                            isMe ? styles.myMsgBubble : styles.theirMsgBubble,
                          ]}
                        >
                          <Text
                            style={[
                              styles.msgText,
                              isMe ? styles.myMsgText : styles.theirMsgText,
                            ]}
                          >
                            {msg.text || (msg.attachment ? `[${msg.attachment.name}]` : 'Encrypted message')}
                          </Text>
                          <View style={styles.bubbleFooter}>
                            {timeStr ? (
                              <Text style={[styles.msgTime, isMe ? styles.myMsgTime : styles.theirMsgTime]}>
                                {timeStr}
                              </Text>
                            ) : null}
                            {isMe && (
                              <View style={styles.statusCheck}>
                                {msg.status === 'read' ? (
                                  <CheckCheck size={11} color="rgba(255, 255, 255, 0.9)" />
                                ) : (
                                  <Check size={11} color="rgba(255, 255, 255, 0.7)" />
                                )}
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              {/* Quick Input Bar */}
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Type a message..."
                  placeholderTextColor={colors.textMuted}
                  value={inputText}
                  onChangeText={setInputText}
                  onSubmitEditing={handleSend}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={!inputText.trim()}
                >
                  <Send size={16} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  floatingHeadContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    zIndex: 9999,
  },
  bubbleRing: {
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    borderRadius: HEAD_SIZE / 2,
    backgroundColor: '#0f172a',
    borderWidth: 2.5,
    borderColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
    elevation: 12,
  },
  avatarImage: {
    width: HEAD_SIZE - 6,
    height: HEAD_SIZE - 6,
    borderRadius: (HEAD_SIZE - 6) / 2,
  },
  avatarFallback: {
    width: HEAD_SIZE - 6,
    height: HEAD_SIZE - 6,
    borderRadius: (HEAD_SIZE - 6) / 2,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  dismissTarget: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    width: DISMISS_TARGET_SIZE,
    height: DISMISS_TARGET_SIZE,
    borderRadius: DISMISS_TARGET_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9998,
    ...shadows.lg,
    elevation: 10,
  },
  expandedBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 10000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  expandedContainer: {
    width: '100%',
    maxWidth: 380,
  },
  quickChatCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    height: Math.min(520, Math.floor(SCREEN_HEIGHT * 0.65)),
    overflow: 'hidden',
    ...shadows.lg,
    elevation: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerAvatarContainer: {
    position: 'relative',
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  headerAvatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  headerOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  headerTextCol: {
    flex: 1,
  },
  headerName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerStatus: {
    fontSize: 11,
    color: colors.textMuted,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: {
    flex: 1,
    backgroundColor: colors.background,
  },
  messagesContent: {
    padding: 12,
    gap: 8,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  myMsgRow: {
    justifyContent: 'flex-end',
  },
  theirMsgRow: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  myMsgBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 2,
  },
  theirMsgBubble: {
    backgroundColor: colors.surfaceElevated,
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  msgText: {
    fontSize: 13,
    lineHeight: 18,
  },
  myMsgText: {
    color: '#ffffff',
  },
  theirMsgText: {
    color: colors.textPrimary,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 3,
  },
  msgTime: {
    fontSize: 10,
  },
  myMsgTime: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  theirMsgTime: {
    color: colors.textMuted,
  },
  statusCheck: {
    marginLeft: 2,
  },
  emptyMessagesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyMessagesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptyMessagesSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 38,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 19,
    paddingHorizontal: 14,
    fontSize: 13,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
