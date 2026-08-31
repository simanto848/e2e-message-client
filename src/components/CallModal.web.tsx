import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { PhoneOff, ShieldCheck } from './Icons';
import { CallState } from '../types';
import type { MediaStream } from '../utils/webrtcAdapter';
import { colors, shadows } from '../theme';

interface Props {
  callState: CallState;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
  onToggleCameraFlip: () => void;
  onAcceptIncoming?: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

export function CallModal({ callState, onHangup }: Props) {
  if (!callState.active) return null;

  return (
    <Modal visible={callState.active} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <ShieldCheck size={36} color={colors.primary} />
        <Text style={styles.title}>Calling isn't available here</Text>
        <Text style={styles.subtitle}>
          Voice and video calls only work in the Android or iOS app, not this web preview.
        </Text>
        <TouchableOpacity style={styles.hangupButton} onPress={onHangup}>
          <PhoneOff size={26} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  hangupButton: {
    marginTop: 16,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
});
