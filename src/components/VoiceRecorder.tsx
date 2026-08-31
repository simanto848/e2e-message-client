import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Mic, Trash2, Send, Radio } from './Icons';
import { Attachment } from '../types';
import { colors, shadows } from '../theme';

interface Props {
  isRecording: boolean;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onCancelRecord: () => void;
  onSendVoiceNote: (attachment: Attachment) => void;
}

export function VoiceRecorder({
  isRecording,
  onStartRecord,
  onStopRecord,
  onCancelRecord,
  onSendVoiceNote,
}: Props) {
  const [seconds, setSeconds] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      setSeconds(0);
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      setSeconds(0);
      pulseAnim.setValue(1);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  const handleSend = () => {
    onStopRecord();
    const duration = Math.max(1, seconds);
    const voiceNote: Attachment = {
      id: `audio_${Date.now()}`,
      name: `Voice Note (${duration}s)`,
      type: 'audio',
      size: duration * 16000,
      url: '',
      encrypted: true,
      encryptedPayload: {
        iv: `iv_${Date.now().toString(16)}`,
        ciphertext: `VOICE_BLOB_ENC_${Date.now()}`,
        authTag: `tag_${Date.now().toString(16)}`,
        algorithm: 'AES-256-GCM',
        senderPublicKey: 'EPHEMERAL_ECDH_P256',
        keyFingerprint: 'VN_KEY_E2EE',
      },
      duration,
      waveform: [10, 25, 45, 20, 60, 35, 15, 50, 40, 20, 70, 30, 10],
      mimeType: 'audio/m4a',
    };
    onSendVoiceNote(voiceNote);
  };

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
      <TouchableOpacity style={styles.cancelButton} onPress={onCancelRecord}>
        <Trash2 size={18} color={colors.danger} />
      </TouchableOpacity>

      <View style={styles.recordStatus}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Radio size={14} color={colors.danger} />
        </Animated.View>
        <Text style={styles.recordingTimer}>{formatTime(seconds)}</Text>
        <Text style={styles.enclaveBadge}>RECORDING</Text>
      </View>

      <TouchableOpacity style={styles.sendVoiceButton} onPress={handleSend}>
        <Send size={18} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  micButton: {
    padding: 10,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  cancelButton: {
    padding: 8,
    backgroundColor: colors.dangerLight,
    borderRadius: 16,
  },
  recordStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingTimer: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  enclaveBadge: {
    color: colors.primaryDark,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sendVoiceButton: {
    padding: 8,
    backgroundColor: colors.primary,
    borderRadius: 16,
  },
});
