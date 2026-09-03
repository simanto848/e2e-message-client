import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { X, KeyRound, Lock, ShieldCheck, Eye, EyeOff, Check } from './Icons';
import { colors, shadows } from '../theme';
import { api } from '../services/api';
import { saveSessionToken } from '../utils/keyStore';
import { evaluatePasswordStrength } from '../utils/passwordStrength';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPasswordUpdated?: () => void;
}

export function ChangePasswordModal({ visible, onClose, onPasswordUpdated }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const strength = evaluatePasswordStrength(newPassword);

  useEffect(() => {
    if (visible) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setLoading(false);
      setErrorMessage(null);
    }
  }, [visible]);

  const isMinLength = newPassword.length >= 4;
  const isMatching = newPassword.length > 0 && newPassword === confirmPassword;
  const isDifferent = newPassword.length > 0 && currentPassword.length > 0 && newPassword !== currentPassword;
  const canSubmit = currentPassword.trim().length > 0 && isMinLength && isMatching && !loading;

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setErrorMessage(null);

    if (!currentPassword) {
      setErrorMessage('Please enter your current password or PIN.');
      return;
    }

    if (!isMinLength) {
      setErrorMessage('New password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setErrorMessage('New password must be different from current password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.updatePassword(currentPassword, newPassword);
      if (res.success) {
        if (res.token) {
          await saveSessionToken(res.token);
        }
        Alert.alert('Success', 'Your password has been successfully updated.', [
          {
            text: 'OK',
            onPress: () => {
              onPasswordUpdated?.();
              onClose();
            },
          },
        ]);
      } else {
        setErrorMessage(res.error || 'Failed to update password. Please check your credentials.');
      }
    } catch (err) {
      console.warn('[ChangePasswordModal] Error:', err);
      setErrorMessage('Network error occurred. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoid}
          >
            <View style={styles.sheetContainer}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.iconCircle}>
                    <KeyRound size={20} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.title}>Update Password</Text>
                    <Text style={styles.subtitle}>Enclave Account Authentication</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={loading}>
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.formContainer}
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Notice Card */}
                <View style={styles.noticeCard}>
                  <ShieldCheck size={18} color={colors.accentBlue} />
                  <Text style={styles.noticeText}>
                    Your password protects your account credentials and enclave access. Updating it will
                    require the new password on future logins.
                  </Text>
                </View>

                {errorMessage && (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorBannerText}>{errorMessage}</Text>
                  </View>
                )}

                {/* Current Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>CURRENT PASSWORD / PIN</Text>
                  <View style={styles.inputBox}>
                    <Lock size={18} color={colors.textSecondary} />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter current password or PIN"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showCurrent}
                      value={currentPassword}
                      onChangeText={t => {
                        setCurrentPassword(t);
                        setErrorMessage(null);
                      }}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowCurrent(!showCurrent)}
                      style={styles.visibilityBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showCurrent ? (
                        <EyeOff size={18} color={colors.textSecondary} />
                      ) : (
                        <Eye size={18} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* New Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>NEW PASSWORD / PIN</Text>
                  <View style={styles.inputBox}>
                    <KeyRound size={18} color={colors.textSecondary} />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter new password (min. 4 characters)"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showNew}
                      value={newPassword}
                      onChangeText={t => {
                        setNewPassword(t);
                        setErrorMessage(null);
                      }}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowNew(!showNew)}
                      style={styles.visibilityBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showNew ? (
                        <EyeOff size={18} color={colors.textSecondary} />
                      ) : (
                        <Eye size={18} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Password Strength Meter */}
                  {newPassword.length > 0 && (
                    <View style={styles.strengthContainer}>
                      <View style={styles.strengthBars}>
                        {[1, 2, 3, 4].map(level => (
                          <View
                            key={level}
                            style={[
                              styles.strengthBar,
                              strength.score >= level && { backgroundColor: strength.color },
                            ]}
                          />
                        ))}
                      </View>
                      <View style={styles.strengthTextRow}>
                        <Text style={[styles.strengthLabel, { color: strength.color }]}>
                          {strength.label}
                        </Text>
                        <Text style={styles.strengthFeedback}>{strength.feedback}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Confirm New Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>CONFIRM NEW PASSWORD / PIN</Text>
                  <View style={styles.inputBox}>
                    <KeyRound size={18} color={colors.textSecondary} />
                    <TextInput
                      style={styles.input}
                      placeholder="Re-enter new password"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showConfirm}
                      value={confirmPassword}
                      onChangeText={t => {
                        setConfirmPassword(t);
                        setErrorMessage(null);
                      }}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirm(!showConfirm)}
                      style={styles.visibilityBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showConfirm ? (
                        <EyeOff size={18} color={colors.textSecondary} />
                      ) : (
                        <Eye size={18} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Requirement indicators */}
                <View style={styles.requirementsContainer}>
                  <View style={styles.reqRow}>
                    <View style={[styles.reqDot, isMinLength && styles.reqDotActive]}>
                      {isMinLength && <Check size={10} color="#ffffff" />}
                    </View>
                    <Text style={[styles.reqText, isMinLength && styles.reqTextActive]}>
                      At least 4 characters long
                    </Text>
                  </View>

                  <View style={styles.reqRow}>
                    <View style={[styles.reqDot, isMatching && styles.reqDotActive]}>
                      {isMatching && <Check size={10} color="#ffffff" />}
                    </View>
                    <Text style={[styles.reqText, isMatching && styles.reqTextActive]}>
                      New passwords match
                    </Text>
                  </View>

                  {currentPassword.length > 0 && newPassword.length > 0 && (
                    <View style={styles.reqRow}>
                      <View style={[styles.reqDot, isDifferent && styles.reqDotActive]}>
                        {isDifferent && <Check size={10} color="#ffffff" />}
                      </View>
                      <Text style={[styles.reqText, isDifferent && styles.reqTextActive]}>
                        Different from current password
                      </Text>
                    </View>
                  )}
                </View>

                {/* Submit button */}
                <TouchableOpacity
                  style={[styles.primaryBtn, (!canSubmit || loading) && styles.disabledBtn]}
                  onPress={handleSubmit}
                  disabled={!canSubmit || loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <ShieldCheck size={18} color="#ffffff" />
                      <Text style={styles.primaryBtnText}>Update Password</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    width: '100%',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
  },
  formContainer: {
    paddingHorizontal: 20,
  },
  formContent: {
    paddingTop: 16,
    paddingBottom: 36,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentBlueLight,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: colors.dangerText,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  visibilityBtn: {
    padding: 4,
  },
  requirementsContainer: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reqDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reqDotActive: {
    backgroundColor: colors.primary,
  },
  reqText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  reqTextActive: {
    color: colors.primaryText,
    fontWeight: '500',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 12,
    gap: 8,
    ...shadows.sm,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  strengthContainer: {
    marginTop: 8,
    gap: 6,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 6,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHighlight,
  },
  strengthTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  strengthFeedback: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
