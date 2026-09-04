import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { ShieldAlert, Fingerprint, Trash2, KeyRound, Lock, ArrowLeft } from './Icons';
import { colors, shadows } from '../theme';
import { EraseDataModal } from './EraseDataModal';
import { beginExternalActivity, endExternalActivity } from '../utils/appLockGuard';
import { getDuressPin, getDuressAction } from '../utils/duressConfig';
import { getPrimaryPin } from '../utils/keyStore';

interface Props {
  isLocked: boolean;
  onUnlock: () => void;
  onUnlockDecoy?: () => void;
  onEmergencyWipe?: () => void;
}

export function PrivacyShield({ isLocked, onUnlock, onUnlockDecoy, onEmergencyWipe }: Props) {
  const [authenticating, setAuthenticating] = useState(false);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showEraseModal, setShowEraseModal] = useState(false);

  if (!isLocked) return null;

  const handleBiometricUnlock = async () => {
    if (authenticating) return;
    setAuthenticating(true);
    beginExternalActivity();
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometrics Not Available',
          'Please set up Face/Fingerprint unlock or use your PIN passcode.'
        );
        setShowPinEntry(true);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock JABY',
        fallbackLabel: 'Use PIN passcode',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        setEnteredPin('');
        setShowPinEntry(false);
        onUnlock();
      }
    } finally {
      endExternalActivity();
      setAuthenticating(false);
    }
  };

  const handlePinSubmit = async () => {
    const trimmed = enteredPin.trim();
    if (!trimmed) {
      setPinError('Please enter your passcode');
      return;
    }

    try {
      // 1. Check for Duress Trigger
      const [duressPin, duressAction] = await Promise.all([getDuressPin(), getDuressAction()]);

      if (duressPin && trimmed === duressPin) {
        setEnteredPin('');
        setShowPinEntry(false);
        if (duressAction === 'wipe') {
          if (onEmergencyWipe) {
            onEmergencyWipe();
          }
        } else {
          // Decoy Mode
          if (onUnlockDecoy) {
            onUnlockDecoy();
          } else {
            onUnlock();
          }
        }
        return;
      }

      // 2. Check for Primary / Real PIN
      const primaryPin = await getPrimaryPin();
      if (primaryPin) {
        if (trimmed === primaryPin) {
          setEnteredPin('');
          setShowPinEntry(false);
          setPinError('');
          onUnlock();
          return;
        } else {
          setPinError('Incorrect PIN code');
          return;
        }
      }

      // If no primary PIN was stored, fallback to standard unlock
      setEnteredPin('');
      setShowPinEntry(false);
      onUnlock();
    } catch {
      setPinError('Verification failed');
    }
  };

  return (
    <View style={styles.overlay}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centerContainer}
        >
          <View style={styles.centerCard}>
            <View style={styles.iconCircle}>
              <ShieldAlert size={36} color={colors.danger} />
            </View>

            <Text style={styles.title}>APP LOCKED</Text>
            <Text style={styles.subtitle}>
              {showPinEntry
                ? 'Enter your passcode or duress safety PIN.'
                : 'Unlock JABY to access your messages and calls.'}
            </Text>

            {showPinEntry ? (
              <View style={styles.pinSection}>
                <View style={styles.pinInputContainer}>
                  <Lock size={18} color={colors.textMuted} style={styles.pinIcon} />
                  <TextInput
                    style={styles.pinInput}
                    placeholder="Enter PIN..."
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={true}
                    keyboardType="numeric"
                    maxLength={16}
                    value={enteredPin}
                    onChangeText={text => {
                      setEnteredPin(text);
                      if (pinError) setPinError('');
                    }}
                    onSubmitEditing={handlePinSubmit}
                    autoFocus={true}
                  />
                </View>

                {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}

                <TouchableOpacity style={styles.unlockBtn} onPress={handlePinSubmit}>
                  <KeyRound size={18} color="#ffffff" />
                  <Text style={styles.unlockBtnText}>Unlock</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    setShowPinEntry(false);
                    setPinError('');
                    setEnteredPin('');
                  }}
                >
                  <ArrowLeft size={16} color={colors.textSecondary} />
                  <Text style={styles.secondaryBtnText}>Use Biometrics</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.biometricSection}>
                <TouchableOpacity
                  style={styles.unlockBtn}
                  onPress={handleBiometricUnlock}
                  disabled={authenticating}
                >
                  <Fingerprint size={20} color="#ffffff" />
                  <Text style={styles.unlockBtnText}>
                    {authenticating ? 'Verifying…' : 'Unlock with Biometrics'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    setShowPinEntry(true);
                    setPinError('');
                    setEnteredPin('');
                  }}
                >
                  <KeyRound size={16} color={colors.textSecondary} />
                  <Text style={styles.secondaryBtnText}>Enter Passcode / Duress PIN</Text>
                </TouchableOpacity>
              </View>
            )}

            {onEmergencyWipe && (
              <TouchableOpacity
                style={styles.emergencyWipeBtn}
                onPress={() => setShowEraseModal(true)}
              >
                <Trash2 size={14} color={colors.danger} />
                <Text style={styles.emergencyWipeText}>Erase All App Data</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      {/* Erase All App Data Confirmation Modal */}
      {onEmergencyWipe && (
        <EraseDataModal
          visible={showEraseModal}
          onClose={() => setShowEraseModal(false)}
          onConfirm={onEmergencyWipe}
        />
      )}
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
  centerContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
  biometricSection: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  pinSection: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  pinInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    width: '100%',
    height: 48,
  },
  pinIcon: {
    marginRight: 10,
  },
  pinInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '600',
    letterSpacing: 2,
  },
  pinErrorText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginLeft: 4,
    marginTop: -4,
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
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  secondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
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

