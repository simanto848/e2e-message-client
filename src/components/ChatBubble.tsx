import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Animated, PanResponder } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Flame, Check, CheckCheck, Play, Pause, Trash2, ImageIcon, Phone, PhoneOff, Video, Clock, MoreHorizontal } from './Icons';
import { MessageOptionsMenuModal } from './MessageOptionsMenuModal';
import { Message } from '../types';
import { colors, shadows } from '../theme';
import { formatDisappearingTimer } from '../utils/timerUtils';

type ImageResolution = { status: 'loading' } | { status: 'ready'; dataUri: string } | { status: 'error' };

interface Props {
  message: Message;
  isMe: boolean;
  onInspectCiphertext?: (msg: Message) => void;
  onDeleteForMe?: (msgId: string) => void;
  onDeleteForEveryone?: (msgId: string) => void;
  onPlayAudio?: (msg: Message) => void;
  isPlayingAudio?: boolean;
  playbackSpeed?: number;
  onToggleSpeed?: () => void;
  onReact?: (msgId: string, emoji: string) => void;
  replyMessage?: Message;
  onReply?: (msg: Message) => void;
  replySenderName?: string;
  onJumpToReply?: (messageId: string) => void;
  onRetrySend?: (messageId: string) => void;
  onPressImage?: (attachmentId: string) => void;
  onForward?: (message: Message) => void;
  imageResolution?: ImageResolution;
  highlight?: boolean;
  searchQuery?: string;
}
// Shared single interval across all ChatBubble instances to eliminate timer proliferation
/** Render message text with the in-conversation search query highlighted. */
function renderSearchHighlightedText(text: string, query: string | undefined, baseStyle: any) {
  const q = (query || '').trim().toLowerCase();
  if (!q || !text || !text.toLowerCase().includes(q)) {
    return <Text style={baseStyle}>{text}</Text>;
  }
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (true) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      parts.push(
        <Text key={k++} style={baseStyle}>
          {text.slice(i)}
        </Text>
      );
      break;
    }
    if (idx > i) {
      parts.push(
        <Text key={k++} style={baseStyle}>
          {text.slice(i, idx)}
        </Text>
      );
    }
    parts.push(
      <Text key={k++} style={[baseStyle, styles.searchHighlight]}>
        {text.slice(idx, idx + q.length)}
      </Text>
    );
    i = idx + q.length;
  }
  return <Text>{parts}</Text>;
}

type TickerCallback = (now: number) => void;const tickerListeners = new Set<TickerCallback>();
let sharedTickerInterval: ReturnType<typeof setInterval> | null = null;

function subscribeToSharedTicker(cb: TickerCallback): () => void {
  tickerListeners.add(cb);
  if (!sharedTickerInterval) {
    sharedTickerInterval = setInterval(() => {
      const now = Date.now();
      tickerListeners.forEach(listener => listener(now));
    }, 1000);
  }
  return () => {
    tickerListeners.delete(cb);
    if (tickerListeners.size === 0 && sharedTickerInterval) {
      clearInterval(sharedTickerInterval);
      sharedTickerInterval = null;
    }
  };
}

export function ChatBubble({
  message,
  isMe,
  onInspectCiphertext,
  onDeleteForMe,
  onDeleteForEveryone,
  onPlayAudio,
  isPlayingAudio = false,
  playbackSpeed = 1,
  onToggleSpeed,
  onReact,
  replyMessage,
  onReply,
  replySenderName,
  onJumpToReply,
  onRetrySend,
  onPressImage,
  onForward,
  imageResolution,
  highlight = false,
  searchQuery,
}: Props) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showFullTime, setShowFullTime] = useState(false);
  const [copiedTick, setCopiedTick] = useState(false);
  const lastTapRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🔒', '😂', '👀'];

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyText = async () => {
    if (!message.text) return;
    try {
      await Clipboard.setStringAsync(message.text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCopiedTick(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedTick(false), 1400);
    } catch {
      // Clipboard unavailable — stay silent.
    }
  };

  const handleBubblePress = () => {
    // Pending (offline-queued) messages: tap retries the send.
    if (message.status === 'sending' && onRetrySend) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onRetrySend(message.id);
      return;
    }
    const now = Date.now();
    // Double-tap sends a quick ❤️ (single tap still toggles the timestamp).
    if (now - lastTapRef.current < 300 && onReact) {
      lastTapRef.current = 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onReact(message.id, '❤️');
      return;
    }
    lastTapRef.current = now;
    setShowFullTime(prev => !prev);
  };

  // Swipe-to-reply (Messenger-style): horizontal drag past the threshold
  // sets this message as the reply quote. Pure PanResponder — no extra deps.
  const swipeX = useRef(new Animated.Value(0)).current;
  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_, g) => swipeX.setValue(Math.max(-70, Math.min(70, g.dx))),
      onPanResponderRelease: (_, g) => {
        const fire = Math.abs(g.dx) > 45;
        Animated.spring(swipeX, { toValue: 0, friction: 7, useNativeDriver: true }).start();
        if (fire && onReply) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onReply(message);
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeX, { toValue: 0, friction: 7, useNativeDriver: true }).start();
      },
    })
  ).current;
  const swipeHintOpacity = swipeX.interpolate({
    inputRange: [-50, -12, 12, 50],
    outputRange: [0.9, 0, 0, 0.9],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    if (!message.expiresAt) {
      setTimeLeft(null);
      return;
    }

    const computeRemaining = (now: number) => {
      const curRemaining = Math.max(0, Math.ceil((message.expiresAt! - now) / 1000));
      setTimeLeft(curRemaining);
      return curRemaining;
    };

    const initial = computeRemaining(Date.now());
    if (initial <= 0) return;

    const unsubscribe = subscribeToSharedTicker(now => {
      const remaining = computeRemaining(now);
      if (remaining <= 0) {
        unsubscribe();
      }
    });

    return unsubscribe;
  }, [message.expiresAt]);

  if (message.isDeletedForEveryone) {
    return (
      <View style={[styles.container, isMe ? styles.myContainer : styles.theirContainer]}>
        <View style={styles.deletedBubble}>
          <Trash2 size={13} color={colors.textMuted} />
          <Text style={styles.deletedText}>This message was deleted</Text>
        </View>
      </View>
    );
  }

  // Call history entries (see App.tsx's logCallToChat) render as a centered
  // system-style row, not a left/right bubble — they're a record of what
  // happened, not something either party "said." isMe determines caller vs
  // receiver phrasing since only the caller ever sends this message.
  if (message.attachment?.type === 'call') {
    const { callType = 'audio', callStatus = 'completed', duration = 0 } = message.attachment;
    const missed = callStatus !== 'completed';
    const CallIcon = missed ? PhoneOff : callType === 'video' ? Video : Phone;
    const label = isMe
      ? callStatus === 'completed'
        ? `${callType === 'video' ? 'Video' : 'Voice'} call · ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`
        : `${callType === 'video' ? 'Video' : 'Voice'} call not answered`
      : callStatus === 'completed'
      ? `Incoming ${callType === 'video' ? 'video' : 'voice'} call · ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`
      : `Missed ${callType === 'video' ? 'video' : 'voice'} call`;

    return (
      <View style={styles.callLogRow}>
        <View style={[styles.callLogPill, missed && styles.callLogPillMissed]}>
          <CallIcon size={13} color={missed ? colors.danger : colors.primaryDark} />
          <Text style={[styles.callLogText, missed && styles.callLogTextMissed]}>{label}</Text>
          <Text style={styles.callLogTime}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  }

  const isAudio = message.attachment?.type === 'audio';
  const isImage = message.attachment?.type === 'image';

  return (
    <View style={[styles.container, isMe ? styles.myContainer : styles.theirContainer]}>
      {/* Floating Quick Emoji Reaction Bar (Appears on hold/long-press) */}
      {showReactions && (
        <View style={[styles.reactionsBar, isMe ? styles.reactionsBarRight : styles.reactionsBarLeft]}>
          {QUICK_EMOJIS.map(emoji => (
            <TouchableOpacity
              key={emoji}
              style={styles.reactionBtn}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch {}
                onReact?.(message.id, emoji);
                setShowReactions(false);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`React ${emoji}`}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 3-Dot Options Menu Button on X-Axis (Left side for sent messages) */}
      {isMe && !message.isDeletedForEveryone && (
        <TouchableOpacity
          style={[styles.threeDotsBtn, styles.threeDotsBtnLeft]}
          onPress={() => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch {}
            setShowOptionsMenu(true);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Message options"
        >
          <MoreHorizontal size={17} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      <Animated.View
        style={[
          styles.swipeHint,
          isMe ? styles.swipeHintLeft : styles.swipeHintRight,
          { opacity: swipeHintOpacity },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.swipeHintText}>↩</Text>
      </Animated.View>
      <Animated.View
        style={[styles.swipeContent, { transform: [{ translateX: swipeX }] }]}
        {...swipeResponder.panHandlers}
      >
      <TouchableOpacity
        activeOpacity={0.95}
        onLongPress={() => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch {}
          setShowReactions(prev => !prev);
        }}
        delayLongPress={220}
        onPress={handleBubblePress}
        accessibilityRole="button"
        accessibilityLabel={
          message.status === 'sending'
            ? 'Message waiting to send. Activate to retry now.'
            : isMe
              ? 'Your message. Tap for full time, double-tap to send a heart, long press for reactions.'
              : 'Message. Tap for full time, double-tap to send a heart, long press for reactions.'
        }
        style={[
          styles.bubble,
          isMe ? styles.myBubble : styles.theirBubble,
          isAudio && styles.audioBubble,
          message.disappearingTimer > 0 && styles.ephemeralBorder,
          message.replyToId && styles.replyBubble,
          highlight && styles.highlightedBubble,
        ]}
      >
        {/* Forwarded attribution tag */}
        {message.forwarded && (
          <Text style={[styles.forwardedTag, isMe ? styles.myForwardedTag : styles.theirForwardedTag]}>
            ↗ Forwarded
          </Text>
        )}
        {/* Reply Quote Block — always visible for replies, even when the
            original message is no longer loaded, so a reply is never
            mistaken for a plain message. Tap jumps to the original. */}
        {message.replyToId && (
          <TouchableOpacity
            style={[styles.replyQuote, isMe ? styles.myReplyQuote : styles.theirReplyQuote]}
            onPress={replyMessage && onJumpToReply ? () => onJumpToReply(replyMessage.id) : undefined}
            disabled={!replyMessage || !onJumpToReply}
            activeOpacity={0.7}
            accessibilityRole={replyMessage && onJumpToReply ? 'button' : undefined}
            accessibilityLabel={
              replyMessage
                ? `Reply. Jump to original message from ${replySenderName || 'contact'}.`
                : 'Reply. Original message unavailable.'
            }
          >
            <View style={[styles.replyQuoteBar, isMe ? styles.myReplyQuoteBar : styles.theirReplyQuoteBar]} />
            <View style={styles.replyQuoteContent}>
              {replyMessage ? (
                <>
                  <Text
                    style={[styles.replyQuoteSender, isMe ? styles.myReplyQuoteSender : styles.theirReplyQuoteSender]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {replySenderName || (replyMessage.senderId === message.senderId ? 'You' : 'Reply')}
                  </Text>
                  <Text
                    style={[styles.replyQuoteText, isMe ? styles.myReplyQuoteText : styles.theirReplyQuoteText]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {replyMessage.attachment?.type === 'image'
                      ? '📷 Photo'
                      : replyMessage.attachment?.type === 'audio'
                      ? '🎤 Voice Message'
                      : replyMessage.text}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={[styles.replyQuoteSender, isMe ? styles.myReplyQuoteSender : styles.theirReplyQuoteSender]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    ↩ Replied message
                  </Text>
                  <Text
                    style={[
                      styles.replyQuoteText,
                      isMe ? styles.myReplyQuoteText : styles.theirReplyQuoteText,
                      styles.replyQuoteMissing,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    Original message unavailable
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Ephemeral Timer Tag */}
        {message.disappearingTimer > 0 && (
          <View style={styles.ephemeralHeader}>
            <Flame size={12} color={isMe ? '#fef08a' : '#d97706'} />
            <Text style={[styles.ephemeralText, isMe && styles.myEphemeralText]}>
              {timeLeft !== null ? `${formatDisappearingTimer(timeLeft)} remaining` : `${formatDisappearingTimer(message.disappearingTimer)} timer`}
            </Text>
          </View>
        )}

        {/* Audio Voice Note */}
        {isAudio ? (
          <View style={styles.audioRow}>
            <TouchableOpacity
              style={[styles.playButton, isMe && styles.myPlayButton]}
              onPress={() => onPlayAudio && onPlayAudio(message)}
            >
              {isPlayingAudio ? (
                <Pause size={16} color={isMe ? colors.primaryDark : '#ffffff'} />
              ) : (
                <Play size={16} color={isMe ? colors.primaryDark : '#ffffff'} />
              )}
            </TouchableOpacity>

            <View style={styles.waveformContainer}>
              {(message.attachment?.waveform && message.attachment.waveform.length > 0
                ? message.attachment.waveform
                : [8, 16, 24, 12, 28, 20, 14, 26, 18, 10, 22, 14, 28, 16, 8]
              ).map((h, i) => (
                <View
                  key={i}
                  style={[
                    styles.waveBar,
                    {
                      height: Math.min(30, Math.max(6, (h / 60) * 26)),
                      backgroundColor: isMe ? 'rgba(255,255,255,0.85)' : colors.primary,
                    },
                  ]}
                />
              ))}
            </View>

            <Text style={[styles.audioDuration, isMe && styles.myAudioDuration]}>
              {message.attachment?.duration || 3}s
            </Text>

            {isPlayingAudio && onToggleSpeed && (
              <TouchableOpacity
                style={[styles.speedBtn, isMe && styles.mySpeedBtn]}
                onPress={onToggleSpeed}
              >
                <Text style={[styles.speedBtnText, isMe && styles.mySpeedBtnText]}>
                  {playbackSpeed}x
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : isImage ? (
          <TouchableOpacity
            style={styles.imageContainer}
            onPress={message.attachment?.id && onPressImage ? () => onPressImage(message.attachment!.id) : undefined}
            disabled={!message.attachment?.id || !onPressImage}
            activeOpacity={0.9}
            accessibilityRole={onPressImage ? 'button' : undefined}
            accessibilityLabel={onPressImage ? 'Open image full-screen' : undefined}
          >
            {imageResolution?.status === 'ready' ? (
              <Image source={{ uri: imageResolution.dataUri }} style={styles.image} resizeMode="cover" />
            ) : imageResolution?.status === 'error' ? (
              <View style={[styles.imagePlaceholder, styles.imageErrorPlaceholder]}>
                <ImageIcon size={22} color={colors.danger} />
                <Text style={styles.imageErrorText}>Failed to decrypt image</Text>
              </View>
            ) : (
              <View style={styles.imagePlaceholder}>
                <ActivityIndicator size="small" color={isMe ? '#ffffff' : colors.primary} />
              </View>
            )}
          </TouchableOpacity>
        ) : (
          renderSearchHighlightedText(message.text, searchQuery, [styles.messageText, isMe ? styles.myText : styles.theirText])
        )}

        {/* Bubble Footer — tap toggles the full date for precision */}
        <View style={styles.bubbleFooter}>
          <View style={styles.timeStatusRow}>
            <Text style={[styles.timeText, isMe && styles.myTimeText]}>
              {showFullTime
                ? new Date(message.timestamp).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>

            {isMe && (
              <View style={styles.statusCheck}>
                {message.status === 'read' ? (
                  <CheckCheck size={14} color="#38bdf8" />
                ) : message.status === 'sending' ? (
                  <Clock size={13} color="rgba(255,255,255,0.85)" />
                ) : message.status === 'delivered' ? (
                  <CheckCheck size={14} color="rgba(255,255,255,0.7)" />
                ) : (
                  <Check size={14} color="rgba(255,255,255,0.7)" />
                )}
              </View>
            )}
            {!isMe && message.status === 'sending' && (
              <View style={styles.statusCheck}>
                <Clock size={13} color={colors.textMuted} />
              </View>
            )}
          </View>
        </View>

        {/* Reaction Badge */}
        {(message.reaction || (message.reactions && Object.keys(message.reactions).length > 0)) && (
          <View style={[styles.reactionBadge, isMe ? styles.reactionBadgeRight : styles.reactionBadgeLeft]}>
            <Text style={styles.reactionBadgeText}>
              {message.reaction || Object.keys(message.reactions || {})[0]}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      </Animated.View>

      {/* 3-Dot Options Menu Button on X-Axis (Right side for received messages) */}
      {!isMe && !message.isDeletedForEveryone && (
        <TouchableOpacity
          style={[styles.threeDotsBtn, styles.threeDotsBtnRight]}
          onPress={() => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch {}
            setShowOptionsMenu(true);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Message options"
        >
          <MoreHorizontal size={17} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Message Options Action Sheet Modal */}
      <MessageOptionsMenuModal
        visible={showOptionsMenu}
        message={message}
        isMe={isMe}
        onClose={() => setShowOptionsMenu(false)}
        onReply={msg => onReply?.(msg)}
        onCopy={message.text ? copyText : undefined}
        onForward={onForward ? msg => onForward(msg) : undefined}
        onInspectCiphertext={onInspectCiphertext ? msg => onInspectCiphertext(msg) : undefined}
        onDeleteForMe={onDeleteForMe ? id => onDeleteForMe(id) : undefined}
        onDeleteForEveryone={onDeleteForEveryone ? id => onDeleteForEveryone(id) : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 12,
    flexDirection: 'row',
  },
  myContainer: {
    justifyContent: 'flex-end',
  },
  theirContainer: {
    justifyContent: 'flex-start',
  },
  threeDotsBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  threeDotsBtnLeft: {
    marginRight: 6,
  },
  threeDotsBtnRight: {
    marginLeft: 6,
  },
  bubble: {
    width: '100%',
    minWidth: 76,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...shadows.sm,
  },
  // Replies get a wider floor so the quote block never collapses; the width
  // lives on the bubble (not the quote) so children can't poke outside it.
  replyBubble: {
    minWidth: 140,
  },
  swipeContent: {
    flexShrink: 1,
    maxWidth: '82%',
  },
  myBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderColor: colors.border,
    borderWidth: 1,
  },
  ephemeralBorder: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#f59e0b',
  },
  highlightedBubble: {
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  searchHighlight: {
    backgroundColor: '#fef08a',
    color: '#92400e',
    fontWeight: '700',
  },
  swipeHint: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1,
  },
  swipeHintLeft: {
    left: 4,
  },
  swipeHintRight: {
    right: 4,
  },
  swipeHintText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  ephemeralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  ephemeralText: {
    color: '#d97706',
    fontSize: 10,
    fontWeight: '700',
  },
  myEphemeralText: {
    color: '#fef08a',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  myText: {
    color: '#ffffff',
  },
  theirText: {
    color: colors.textPrimary,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  timeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  myTimeText: {
    color: 'rgba(255,255,255,0.85)',
  },
  statusCheck: {
    marginLeft: 2,
  },
  deletedBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  deletedText: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  callLogRow: {
    alignItems: 'center',
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  callLogPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  callLogPillMissed: {
    backgroundColor: colors.dangerLight,
    borderColor: '#fca5a5',
  },
  callLogText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  callLogTextMissed: {
    color: colors.dangerText,
  },
  callLogTime: {
    color: colors.textMuted,
    fontSize: 10,
    marginLeft: 2,
  },
  imageContainer: {
    marginBottom: 2,
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },
  imagePlaceholder: {
    width: 220,
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageErrorPlaceholder: {
    backgroundColor: colors.dangerLight,
    gap: 6,
  },
  imageErrorText: {
    color: colors.dangerText,
    fontSize: 12,
    fontWeight: '600',
  },
  audioBubble: {
    minWidth: 235,
    maxWidth: 270,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 40,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  myPlayButton: {
    backgroundColor: '#ffffff',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    flex: 1,
    height: 32,
    marginHorizontal: 8,
    justifyContent: 'center',
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  audioDuration: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
    minWidth: 26,
    textAlign: 'right',
  },
  myAudioDuration: {
    color: 'rgba(255,255,255,0.95)',
  },
  speedBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    marginLeft: 4,
  },
  mySpeedBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  speedBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  mySpeedBtnText: {
    color: '#ffffff',
  },
  reactionsBar: {
    position: 'absolute',
    top: -38,
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxWidth: '92%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 100,
    ...shadows.md,
    elevation: 8,
  },
  reactionsBarRight: {
    right: 16,
  },
  reactionsBarLeft: {
    left: 16,
  },
  reactionBtn: {
    padding: 2,
  },
  reactionEmoji: {
    fontSize: 18,
  },
  reactionBadge: {
    position: 'absolute',
    bottom: -10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  reactionBadgeRight: {
    right: 12,
  },
  reactionBadgeLeft: {
    left: 12,
  },
  reactionBadgeText: {
    fontSize: 12,
  },
  replyQuote: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 8,
    gap: 8,
    overflow: 'hidden',
  },
  myReplyQuote: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  theirReplyQuote: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  replyQuoteBar: {
    width: 3.5,
    borderRadius: 2,
  },
  myReplyQuoteBar: {
    backgroundColor: '#ffffff',
  },
  theirReplyQuoteBar: {
    backgroundColor: colors.primary,
  },
  replyQuoteContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  replyQuoteSender: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: -0.1,
  },
  myReplyQuoteSender: {
    color: '#ffffff',
  },
  theirReplyQuoteSender: {
    color: colors.primaryDark,
  },
  replyQuoteText: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  forwardedTag: {
    fontSize: 10.5,
    fontStyle: 'italic',
    fontWeight: '600',
    marginBottom: 4,
  },
  myForwardedTag: {
    color: 'rgba(255,255,255,0.8)',
  },
  theirForwardedTag: {
    color: colors.textMuted,
  },
  replyQuoteMissing: {
    fontStyle: 'italic',
    opacity: 0.75,
  },
  myReplyQuoteText: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  theirReplyQuoteText: {
    color: colors.textSecondary,
  },
});
