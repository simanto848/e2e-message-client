import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { ShieldCheck, Flame, Check, CheckCheck, Play, Pause, Trash2, Key, ImageIcon } from './Icons';
import { Message } from '../types';
import { colors, shadows } from '../theme';

type ImageResolution = { status: 'loading' } | { status: 'ready'; dataUri: string } | { status: 'error' };

interface Props {
  message: Message;
  isMe: boolean;
  onInspectCiphertext: (msg: Message) => void;
  onDeleteForEveryone?: (msgId: string) => void;
  onPlayAudio?: (msg: Message) => void;
  isPlayingAudio?: boolean;
  imageResolution?: ImageResolution;
}

export function ChatBubble({
  message,
  isMe,
  onInspectCiphertext,
  onDeleteForEveryone,
  onPlayAudio,
  isPlayingAudio = false,
  imageResolution,
}: Props) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!message.expiresAt) return;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((message.expiresAt! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
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

  const isAudio = message.attachment?.type === 'audio';
  const isImage = message.attachment?.type === 'image';

  return (
    <View style={[styles.container, isMe ? styles.myContainer : styles.theirContainer]}>
      <View
        style={[
          styles.bubble,
          isMe ? styles.myBubble : styles.theirBubble,
          message.disappearingTimer > 0 && styles.ephemeralBorder,
        ]}
      >
        {/* Ephemeral Timer Tag */}
        {message.disappearingTimer > 0 && (
          <View style={styles.ephemeralHeader}>
            <Flame size={12} color={isMe ? '#fef08a' : '#d97706'} />
            <Text style={[styles.ephemeralText, isMe && styles.myEphemeralText]}>
              {timeLeft !== null ? `${timeLeft}s remaining` : `${message.disappearingTimer}s timer`}
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
          {/* Ciphertext inspector trigger */}
          <TouchableOpacity
            style={[styles.cipherTag, isMe && styles.myCipherTag]}
            onPress={() => onInspectCiphertext(message)}
          >
            <Key size={10} color={isMe ? '#d1fae5' : '#059669'} />
            <Text style={[styles.cipherTagText, isMe && styles.myCipherTagText]}>E2EE</Text>
          </TouchableOpacity>

          <View style={styles.timeStatusRow}>
            <Text style={[styles.timeText, isMe && styles.myTimeText]}>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>

            {isMe && (
              <View style={styles.statusCheck}>
                {message.status === 'read' ? (
                  <CheckCheck size={14} color="#ffffff" />
                ) : message.status === 'delivered' ? (
                  <CheckCheck size={14} color="rgba(255,255,255,0.7)" />
                ) : (
                  <Check size={14} color="rgba(255,255,255,0.7)" />
                )}
              </View>
            )}
          </View>
        </View>
      </View>
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
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    gap: 12,
  },
  cipherTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  myCipherTag: {
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  cipherTagText: {
    color: '#065f46',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  myCipherTagText: {
    color: '#d1fae5',
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
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myPlayButton: {
    backgroundColor: '#ffffff',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
    height: 30,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  audioDuration: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  myAudioDuration: {
    color: 'rgba(255,255,255,0.9)',
  },
});
