import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { PhoneOff, ShieldCheck, MicOff, VideoOff, VolumeX, SwitchCamera } from './Icons';
import { CallState } from '../types';
import type { MediaStream } from '../utils/webrtcAdapter';
import { colors, shadows } from '../theme';

/**
 * Web stub for CallModal — mirrors the Props of CallModal.tsx exactly so
 * App.tsx can pass the same props on every platform without branching.
 * Voice/video is unsupported on web (see webrtcCall.web.ts): all call
 * controls render disabled with an "unsupported on web" tooltip.
 */

// Same Props shape as src/components/CallModal.tsx (showVerificationWords
// included for parity; ignored on web).
export interface Props {
  callState: CallState;
  showVerificationWords?: boolean;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
  onToggleCameraFlip: () => void;
  onAcceptIncoming?: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

const WEB_UNSUPPORTED_HINT = 'Calling is not supported on web — use the Android or iOS app.';

export function CallModal({ callState, onHangup }: Props) {
  if (!callState.active) return null;

  return (
    <Modal visible={callState.active} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <ShieldCheck size={36} color={colors.primary} />
        <Text style={styles.title}>Calling isn&apos;t available here</Text>
        <Text style={styles.subtitle}>
          Voice and video calls only work in the Android or iOS app, not this web preview.
        </Text>
        {/* Disabled parity controls — same affordances as native, visibly inert. */}
        <View style={styles.disabledRow} accessibilityLabel={WEB_UNSUPPORTED_HINT}>
          <View style={[styles.disabledBtn]} accessibilityHint={WEB_UNSUPPORTED_HINT} accessibilityLabel="Mute (unsupported on web)">
            <MicOff size={18} color={colors.textMuted} />
          </View>
          <View style={[styles.disabledBtn]} accessibilityHint={WEB_UNSUPPORTED_HINT} accessibilityLabel="Video (unsupported on web)">
            <VideoOff size={18} color={colors.textMuted} />
          </View>
          <View style={[styles.disabledBtn]} accessibilityHint={WEB_UNSUPPORTED_HINT} accessibilityLabel="Speaker (unsupported on web)">
            <VolumeX size={18} color={colors.textMuted} />
          </View>
          <View style={[styles.disabledBtn]} accessibilityHint={WEB_UNSUPPORTED_HINT} accessibilityLabel="Flip camera (unsupported on web)">
            <SwitchCamera size={18} color={colors.textMuted} />
          </View>
        </View>
        <Text style={styles.hint} accessibilityLabel={WEB_UNSUPPORTED_HINT}>
          {WEB_UNSUPPORTED_HINT}
        </Text>
        <TouchableOpacity style={styles.hangupButton} onPress={onHangup} accessibilityRole="button" accessibilityLabel="Close call preview">
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
  disabledRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    opacity: 0.6,
  },
  disabledBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    maxWidth: 300,
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
