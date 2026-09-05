import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Alert, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Mic, Trash2, Send, Radio } from './Icons';
import { Attachment } from '../types';
import { colors, shadows } from '../theme';
import { encryptMessage } from '../utils/crypto';
import { startVoiceRecording, stopVoiceRecording, discardVoiceRecording } from '../utils/audioRecorder';
import { api } from '../services/api';

// Matches the server's MAX_ATTACHMENT_BYTES (server/src/routes/media.routes.ts).
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

interface Props {
  isRecording: boolean;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onCancelRecord: () => void;
  onSendVoiceNote: (attachment: Attachment) => void;
  mySecretKey: string;
  myPublicKey: string;
  receiverPublicKey: string;
  receiverId: string;
}

export function VoiceRecorder({
  isRecording,
  onStartRecord,
  onStopRecord,
  onCancelRecord,
  onSendVoiceNote,
  mySecretKey,
  myPublicKey,
  receiverPublicKey,
  receiverId,
}: Props) {
  const [seconds, setSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const eqBars = useRef([
    new Animated.Value(6),
    new Animated.Value(18),
    new Animated.Value(10),
    new Animated.Value(22),
    new Animated.Value(14),
  ]).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const cancelledRef = useRef(false);

  // This component only ever mounts while already "recording" (see
  // ChatScreen's isRecording ? <VoiceRecorder .../> : ... branch — the mic
  // button lives in the `false` branch and swaps to a fresh mount of this
  // component on press), so starting the real microphone capture on mount
  // is the right lifecycle hook.
  const handleSendRef = useRef<() => void>(() => {});

  useEffect(() => {
    cancelledRef.current = false;
    let interval: NodeJS.Timeout;

    startVoiceRecording()
      .then(recording => {
        if (cancelledRef.current) {
          discardVoiceRecording(recording);
          return;
        }
        recordingRef.current = recording;
        setSeconds(0);
        let currentSeconds = 0;
        interval = setInterval(() => {
          currentSeconds += 1;
          setSeconds(currentSeconds);
          if (currentSeconds >= 300) {
            clearInterval(interval);
            handleSendRef.current();
          }
        }, 1000);
      })
      .catch(err => {
        console.warn('[VoiceRecorder] Failed to start recording:', err);
        Alert.alert('Microphone unavailable', 'Could not start recording. Check microphone permissions in Settings.');
        onCancelRecord();
      });

    const loopAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loopAnim.start();

    const eqAnims = eqBars.map((val, i) => {
      const minH = 6;
      const maxH = [18, 24, 16, 22, 14][i];
      const dur = [350, 480, 390, 520, 340][i];
      return Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: maxH, duration: dur, useNativeDriver: false }),
          Animated.timing(val, { toValue: minH, duration: dur, useNativeDriver: false }),
        ])
      );
    });
    eqAnims.forEach(anim => anim.start());

    return () => {
      cancelledRef.current = true;
      loopAnim.stop();
      eqAnims.forEach(anim => anim.stop());
      if (interval) clearInterval(interval);
      // If this unmounts without an explicit send (e.g. the screen changes
      // mid-recording), stop and discard rather than leaking an open
      // recording session.
      if (recordingRef.current) {
        discardVoiceRecording(recordingRef.current);
        recordingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = async () => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (recording) {
      const uri = await stopVoiceRecording(recording).catch(() => null);
      if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
    onCancelRecord();
  };

  const handleSend = async () => {
    const recording = recordingRef.current;
    if (!recording || isUploading) return;
    recordingRef.current = null;
    onStopRecord();

    const duration = Math.max(1, seconds);
    setIsUploading(true);

    let uri: string | null = null;
    try {
      uri = await stopVoiceRecording(recording);
      if (!uri) throw new Error('Recording produced no file');

      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && info.size > MAX_ATTACHMENT_BYTES) {
        Alert.alert('Voice note too long', 'This recording is too large to send. Try a shorter message.');
        return;
      }

      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Same E2E crypto used for text messages — the file's raw bytes,
      // base64-encoded, are just the "plaintext" being encrypted.
      const encryptedPayload = encryptMessage(base64Data, mySecretKey, receiverPublicKey, myPublicKey);

      const result = await api.uploadMedia({
        name: `Voice Note (${duration}s)`,
        type: 'audio',
        size: info.exists ? info.size : base64Data.length,
        mimeType: 'audio/m4a',
        duration,
        // Real amplitude-based waveform extraction is a larger feature —
        // keep the synthetic bars for the visual for now.
        waveform: [10, 25, 45, 20, 60, 35, 15, 50, 40, 20, 70, 30, 10],
        receiverId,
        encryptedPayload,
      });

      if (!result.success || !result.attachment) {
        throw new Error(result.error || 'Upload failed');
      }

      onSendVoiceNote(result.attachment);
    } catch (err) {
      console.warn('[VoiceRecorder] Send failed:', err);
      Alert.alert('Could not send voice note', 'Please check your connection and try again.');
    } finally {
      if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      setIsUploading(false);
    }
  };
  handleSendRef.current = handleSend;

  if (!isRecording) {
    return (
      <TouchableOpacity style={styles.micButton} onPress={onStartRecord}>
        <Mic size={20} color={colors.primaryDark} />
      </TouchableOpacity>
    );
  }

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.recordingContainer}>
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={handleCancel}
        disabled={isUploading}
        activeOpacity={0.7}
      >
        <Trash2 size={18} color="#ef4444" />
      </TouchableOpacity>

      <View style={styles.recordStatus}>
        {/* Pulsing live indicator */}
        <View style={styles.pulseWrapper}>
          <Animated.View style={[styles.pulseHalo, { transform: [{ scale: pulseAnim }] }]} />
          <View style={styles.pulseDot} />
        </View>

        {/* Digital Timer */}
        <Text style={styles.recordingTimer}>{formatTime(seconds)}</Text>

        {/* Dynamic Equalizer Bars */}
        <View style={styles.eqContainer}>
          {eqBars.map((barAnim, idx) => (
            <Animated.View
              key={idx}
              style={[
                styles.eqBar,
                { height: barAnim },
              ]}
            />
          ))}
        </View>

        {/* Status Badge */}
        <View style={[styles.badgePill, isUploading && styles.uploadingBadgePill]}>
          <Text style={[styles.enclaveBadge, isUploading && styles.uploadingBadgeText]}>
            {isUploading ? 'ENCRYPTING…' : 'REC'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.sendVoiceButton}
        onPress={handleSend}
        disabled={isUploading}
        activeOpacity={0.85}
      >
        {isUploading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Send size={18} color="#ffffff" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingContainer: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...shadows.sm,
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: 1,
    paddingHorizontal: 8,
  },
  pulseWrapper: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseHalo: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  recordingTimer: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 34,
  },
  eqContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 26,
    paddingHorizontal: 4,
  },
  eqBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: colors.primary,
  },
  badgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.primaryLight,
  },
  uploadingBadgePill: {
    backgroundColor: '#fef3c7',
  },
  enclaveBadge: {
    color: colors.primaryDark,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  uploadingBadgeText: {
    color: '#b45309',
  },
  sendVoiceButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
});
