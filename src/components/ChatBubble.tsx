import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { ShieldCheck, Flame, Check, CheckCheck, Play, Pause, Trash2, ImageIcon, Phone, PhoneOff, Video } from './Icons';
import { Message } from '../types';
import { colors, shadows } from '../theme';
import { formatDisappearingTimer } from '../utils/timerUtils';

type ImageResolution = { status: 'loading' } | { status: 'ready'; dataUri: string } | { status: 'error' };

interface Props {
  message: Message;
  isMe: boolean;
  onInspectCiphertext?: (msg: Message) => void;
  onDeleteForEveryone?: (msgId: string) => void;
  onPlayAudio?: (msg: Message) => void;
  isPlayingAudio?: boolean;
  playbackSpeed?: number;
  onToggleSpeed?: () => void;
  onReact?: (msgId: string, emoji: string) => void;
  replyMessage?: Message;
  onReply?: (msg: Message) => void;
  imageResolution?: ImageResolution;
}
// Shared single interval across all ChatBubble instances to eliminate timer proliferation
type TickerCallback = (now: number) => void;
const tickerListeners = new Set<TickerCallback>();
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
  onDeleteForEveryone,
  onPlayAudio,
  isPlayingAudio = false,
  playbackSpeed = 1,
  onToggleSpeed,
  onReact,
  replyMessage,
  onReply,
  imageResolution,
}: Props) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🔒', '😂', '👀'];

  useEffect(() => {
    if (!message.expiresAt) return;

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
      {/* Floating Quick Reaction Bar */}
      {showReactions && (
        <View style={[styles.reactionsBar, isMe ? styles.reactionsBarRight : styles.reactionsBarLeft]}>
          {QUICK_EMOJIS.map(emoji => (
            <TouchableOpacity
              key={emoji}
              style={styles.reactionBtn}
              onPress={() => {
                onReact?.(message.id, emoji);
                setShowReactions(false);
              }}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          {onReply && (
            <TouchableOpacity
              style={styles.reactionBtn}
              onPress={() => {
                onReply(message);
                setShowReactions(false);
              }}
            >
              <Text style={styles.reactionEmoji}>↩️</Text>
            </TouchableOpacity>
          )}
          {onInspectCiphertext && (
            <TouchableOpacity
              style={styles.reactionBtn}
              onPress={() => {
                onInspectCiphertext(message);
                setShowReactions(false);
              }}
            >
              <Text style={styles.reactionEmoji}>🛡️</Text>
            </TouchableOpacity>
          )}
          {isMe && onDeleteForEveryone && (
            <TouchableOpacity
              style={styles.reactionBtn}
              onPress={() => {
                onDeleteForEveryone(message.id);
                setShowReactions(false);
              }}
            >
              <Text style={styles.reactionEmoji}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity
        activeOpacity={0.95}
        onLongPress={() => setShowReactions(prev => !prev)}
        delayLongPress={250}
        style={[
          styles.bubble,
          isMe ? styles.myBubble : styles.theirBubble,
          isAudio && styles.audioBubble,
          message.disappearingTimer > 0 && styles.ephemeralBorder,
        ]}
      >
        {/* Reply Quote Block */}
        {replyMessage && (
          <View style={[styles.replyQuote, isMe ? styles.myReplyQuote : styles.theirReplyQuote]}>
            <View style={[styles.replyQuoteBar, isMe ? styles.myReplyQuoteBar : styles.theirReplyQuoteBar]} />
            <View style={styles.replyQuoteContent}>
              <Text style={[styles.replyQuoteSender, isMe ? styles.myReplyQuoteSender : styles.theirReplyQuoteSender]}>
                {replyMessage.senderId === message.senderId ? (isMe ? 'You' : 'Original message') : 'Reply'}
              </Text>
              <Text style={[styles.replyQuoteText, isMe ? styles.myReplyQuoteText : styles.theirReplyQuoteText]} numberOfLines={1}>
                {replyMessage.attachment?.type === 'image'
                  ? '📷 Photo'
                  : replyMessage.attachment?.type === 'audio'
                  ? '🎤 Voice Message'
                  : replyMessage.text}
              </Text>
            </View>
          </View>
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
          <View style={styles.imageContainer}>
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
          </View>
        ) : (
          <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>
            {message.text}
          </Text>
        )}

        {/* Bubble Footer */}
        <View style={styles.bubbleFooter}>
          <View style={styles.timeStatusRow}>
            <Text style={[styles.timeText, isMe && styles.myTimeText]}>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>

            {isMe && (
              <View style={styles.statusCheck}>
                {message.status === 'read' ? (
                  <CheckCheck size={14} color="#38bdf8" />
                ) : message.status === 'delivered' ? (
                  <CheckCheck size={14} color="rgba(255,255,255,0.7)" />
                ) : (
                  <Check size={14} color="rgba(255,255,255,0.7)" />
                )}
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
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...shadows.sm,
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
    borderStyle: 'dashed',
    borderColor: '#f59e0b',
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
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 100,
    ...shadows.md,
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
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  myReplyQuote: {
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  theirReplyQuote: {
    backgroundColor: colors.surfaceElevated,
  },
  replyQuoteBar: {
    width: 3,
    borderRadius: 2,
    marginRight: 8,
  },
  myReplyQuoteBar: {
    backgroundColor: '#ffffff',
  },
  theirReplyQuoteBar: {
    backgroundColor: colors.primary,
  },
  replyQuoteContent: {
    flex: 1,
  },
  replyQuoteSender: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  myReplyQuoteSender: {
    color: '#ffffff',
  },
  theirReplyQuoteSender: {
    color: colors.primaryDark,
  },
  replyQuoteText: {
    fontSize: 12,
  },
  myReplyQuoteText: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  theirReplyQuoteText: {
    color: colors.textSecondary,
  },
});
