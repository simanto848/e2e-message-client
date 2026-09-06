import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Send, Phone, Video, ExternalLink, Paperclip, Check, CheckCheck, Mic, Trash2, ChevronDown } from './Icons';
import { ChatThread, Message, UserProfile } from '../types';
import { colors, shadows } from '../theme';
import { formatLastSeen } from '../utils/dateUtils';
import { startVoiceRecording, stopVoiceRecording, discardVoiceRecording } from '../utils/audioRecorder';
import type { Audio } from 'expo-av';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HEAD_SIZE = 58;
const DISMISS_TARGET_SIZE = 64;
const DISMISS_THRESHOLD = 80;

export interface ChatHeadAttachmentData {
  uri: string;
  name: string;
  type: 'image' | 'audio';
  size: number;
  mimeType?: string;
}

interface Props {
  threads?: ChatThread[];
  activeChat?: ChatThread | null;
  activeThreadId?: string | null;
  currentUser: UserProfile;
  messages: Message[];
  unreadCount?: number;
  isOnline?: boolean;
  onlineUserIds?: Set<string>;
  lastSeenMap?: Record<string, number>;
  isExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
  onSelectThread?: (threadId: string) => void;
  onCloseThread?: (threadId: string) => void;
  onSendMessage: (text: string) => void;
  onSendAttachment?: (threadId: string, attachment: ChatHeadAttachmentData) => Promise<void> | void;
  onOpenFullChat: (chatId: string) => void;
  onStartCall: (type: 'audio' | 'video', threadId?: string) => void;
  onDismiss: () => void;
  onDismissFloating?: () => void;
  // True when the app was launched from the OS-level bubble (outside the app).
  // In that mode, minimizing must return to the launcher with the native
  // bubble — never reveal the full in-app UI.
  isOpenedFromChatHead?: boolean;
}

function formatVoiceTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ChatHeadOverlay({
  threads,
  activeChat,
  activeThreadId,
  currentUser,
  messages,
  unreadCount = 0,
  isOnline = false,
  onlineUserIds,
  lastSeenMap,
  isExpanded: controlledExpanded,
  onToggleExpand,
  onSelectThread,
  onCloseThread,
  onSendMessage,
  onSendAttachment,
  onOpenFullChat,
  onStartCall,
  onDismiss,
  onDismissFloating,
  isOpenedFromChatHead = false,
}: Props) {
  // Normalize up to 3 threads — no fallback invention here. If the parent has
  // no minimized/unread threads, render nothing (the native OS bubble covers
  // the outside-the-app case). This stops the head floating over the chat
  // list on fresh launch with zero unread. Deduped by thread id so one
  // conversation can never render two bubbles.
  const allThreads: ChatThread[] = useMemo(() => {
    const raw =
      threads && threads.length > 0
        ? threads.slice(0, 3)
        : activeChat
          ? [activeChat]
          : [];
    const seen = new Set<string>();
    return raw.filter(t => {
      if (!t?.participant || !t.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [threads, activeChat]);
  const threadIdsKey = useMemo(() => allThreads.map(t => t.id).join(','), [allThreads]);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    activeThreadId || allThreads[0]?.id || null
  );
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const setIsExpanded = (val: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof val === 'function' ? (val as (p: boolean) => boolean)(isExpanded) : val;
    setInternalExpanded(nextVal);
    onToggleExpand?.(nextVal);
  };
  // Messenger behavior: tap avatar to expand/collapse, tap outside to
  // minimize (collapse, never fully dismiss). No X close button.
  // When launched from the OS bubble (outside the app), minimizing means
  // going back to the launcher with the native bubble — it must NOT fall
  // through to the full in-app UI.
  const minimizeCard = () => {
    setIsExpanded(false);
    if (isOpenedFromChatHead) {
      onDismissFloating?.();
    }
  };
  const collapseToBubble = () => minimizeCard();
  const expandFromBubble = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsExpanded(true);
  };

  const [inputText, setInputText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isNearDismiss, setIsNearDismiss] = useState(false);
  const [isSendingAttachment, setIsSendingAttachment] = useState(false);

  // Voice-note state (mini recorder inside the floating card — delegates
  // encryption/upload to the parent via onSendAttachment like images do).
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const voiceRecordingRef = useRef<Audio.Recording | null>(null);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopVoiceTimer = () => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  useEffect(() => stopVoiceTimer, []);

  const handleStartVoice = async () => {
    if (isRecordingVoice || isSendingVoice) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const recording = await startVoiceRecording();
      voiceRecordingRef.current = recording;
      setVoiceSeconds(0);
      setIsRecordingVoice(true);
      voiceTimerRef.current = setInterval(() => {
        setVoiceSeconds(prev => {
          if (prev + 1 >= 300) {
            // Auto-send at 5 min cap
            setTimeout(() => handleSendVoice(), 0);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.warn('[ChatHeadOverlay] Mic start failed:', err);
      Alert.alert('Microphone unavailable', 'Could not start recording. Check microphone permissions in Settings.');
    }
  };

  const handleCancelVoice = async () => {
    stopVoiceTimer();
    const rec = voiceRecordingRef.current;
    voiceRecordingRef.current = null;
    setIsRecordingVoice(false);
    setVoiceSeconds(0);
    if (rec) {
      try {
        await discardVoiceRecording(rec);
      } catch {}
      try {
        const uri = rec.getURI?.();
        if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      } catch {}
    }
  };

  const handleSendVoice = async () => {
    const rec = voiceRecordingRef.current;
    if (!rec || isSendingVoice) return;
    voiceRecordingRef.current = null;
    stopVoiceTimer();
    setIsSendingVoice(true);
    let uri: string | null = null;
    try {
      uri = await stopVoiceRecording(rec);
      if (!uri) throw new Error('Recording produced no file');
      const info = await FileSystem.getInfoAsync(uri).catch(() => null);
      const size = info?.exists ? (info.size ?? 0) : 0;
      setIsRecordingVoice(false);
      await onSendAttachment?.(currentThread.id, {
        uri,
        name: `Voice Note (${formatVoiceTime(Math.max(1, voiceSeconds))})`,
        type: 'audio',
        size,
        mimeType: 'audio/m4a',
      });
      setVoiceSeconds(0);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (err) {
      console.warn('[ChatHeadOverlay] Voice send failed:', err);
      Alert.alert('Could not send voice note', 'Please check your connection and try again.');
      setIsRecordingVoice(false);
    } finally {
      if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      setIsSendingVoice(false);
    }
  };

  // Sync selected thread if activeThreadId changes (keyed by ids to avoid loops)
  useEffect(() => {
    if (activeThreadId && threadIdsKey.split(',').includes(activeThreadId)) {
      setSelectedThreadId(activeThreadId);
    } else if (allThreads.length > 0 && (!selectedThreadId || !threadIdsKey.split(',').includes(selectedThreadId))) {
      setSelectedThreadId(allThreads[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, threadIdsKey]);

  // Reset transient input/voice state when switching mini-chat threads
  useEffect(() => {
    setInputText('');
    handleCancelVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

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

  // PanResponder for smooth dragging and snapping. Tap (no drag) toggles
  // expand — the avatar itself is the expand/collapse control, Messenger-style.
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

        // If it was just a tap (minimal drag distance), expand like Messenger
        if (Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6) {
          expandFromBubble();
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
  }, [isExpanded, messages.length, selectedThreadId]);

  if (allThreads.length === 0) return null;

  const currentThread = allThreads.find(t => t.id === selectedThreadId) || allThreads[0];
  const participant = currentThread.participant;

  const checkIsOnline = (userId: string) => {
    if (onlineUserIds) return onlineUserIds.has(userId);
    return isOnline;
  };

  const isCurrentOnline = checkIsOnline(participant.id);

  // Fallback calculation for contact presence / last seen
  const effectiveLastActiveAt = useMemo(() => {
    if (isCurrentOnline) return Date.now();

    // 1. Socket presence map from live presence events
    const fromMap = lastSeenMap?.[participant.id];
    if (fromMap && typeof fromMap === 'number' && fromMap > 0) {
      return fromMap;
    }

    // 2. Contact profile from database/API
    if (participant.lastActiveAt && typeof participant.lastActiveAt === 'number' && participant.lastActiveAt > 0) {
      return participant.lastActiveAt;
    }

    // 3. Most recent message from this participant
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.senderId === participant.id && msg.timestamp && msg.timestamp > 0) {
        return msg.timestamp;
      }
    }

    // 4. Most recent message in thread
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.timestamp && msg.timestamp > 0) {
        return msg.timestamp;
      }
    }

    // 5. Current thread last message timestamp
    if (currentThread.lastMessage?.timestamp && currentThread.lastMessage.timestamp > 0) {
      return currentThread.lastMessage.timestamp;
    }

    // 6. Default fallback so it never displays static 'Offline' when contact exists
    return Date.now() - 5 * 60 * 1000;
  }, [isCurrentOnline, lastSeenMap, participant.id, participant.lastActiveAt, messages, currentThread.lastMessage]);

  const totalUnreadCount = allThreads.reduce((acc, t) => acc + (t.unreadCount || 0), 0) || unreadCount;

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  const handleSelectTab = (threadId: string) => {
    // Tapping the already-active avatar minimizes back to the bubble
    // (Messenger-style); tapping another avatar switches threads.
    if (threadId === selectedThreadId) {
      minimizeCard();
      return;
    }
    setSelectedThreadId(threadId);
    if (onSelectThread) {
      onSelectThread(threadId);
    }
  };

  const handleCloseTab = (threadId: string) => {
    if (onCloseThread) {
      onCloseThread(threadId);
    }
    const remaining = allThreads.filter(t => t.id !== threadId);
    if (remaining.length === 0) {
      setIsExpanded(false);
      onDismiss();
    } else if (selectedThreadId === threadId) {
      const nextId = remaining[0].id;
      setSelectedThreadId(nextId);
      if (onSelectThread) onSelectThread(nextId);
    }
  };

  const handlePickAttachment = async () => {
    if (!currentThread || !onSendAttachment) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Please grant photo library access to send attachments.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setIsSendingAttachment(true);
      await onSendAttachment(currentThread.id, {
        uri: asset.uri,
        name: asset.fileName || 'photo.jpg',
        type: 'image',
        size: asset.fileSize || 0,
        mimeType: asset.mimeType || 'image/jpeg',
      });
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 200);
    } catch (err) {
      console.warn('[ChatHeadOverlay] Attachment error:', err);
      Alert.alert('Attachment failed', 'Could not send file from chat head. Please try again.');
    } finally {
      setIsSendingAttachment(false);
    }
  };

  return (
    <>
      {/* Floating Messenger Head(s) — avatar IS the button (tap to expand) */}
      {!isExpanded && (
        <Animated.View
          style={[
            styles.floatingHeadContainer,
            {
              transform: [{ translateX: pan.x }, { translateY: pan.y }],
              width: allThreads.length > 1 ? HEAD_SIZE + (allThreads.length - 1) * 16 : HEAD_SIZE,
            },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={expandFromBubble}
            accessibilityRole="button"
            accessibilityLabel={allThreads.length === 1 ? `Open quick chat with ${participant.name}` : 'Open quick chats'}
          >
            {allThreads.length === 1 ? (
              <View style={styles.bubbleRing}>
                {participant.avatar ? (
                  <Image source={{ uri: participant.avatar }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarImage, styles.avatarFallback]}>
                    <Text style={styles.avatarText}>{participant.name.slice(0, 2).toUpperCase()}</Text>
                  </View>
                )}

                {/* Online Indicator */}
                {isCurrentOnline && <View style={styles.onlineDot} />}

                {/* Unread Counter Badge */}
                {totalUnreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              /* Multi-user Stack (Max 3 Users) */
              <View style={styles.clusterContainer}>
                {allThreads.map((t, idx) => {
                  const isOnlineItem = checkIsOnline(t.participant.id);
                  return (
                    <View
                      key={t.id}
                      style={[
                        styles.clusterBubble,
                        {
                          left: idx * 16,
                          zIndex: 10 - idx,
                        },
                      ]}
                    >
                      {t.participant.avatar ? (
                        <Image source={{ uri: t.participant.avatar }} style={styles.clusterAvatar} />
                      ) : (
                        <View style={[styles.clusterAvatar, styles.avatarFallback]}>
                          <Text style={styles.clusterAvatarText}>
                            {t.participant.name.slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      {isOnlineItem && <View style={styles.clusterOnlineDot} />}
                    </View>
                  );
                })}

                {/* Consolidated Unread Badge */}
                {totalUnreadCount > 0 && (
                  <View style={[styles.unreadBadge, styles.clusterUnreadBadge]}>
                    <Text style={styles.unreadBadgeText}>
                      {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Bottom Dismiss Target Zone (drag here to dismiss) */}
      {isDragging && (
        <View style={styles.dismissTarget}>
          <Text style={styles.dismissTargetText}>Drag here to dismiss</Text>
        </View>
      )}

      {/* Expanded Messenger-style Quick Chat Card.
          Tap outside (backdrop) minimizes back to the bubble. */}
      {isExpanded && (
        <View style={styles.expandedBackdrop}>
          <TouchableWithoutFeedback onPress={collapseToBubble} accessibilityLabel="Minimize quick chat">
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.expandedContainer}
          >
            <View style={styles.quickChatCard}>
              {/* Multi-User Tab Bar — avatar-only strip (up to 3).
                  Tap an avatar to switch; tap the active one to minimize. */}
              {allThreads.length > 1 && (
                <View style={styles.tabBar}>
                  {allThreads.map(t => {
                    const isTabActive = t.id === currentThread.id;
                    const isTabOnline = checkIsOnline(t.participant.id);
                    return (
                      <View key={t.id} style={styles.tabAvatarWrapper}>
                        <TouchableOpacity
                          style={[styles.tabAvatarRing, isTabActive && styles.tabAvatarRingActive]}
                          onPress={() => handleSelectTab(t.id)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={
                            isTabActive
                              ? `Minimize chat with ${t.participant.name}`
                              : `Switch to ${t.participant.name}`
                          }
                        >
                          {t.participant.avatar ? (
                            <Image source={{ uri: t.participant.avatar }} style={styles.tabAvatar} />
                          ) : (
                            <View style={[styles.tabAvatar, styles.avatarFallback]}>
                              <Text style={styles.tabAvatarText}>
                                {t.participant.name.slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          {isTabOnline && <View style={styles.tabOnlineDot} />}
                          {t.unreadCount > 0 && !isTabActive && (
                            <View style={styles.tabUnreadBadge}>
                              <Text style={styles.tabUnreadBadgeText}>{t.unreadCount > 99 ? '99+' : t.unreadCount}</Text>
                            </View>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.tabCloseBadge}
                          onPress={() => handleCloseTab(t.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${t.participant.name} from chat heads`}
                        >
                          <Text style={styles.tabCloseText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Active Conversation Header — Messenger style.
                  Avatar tap collapses (no X button). */}
              <View style={styles.cardHeader}>
                <TouchableOpacity
                  style={styles.headerLeft}
                  onPress={collapseToBubble}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Minimize chat with ${participant.name}. Tap avatar to minimize.`}
                >
                  <View style={styles.headerAvatarContainer}>
                    {participant.avatar ? (
                      <Image source={{ uri: participant.avatar }} style={styles.headerAvatar} />
                    ) : (
                      <View style={[styles.headerAvatar, styles.avatarFallback]}>
                        <Text style={styles.headerAvatarText}>
                          {participant.name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {isCurrentOnline && <View style={styles.headerOnlineDot} />}
                  </View>

                  <View style={styles.headerTextCol}>
                    <Text style={styles.headerName} numberOfLines={1}>
                      {participant.name}
                    </Text>
                    <Text
                      style={[
                        styles.headerStatus,
                        isCurrentOnline && styles.headerStatusOnline,
                      ]}
                      numberOfLines={1}
                    >
                      {isCurrentOnline ? 'Online now' : formatLastSeen(effectiveLastActiveAt)}
                    </Text>
                  </View>
                  <View style={styles.minimizeHint}>
                    <ChevronDown size={16} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>

                <View style={styles.headerActions}>
                  {/* Voice Call */}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setIsExpanded(false);
                      onStartCall('audio', currentThread.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Voice call ${participant.name}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Phone size={17} color={colors.primary} />
                  </TouchableOpacity>

                  {/* Video Call */}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setIsExpanded(false);
                      onStartCall('video', currentThread.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Video call ${participant.name}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Video size={17} color={colors.primary} />
                  </TouchableOpacity>

                  {/* Open in Full Chat */}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setIsExpanded(false);
                      onOpenFullChat(currentThread.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Open in full chat"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <ExternalLink size={16} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Message History */}
              <ScrollView
                ref={scrollViewRef}
                style={styles.messagesList}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {messages.length === 0 ? (
                  <View style={styles.emptyMessagesContainer}>
                    <Text style={styles.emptyMessagesTitle}>End-to-End Encrypted</Text>
                    <Text style={styles.emptyMessagesSubtitle}>
                      Send a secure message or file to {participant.name}.
                    </Text>
                  </View>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.senderId === currentUser.id;
                    const timeStr = msg.timestamp
                      ? new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '';
                    const isVoice = msg.attachment?.type === 'audio';
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
                            {isVoice
                              ? `🎤 Voice message${msg.attachment?.duration ? ` (${formatVoiceTime(msg.attachment.duration)})` : ''}`
                              : msg.text || (msg.attachment ? `[${msg.attachment.name}]` : 'Encrypted message')}
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

              {/* Quick Input Bar: image attach + voice + text (Messenger-style) */}
              {isRecordingVoice || isSendingVoice ? (
                <View style={styles.voiceBar}>
                  <TouchableOpacity
                    style={styles.voiceCancelBtn}
                    onPress={handleCancelVoice}
                    disabled={isSendingVoice}
                    accessibilityRole="button"
                    accessibilityLabel="Discard voice recording"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Trash2 size={18} color="#ef4444" />
                  </TouchableOpacity>
                  <View style={styles.voiceTimerWrap}>
                    <View style={styles.voiceLiveDot} />
                    <Text style={styles.voiceTimerText}>{formatVoiceTime(voiceSeconds)}</Text>
                    <Text style={styles.voiceHintText}>{isSendingVoice ? 'Sending…' : 'Recording…'}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.sendBtn, isSendingVoice && styles.sendBtnDisabled]}
                    onPress={handleSendVoice}
                    disabled={isSendingVoice}
                    accessibilityRole="button"
                    accessibilityLabel="Send voice message"
                  >
                    {isSendingVoice ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Send size={16} color="#ffffff" />
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.inputRow}>
                  {onSendAttachment && (
                    <TouchableOpacity
                      style={styles.attachBtn}
                      onPress={handlePickAttachment}
                      disabled={isSendingAttachment}
                      accessibilityRole="button"
                      accessibilityLabel="Attach image"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {isSendingAttachment ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Paperclip size={19} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  )}

                  <TextInput
                    style={styles.textInput}
                    placeholder="Type a secure message..."
                    placeholderTextColor={colors.textMuted}
                    value={inputText}
                    onChangeText={setInputText}
                    onSubmitEditing={handleSend}
                    returnKeyType="send"
                    accessibilityLabel="Quick chat message input"
                  />

                  {inputText.trim().length > 0 ? (
                    <TouchableOpacity
                      style={styles.sendBtn}
                      onPress={handleSend}
                      accessibilityRole="button"
                      accessibilityLabel="Send message"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Send size={16} color="#ffffff" />
                    </TouchableOpacity>
                  ) : onSendAttachment ? (
                    <TouchableOpacity
                      style={styles.micBtn}
                      onPress={handleStartVoice}
                      accessibilityRole="button"
                      accessibilityLabel="Record voice message"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Mic size={18} color="#ffffff" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
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
  clusterContainer: {
    position: 'relative',
    height: HEAD_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
  },
  clusterBubble: {
    position: 'absolute',
    top: 3,
    width: HEAD_SIZE - 6,
    height: HEAD_SIZE - 6,
    borderRadius: (HEAD_SIZE - 6) / 2,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    ...shadows.md,
    elevation: 8,
  },
  clusterAvatar: {
    width: '100%',
    height: '100%',
  },
  clusterAvatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  clusterOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  clusterUnreadBadge: {
    top: -2,
    right: -6,
    zIndex: 20,
  },
  avatarImage: {
    width: HEAD_SIZE - 6,
    height: HEAD_SIZE - 6,
    borderRadius: (HEAD_SIZE - 6) / 2,
  },
  avatarFallback: {
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
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9998,
  },
  dismissTargetText: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
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
    maxWidth: 390,
  },
  quickChatCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    height: Math.min(540, Math.floor(SCREEN_HEIGHT * 0.7)),
    overflow: 'hidden',
    ...shadows.lg,
    elevation: 20,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabAvatarWrapper: {
    position: 'relative',
  },
  tabAvatarRing: {
    borderRadius: 22,
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabAvatarRingActive: {
    borderColor: '#10b981',
  },
  tabAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  tabAvatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  tabOnlineDot: {
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
  tabUnreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  tabUnreadBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  tabCloseBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCloseText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: -1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  headerAvatarContainer: {
    position: 'relative',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
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
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#10b981',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  headerName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerStatus: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  headerStatusOnline: {
    color: '#059669',
    fontWeight: '600',
  },
  minimizeHint: {
    padding: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 90,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 10,
  },
  voiceCancelBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceTimerWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  voiceTimerText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  voiceHintText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
