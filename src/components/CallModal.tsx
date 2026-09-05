import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  Dimensions,
  Animated,
} from 'react-native';
import { RTCView, MediaStream } from '../utils/webrtcAdapter';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  SwitchCamera,
  Radio,
  Lock,
  Camera,
  User,
} from './Icons';
import { CallState } from '../types';
import { colors, shadows } from '../theme';

interface Props {
  callState: CallState;
  // Whether to show the SAS "verification words" panel — a real security
  // feature (comparing these words out loud with your contact detects a
  // man-in-the-middle on the call), but some people find it cluttering, so
  // it's a Settings toggle (App.tsx's callVerificationEnabled). Defaults to
  // shown if omitted.
  showVerificationWords?: boolean;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
  onToggleCameraFlip: () => void;
  onAcceptIncoming?: () => void;
  // Real WebRTC media streams (see webrtcCall.ts). localStream is our own
  // camera/mic capture; remoteStream is the peer's, populated once the
  // RTCPeerConnection's 'track' event fires after the call connects. Both
  // are null until then (e.g. during ringing, or for audio-only calls where
  // there's no video track).
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

const { width, height } = Dimensions.get('window');

export function CallModal({
  callState,
  showVerificationWords = true,
  onHangup,
  onToggleMute,
  onToggleVideo,
  onToggleSpeaker,
  onToggleCameraFlip,
  onAcceptIncoming,
  localStream,
  remoteStream,
}: Props) {
  const [waveBars, setWaveBars] = useState([12, 24, 16, 32, 20, 28, 14]);
  const ringPulseAnim = useRef(new Animated.Value(1)).current;

  // Pulsing avatar ring while the call is ringing (either direction) —
  // gives a clear "something is happening" signal before the peer answers.
  useEffect(() => {
    if (!callState.active || callState.status !== 'ringing') {
      ringPulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(ringPulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [callState.active, callState.status]);

  // Audio waveform animation loop
  useEffect(() => {
    if (!callState.active || callState.status !== 'connected' || callState.isMuted) return;
    const interval = setInterval(() => {
      setWaveBars([
        Math.floor(Math.random() * 24) + 8,
        Math.floor(Math.random() * 32) + 12,
        Math.floor(Math.random() * 20) + 10,
        Math.floor(Math.random() * 36) + 14,
        Math.floor(Math.random() * 28) + 10,
        Math.floor(Math.random() * 34) + 12,
        Math.floor(Math.random() * 22) + 8,
      ]);
    }, 200);
    return () => clearInterval(interval);
  }, [callState.active, callState.status, callState.isMuted]);

  if (!callState.active) return null;

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const remote = callState.remoteUser;
  const isVideo = callState.type === 'video';
  const isIncomingRinging = callState.isIncoming && callState.status === 'ringing';

  return (
    <Modal visible={callState.active} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Fullscreen Video View for Video Calls */}
        {isVideo && !callState.isVideoOff && (
          <View style={styles.videoBackground}>
            {/* Real remote peer video, streamed over the encrypted WebRTC/SRTP
                connection (webrtcCall.ts). Falls back to a blurred avatar
                until the peer's track arrives (e.g. while still connecting). */}
            {remoteStream && RTCView ? (
              <RTCView
                streamURL={typeof remoteStream.toURL === 'function' ? remoteStream.toURL() : remoteStream}
                style={styles.fullCamera}
                objectFit="cover"
              />
            ) : remote?.avatar ? (
              <Image
                source={{ uri: remote.avatar }}
                style={styles.remoteVideoFeed}
                blurRadius={2}
              />
            ) : (
              <View style={[styles.remoteVideoFeed, styles.avatarPlaceholder]}>
                <User size={72} color={colors.textSecondary} />
              </View>
            )}

            {/* Local Self-View PIP (Picture-In-Picture) — our own camera,
                the same track actually being sent to the peer. */}
            <View style={styles.pipContainer}>
              {localStream && RTCView ? (
                <RTCView
                  streamURL={typeof localStream.toURL === 'function' ? localStream.toURL() : localStream}
                  style={styles.pipAvatar}
                  objectFit="cover"
                  mirror={callState.isFrontCamera}
                  zOrder={1}
                />
              ) : remote?.avatar ? (
                <Image
                  source={{ uri: remote.avatar }}
                  style={styles.pipAvatar}
                />
              ) : (
                <View style={[styles.pipAvatar, styles.avatarPlaceholder]}>
                  <User size={28} color={colors.textSecondary} />
                </View>
              )}
              <View style={styles.pipBadge}>
                <Text style={styles.pipBadgeText}>You</Text>
              </View>
            </View>
          </View>
        )}

        {/* Top Header Security HUD */}
        <View style={styles.topHeader}>
          <View style={styles.secureHeaderBadge}>
            <ShieldCheck size={14} color={colors.primary} />
            <Text style={styles.secureBadgeText}>
              {isVideo ? 'ENCRYPTED VIDEO CALL' : 'ENCRYPTED VOICE CALL'}
            </Text>
          </View>

          <Text style={styles.timerText}>
            {isIncomingRinging
              ? 'Incoming Call...'
              : callState.status === 'ringing'
              ? 'Calling...'
              : formatDuration(callState.duration)}
          </Text>

          {/* Telemetry Pill */}
          {callState.status === 'connected' && !callState.isReconnecting && (
            <View style={styles.telemetryPill}>
              <Radio size={10} color={colors.primary} />
              <Text style={styles.telemetryText}>LIVE {isVideo ? 'VIDEO' : 'VOICE'}</Text>
            </View>
          )}

          {/* Reconnecting Banner — the WebRTC connection dropped mid-call
              (see App.tsx's onConnectionStateChange) but ICE may still
              recover, so this doesn't end the call outright. */}
          {callState.status === 'connected' && callState.isReconnecting && (
            <View style={styles.reconnectingPill}>
              <Text style={styles.reconnectingText}>Reconnecting…</Text>
            </View>
          )}
        </View>

        {/* Center Profile & Audio Waves (for Audio Calls or Video Off) */}
        {(!isVideo || callState.isVideoOff) && (
          <View style={styles.userCenter}>
            <Animated.View
              style={[
                styles.avatarBorder,
                (isIncomingRinging || callState.status === 'ringing') && styles.avatarBorderRinging,
                { transform: [{ scale: ringPulseAnim }] },
              ]}
            >
              {remote?.avatar ? (
                <Image
                  source={{ uri: remote.avatar }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <User size={54} color={colors.primary} />
                </View>
              )}
            </Animated.View>

            <Text style={styles.callerName}>{remote?.name || 'Contact'}</Text>
            <Text style={styles.callerHandle}>{remote?.handle || '@user'}</Text>

            {/* Audio Waveform Equalizer Visualizer */}
            {callState.status === 'connected' && !callState.isMuted && (
              <View style={styles.waveformContainer}>
                {waveBars.map((barHeight, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.waveformBar,
                      {
                        height: barHeight,
                        backgroundColor: idx % 2 === 0 ? '#10b981' : '#34d399',
                      },
                    ]}
                  />
                ))}
              </View>
            )}

            {/* SAS Cryptographic Words Verification */}
            {showVerificationWords &&
              callState.sasVerificationWords.length > 0 &&
              callState.status === 'connected' && (
                <View style={styles.sasContainer}>
                  <View style={styles.sasHeader}>
                    <Lock size={12} color={colors.primary} />
                    <Text style={styles.sasLabel}>VERIFICATION WORDS</Text>
                  </View>
                  <View style={styles.sasRow}>
                    {callState.sasVerificationWords.map((word, idx) => (
                      <View key={idx} style={styles.sasChip}>
                        <Text style={styles.sasWord}>{word}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.sasHint}>
                    Compare these words with your contact to verify
                  </Text>
                </View>
              )}
          </View>
        )}

        {/* Bottom Call Controls & Action Row */}
        <View style={styles.controlsContainer}>
          {isIncomingRinging ? (
            /* Incoming Call Actions: Accept (Green) or Decline (Red) */
            <View style={styles.incomingActionRow}>
              <TouchableOpacity style={styles.declineButton} onPress={onHangup}>
                <PhoneOff size={28} color="#ffffff" />
                <Text style={styles.actionBtnLabel}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.acceptButton}
                onPress={onAcceptIncoming}
              >
                {isVideo ? (
                  <Video size={28} color="#ffffff" />
                ) : (
                  <Phone size={28} color="#ffffff" />
                )}
                <Text style={styles.actionBtnLabel}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Active Call Controls */
            <>
              <View style={styles.controlsRow}>
                {/* Mute Button */}
                <TouchableOpacity
                  style={[
                    styles.controlBtn,
                    callState.isMuted && styles.controlBtnActive,
                  ]}
                  onPress={onToggleMute}
                >
                  {callState.isMuted ? (
                    <MicOff size={22} color="#ef4444" />
                  ) : (
                    <Mic size={22} color="#cbd5e1" />
                  )}
                </TouchableOpacity>

                {/* Video Toggle */}
                {isVideo && (
                  <TouchableOpacity
                    style={[
                      styles.controlBtn,
                      callState.isVideoOff && styles.controlBtnActive,
                    ]}
                    onPress={onToggleVideo}
                  >
                    {callState.isVideoOff ? (
                      <VideoOff size={22} color="#ef4444" />
                    ) : (
                      <Video size={22} color="#cbd5e1" />
                    )}
                  </TouchableOpacity>
                )}

                {/* Speaker Toggle */}
                <TouchableOpacity
                  style={[
                    styles.controlBtn,
                    !callState.isSpeakerOn && styles.controlBtnActive,
                  ]}
                  onPress={onToggleSpeaker}
                >
                  {callState.isSpeakerOn ? (
                    <Volume2 size={22} color="#10b981" />
                  ) : (
                    <VolumeX size={22} color="#64748b" />
                  )}
                </TouchableOpacity>

                {/* Flip Camera (Video Mode Only) */}
                {isVideo && !callState.isVideoOff && (
                  <TouchableOpacity
                    style={styles.controlBtn}
                    onPress={onToggleCameraFlip}
                  >
                    <SwitchCamera size={22} color="#cbd5e1" />
                  </TouchableOpacity>
                )}
              </View>

              {/* End Call Hangup */}
              <View style={styles.bottomActionRow}>
                <TouchableOpacity style={styles.hangupButton} onPress={onHangup}>
                  <PhoneOff size={28} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  videoBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  fullCamera: {
    width: '100%',
    height: '100%',
  },
  remoteVideoFeed: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  pipContainer: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 90,
    height: 120,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  pipAvatar: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  pipBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(6, 78, 59, 0.85)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    alignItems: 'center',
  },
  pipBadgeText: {
    color: '#34d399',
    fontSize: 9,
    fontWeight: '800',
  },
  topHeader: {
    alignItems: 'center',
    marginTop: 10,
    zIndex: 10,
  },
  secureHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderColor: '#a7f3d0',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  secureBadgeText: {
    color: '#065f46',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timerText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  telemetryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
    ...shadows.sm,
  },
  telemetryText: {
    color: colors.primaryDark,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  reconnectingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    borderColor: '#fde68a',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
  },
  reconnectingText: {
    color: '#92400e',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  userCenter: {
    alignItems: 'center',
    marginVertical: 'auto',
  },
  avatarBorder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  avatarBorderRinging: {
    borderColor: '#f59e0b',
    borderWidth: 4,
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
  },
  avatarPlaceholder: {
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callerName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  callerHandle: {
    fontSize: 14,
    color: colors.primaryDark,
    marginTop: 4,
    fontWeight: '600',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
    marginTop: 16,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
  },
  sasContainer: {
    marginTop: 20,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    maxWidth: 320,
    ...shadows.sm,
  },
  sasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sasLabel: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sasRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  sasChip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sasWord: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  sasHint: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 8,
    textAlign: 'center',
  },
  controlsContainer: {
    gap: 20,
    zIndex: 10,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  controlBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  controlBtnActive: {
    backgroundColor: colors.dangerLight,
    borderColor: '#fca5a5',
  },
  bottomActionRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangupButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  incomingActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  declineButton: {
    alignItems: 'center',
    gap: 6,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    ...shadows.md,
  },
  acceptButton: {
    alignItems: 'center',
    gap: 6,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    ...shadows.md,
  },
  actionBtnLabel: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    position: 'absolute',
    bottom: -20,
  },
});
