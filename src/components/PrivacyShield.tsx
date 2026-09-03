import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { ShieldAlert, Fingerprint, Trash2 } from './Icons';
import { colors, shadows } from '../theme';
import { beginExternalActivity, endExternalActivity } from '../utils/appLockGuard';

interface Props {
  isLocked: boolean;
  onUnlock: () => void;
  onEmergencyWipe?: () => void;
}

export function PrivacyShield({ isLocked, onUnlock, onEmergencyWipe }: Props) {
  const [authenticating, setAuthenticating] = useState(false);

  if (!isLocked) return null;

  const handleUnlockPress = async () => {
    if (authenticating) return;
    setAuthenticating(true);
    beginExternalActivity();
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometrics Not Available',
          'Please set up Face/Fingerprint unlock or a screen lock in your device Settings.'
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock JABY',
        fallbackLabel: 'Use device passcode',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        onUnlock();
      }
    } finally {
      endExternalActivity();
      setAuthenticating(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.centerCard}>
        <View style={styles.iconCircle}>
          <ShieldAlert size={36} color={colors.danger} />
        </View>

        <Text style={styles.title}>APP LOCKED</Text>
        <Text style={styles.subtitle}>
          Unlock JABY to access your messages and calls.
        </Text>

        <TouchableOpacity style={styles.unlockBtn} onPress={handleUnlockPress} disabled={authenticating}>
          <Fingerprint size={20} color="#ffffff" />
          <Text style={styles.unlockBtnText}>{authenticating ? 'Verifying…' : 'Unlock App'}</Text>
        </TouchableOpacity>

        {onEmergencyWipe && (
          <TouchableOpacity
            style={styles.emergencyWipeBtn}
            onPress={() => {
              Alert.alert(
                'Emergency Enclave Wipe',
                'This will immediately purge all cryptographic keys, session tokens, and cached credentials from this device. Are you sure?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Wipe Enclave',
                    style: 'destructive',
                    onPress: onEmergencyWipe,
                  },
                ]
              );
            }}
          >
            <Trash2 size={14} color={colors.danger} />
            <Text style={styles.emergencyWipeText}>Emergency Enclave Wipe</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 340,
    ...shadows.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    width: '100%',
    justifyContent: 'center',
    ...shadows.sm,
  },
  unlockBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  emergencyWipeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  emergencyWipeText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
});
