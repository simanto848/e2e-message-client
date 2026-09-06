import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Mic, Trash2, Send, Lock } from './Icons';
import { Attachment } from '../types';
import { colors, shadows } from '../theme';
import { encryptMessage } from '../utils/crypto';
import { startVoiceRecording, stopVoiceRecording, discardVoiceRecording } from '../utils/audioRecorder';
import { api } from '../services/api';

// Matches the server's MAX_ATTACHMENT_BYTES (server/src/routes/media.routes.ts).
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const BAR_COUNT = 14;

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
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // 14 animated equalizer bars for rich visual rhythm
  const eqBars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(6))
  ).current;

  const recordingRef = useRef<Audio.Recording | null>(null);
  const cancelledRef = useRef(false);
  const handleSendRef = useRef<() => void>(() => {});

  // Recording lifecycle — ONLY runs when this instance is the active
  // recorder. The idle mic-button instance (isRecording=false) must never
  // request mic permission or start a background recording on mount.
  useEffect(() => {
    if (!isRecording) return;
    cancelledRef.current = false;
    let interval: NodeJS.Timeout | undefined;

    // Trigger entrance haptics & animation
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

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

    // Pulsing live recording halo
    const loopAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.45, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loopAnim.start();

    // Harmonic staggered heights & durations for 14 waveform bars
    const heights = [10, 22, 14, 26, 18, 28, 16, 24, 20, 28, 14, 22, 12, 18];
    const durations = [380, 480, 340, 520, 420, 560, 390, 470, 510, 440, 360, 500, 410, 460];

    const eqAnims = eqBars.map((val, i) => {
      const maxH = heights[i % heights.length];
      const dur = durations[i % durations.length];
      return Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: maxH, duration: dur, useNativeDriver: false }),
          Animated.timing(val, { toValue: 6, duration: dur, useNativeDriver: false }),
        ])
      );
    });
    eqAnims.forEach(anim => anim.start());

    return () => {
      cancelledRef.current = true;
      loopAnim.stop();
      eqAnims.forEach(anim => anim.stop());
      if (interval) clearInterval(interval);
      if (recordingRef.current) {
        discardVoiceRecording(recordingRef.current);
        recordingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const handleCancel = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const duration = Math.max(1, seconds);
    setIsUploading(true);

    let uri: string | null = null;
    try {
      uri = await stopVoiceRecording(recording);
      if (!uri) throw new Error('Recording produced no file');

      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && (info.size ?? 0) > MAX_ATTACHMENT_BYTES) {
        Alert.alert('Voice note too long', 'This recording is too large to send. Try a shorter message.');
        onStopRecord();
        return;
      }

      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const encryptedPayload = encryptMessage(base64Data, mySecretKey, receiverPublicKey, myPublicKey);

      const result = await api.uploadMedia({
        name: `Voice Note (${duration}s)`,
        type: 'audio',
        size: info.exists ? (info.size ?? base64Data.length) : base64Data.length,
        mimeType: 'audio/m4a',
        duration,
        waveform: [10, 25, 45, 20, 60, 35, 15, 50, 40, 20, 70, 30, 10],
        receiverId,
        encryptedPayload,
      });

      if (!result.success || !result.attachment) {
        throw new Error(result.error || 'Upload failed');
      }

      onSendVoiceNote(result.attachment);
      onStopRecord();
    } catch (err) {
      console.warn('[VoiceRecorder] Send failed:', err);
      Alert.alert('Could not send voice note', 'Please check your connection and try again.');
      // Keep the recorder mounted on failure so the user can retry;
      // only exit recording mode on explicit cancel or success.
    } finally {
      if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      if (!cancelledRef.current) setIsUploading(false);
    }
  };
  handleSendRef.current = handleSend;

  if (!isRecording) {
    return (
      <TouchableOpacity
        style={styles.micButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onStartRecord();
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Record voice message"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Mic size={20} color="#ffffff" />
      </TouchableOpacity>
    );
  }

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem.toString().padStart(2, '0')}`;
  };

  const isNearingLimit = seconds >= 270; // Last 30s of 5m cap

  return (
    <Animated.View
      style={[
        styles.recordingContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Discard / Delete Button */}
      <TouchableOpacity
        style={[styles.cancelButton, isUploading && styles.cancelButtonDisabled]}
        onPress={handleCancel}
        disabled={isUploading}
        activeOpacity={0.65}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Discard voice recording"
      >
        <Trash2 size={18} color="#ef4444" />
      </TouchableOpacity>

      {/* Center Live Recording Track */}
      <View style={styles.centerTrack}>
        {/* Pulsing Live Beacon & Time */}
        <View style={styles.timerGroup}>
          <View style={styles.pulseWrapper}>
            <Animated.View
              style={[
                styles.pulseHalo,
                {
                  transform: [{ scale: pulseAnim }],
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 1.45],
                    outputRange: [0.55, 0.08],
                  }),
                },
              ]}
            />
            <View style={[styles.pulseDot, isNearingLimit && styles.pulseDotWarning]} />
          </View>
          <Text style={[styles.recordingTimer, isNearingLimit && styles.recordingTimerWarning]}>
            {formatTime(seconds)}
          </Text>
        </View>

        {/* Dynamic Waveform Visualizer */}
        <View style={styles.eqContainer}>
          {eqBars.map((barAnim, idx) => (
            <Animated.View
              key={idx}
              style={[
                styles.eqBar,
                {
                  height: barAnim,
                  backgroundColor: isNearingLimit ? '#f59e0b' : colors.primary,
                },
              ]}
            />
          ))}
        </View>

        {/* Security / Encryption Pill Badge */}
        <View style={[styles.badgePill, isUploading && styles.uploadingBadgePill]}>
          <Lock
            size={10}
            color={isUploading ? '#b45309' : '#047857'}
            style={{ marginRight: 3.5 }}
          />
          <Text style={[styles.badgeText, isUploading && styles.uploadingBadgeText]}>
            {isUploading ? 'ENCRYPTING' : 'E2EE'}
          </Text>
        </View>
      </View>

      {/* Send Action Button */}
      <TouchableOpacity
        style={[styles.sendVoiceButton, isUploading && styles.sendVoiceButtonDisabled]}
        onPress={handleSend}
        disabled={isUploading}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Send voice note"
      >
        {isUploading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Send size={17} color="#ffffff" />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  recordingContainer: {
    width: '100%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 26,
    paddingHorizontal: 7,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    ...shadows.sm,
  },
  cancelButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonDisabled: {
    opacity: 0.4,
  },
  centerTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  timerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 54,
  },
  pulseWrapper: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseHalo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(239, 68, 68, 0.45)',
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ef4444',
  },
  pulseDotWarning: {
    backgroundColor: '#f59e0b',
  },
  recordingTimer: {
    color: '#0f172a',
    fontSize: 13.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  recordingTimerWarning: {
    color: '#b45309',
  },
  eqContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
    height: 32,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  eqBar: {
    width: 2.5,
    borderRadius: 1.5,
    backgroundColor: colors.primary,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  uploadingBadgePill: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
  },
  badgeText: {
    color: '#047857',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  uploadingBadgeText: {
    color: '#b45309',
  },
  sendVoiceButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  sendVoiceButtonDisabled: {
    backgroundColor: '#6ee7b7',
  },
});

