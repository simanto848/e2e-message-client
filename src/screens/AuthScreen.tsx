import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, BackHandler, Animated, Easing, KeyboardAvoidingView, Platform } from 'react-native';
import { ShieldCheck, Lock, KeyRound, Ticket, Fingerprint, User } from '../components/Icons';
import { JabyLogo } from '../components/JabyLogo';
import { UserProfile } from '../types';
import { computeFingerprint, generateIdentityKeyPair, IdentityKeyPair } from '../utils/crypto';
import { encryptBackup, BackupPayload } from '../utils/backupCrypto';
import { api } from '../services/api';
import { evaluatePasswordStrength } from '../utils/passwordStrength';
import { colors, shadows } from '../theme';

interface Props {
  onAuthenticated: (
    user: UserProfile,
    token: string,
    freshKeyPair?: IdentityKeyPair,
    pinCode?: string
  ) => void | Promise<void>;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('Verifying credentials...');

  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animation loop for loader overlay
  useEffect(() => {
    if (!loading) {
      spinAnim.setValue(0);
      pulseAnim.setValue(1);
      return;
    }

    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1300,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );

    spin.start();
    pulse.start();

    return () => {
      spin.stop();
      pulse.stop();
    };
  }, [loading]);

  // When in registration view, pressing hardware back returns to login view
  useEffect(() => {
    if (!isRegisterMode) return;

    const onHardwareBack = () => {
      setIsRegisterMode(false);
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [isRegisterMode]);

  const registerStrength = evaluatePasswordStrength(pinCode);

  const handleLogin = async () => {
    const cleanHandle = handle.trim().replace(/^@+/, '').replace(/\s+/g, '');
    if (!cleanHandle || !pinCode) {
      Alert.alert('Missing Details', 'Please enter your handle and PIN/password.');
      return;
    }

    setLoading(true);
    setLoadingStep('Verifying security credentials...');

    const timer1 = setTimeout(() => {
      setLoadingStep('Unlocking cryptographic enclave...');
    }, 600);

    const timer2 = setTimeout(() => {
      setLoadingStep('Establishing secure session...');
    }, 1300);

    try {
      const res = await api.login(`@${cleanHandle}`, pinCode);
      if (res.success && res.user && res.token) {
        setLoadingStep('Entering secure enclave...');
        await onAuthenticated(res.user, res.token, undefined, pinCode);
      } else {
        Alert.alert('Authentication Failed', res.error || 'Invalid credentials, or the server is unreachable.');
      }
    } catch {
      Alert.alert('Connection Error', 'Unable to reach the backend server. Please try again.');
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const cleanHandle = handle.trim().replace(/^@+/, '').replace(/\s+/g, '');
    if (!name.trim() || !cleanHandle || !inviteCode.trim()) {
      Alert.alert('Missing Details', 'Please enter your name, a handle, and an invite code.');
      return;
    }
    const handleRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!handleRegex.test(cleanHandle)) {
      Alert.alert(
        'Invalid Handle',
        'Handle must be 3–30 characters long and contain only letters, numbers, and underscores.'
      );
      return;
    }
    if (!pinCode || pinCode.length < 6) {
      Alert.alert('PIN Too Short', 'Choose a PIN or passcode of at least 6 characters for enclave protection.');
      return;
    }

    setLoading(true);
    setLoadingStep('Generating X25519 identity keys...');

    const timer1 = setTimeout(() => {
      setLoadingStep('Registering account with enclave...');
    }, 800);

    try {
      const keyPair = generateIdentityKeyPair();
      const fingerprint = await computeFingerprint(keyPair.publicKey);

      const res = await api.register({
        name: name.trim(),
        handle: `@${cleanHandle}`,
        inviteCode: inviteCode.trim(),
        publicKey: keyPair.publicKey,
        pinCode,
        fingerprintHash: fingerprint,
      });

      if (res.success && res.user && res.token) {
        setLoadingStep('Encrypting zero-knowledge backup...');
        try {
          const payload: BackupPayload = {
            version: 2,
            exportedAt: Date.now(),
            identityKeyPair: keyPair,
          };
          const blob = encryptBackup(payload, pinCode);
          await api.saveCloudBackup(
            {
              encryptedData: blob.encryptedData,
              salt: blob.salt,
              iv: blob.iv,
              backupSizeKb: Math.ceil(blob.encryptedData.length / 1024),
              backupVersion: '2.5.0-E2EE',
              totalMessagesCount: 0,
              totalChatsCount: 0,
              keyFingerprint: fingerprint,
            },
            res.token
          );
        } catch (backupErr) {
          console.warn('[Register] Cloud backup auto-escrow failed:', backupErr);
        }

        setLoadingStep('Account created! Entering enclave...');
        await onAuthenticated(res.user, res.token, keyPair, pinCode);
      } else {
        Alert.alert('Registration Error', res.error || 'Failed to redeem invite code');
      }
    } catch {
      Alert.alert('Error', 'Unable to connect to backend server.');
    } finally {
      clearTimeout(timer1);
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo and Brand */}
        <View style={styles.brandHeader}>
          <JabyLogo size={56} showText={true} subtitle="END-TO-END ENCRYPTED" />
          <Text style={styles.tagline}>
            Secure, private messaging and encrypted calling.
          </Text>
        </View>

        {/* Auth Card */}
        <View style={styles.card}>
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, !isRegisterMode && styles.activeTab]}
              onPress={() => setIsRegisterMode(false)}
            >
              <Text style={[styles.tabText, !isRegisterMode && styles.activeTabText]}>
                Log In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, isRegisterMode && styles.activeTab]}
              onPress={() => setIsRegisterMode(true)}
            >
              <Text style={[styles.tabText, isRegisterMode && styles.activeTabText]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {isRegisterMode ? (
            /* Register Mode */
            <View style={styles.form}>
              <View style={styles.inputBox}>
                <User size={18} color={colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Your Name"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.inputBox}>
                <Text style={styles.inputPrefix}>@</Text>
                <TextInput
                  style={styles.input}
                  placeholder="username"
                  placeholderTextColor={colors.textMuted}
                  value={handle.replace(/^@+/, '')}
                  onChangeText={t => {
                    const stripped = t.replace(/^@+/, '');
                    setHandle(stripped ? `@${stripped}` : '');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputBox}>
                <Ticket size={18} color={colors.primary} />
                <TextInput
                  style={styles.input}
                  placeholder="Invite Code"
                  placeholderTextColor={colors.textMuted}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputBox}>
                <KeyRound size={18} color={colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Choose a PIN or Passphrase"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={true}
                  value={pinCode}
                  onChangeText={setPinCode}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {pinCode.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBars}>
                    {[1, 2, 3, 4].map(level => (
                      <View
                        key={level}
                        style={[
                          styles.strengthBar,
                          registerStrength.score >= level && { backgroundColor: registerStrength.color },
                        ]}
                      />
                    ))}
                  </View>
                  <View style={styles.strengthTextRow}>
                    <Text style={[styles.strengthLabel, { color: registerStrength.color }]}>
                      {registerStrength.label}
                    </Text>
                    <Text style={styles.strengthFeedback}>{registerStrength.feedback}</Text>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.disabledBtn]}
                onPress={handleRegister}
                disabled={loading}
              >
                <ShieldCheck size={18} color="#ffffff" />
                <Text style={styles.primaryBtnText}>
                  {loading ? 'Creating Account...' : 'Create Account'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Login Mode */
            <View style={styles.form}>
              <View style={styles.inputBox}>
                <Text style={styles.inputPrefix}>@</Text>
                <TextInput
                  style={styles.input}
                  placeholder="username"
                  placeholderTextColor={colors.textMuted}
                  value={handle.replace(/^@+/, '')}
                  onChangeText={t => {
                    const stripped = t.replace(/^@+/, '');
                    setHandle(stripped ? `@${stripped}` : '');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputBox}>
                <KeyRound size={18} color={colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="PIN or Password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={true}
                  value={pinCode}
                  onChangeText={setPinCode}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.disabledBtn]}
                onPress={handleLogin}
                disabled={loading}
              >
                <Fingerprint size={20} color="#ffffff" />
                <Text style={styles.primaryBtnText}>
                  {loading ? 'Logging In...' : 'Log In'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Quick Demo Fill */}
          {__DEV__ && (
            <View style={styles.quickFillContainer}>
              <Text style={styles.quickFillLabel}>TEST ACCOUNTS</Text>
              <View style={styles.quickFillRow}>
                <TouchableOpacity
                  style={styles.quickChip}
                  onPress={() => {
                    setHandle('@operative');
                    setPinCode('1337');
                    setIsRegisterMode(false);
                  }}
                >
                  <Text style={styles.quickChipText}>Demo User</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickChip}
                  onPress={() => {
                    setHandle('@alice.vance');
                    setPinCode('1234');
                    setIsRegisterMode(false);
                  }}
                >
                  <Text style={styles.quickChipText}>Alice</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Security Footer Notice */}
        <View style={styles.footerNote}>
          <ShieldCheck size={14} color={colors.primary} />
          <Text style={styles.footerText}>
            Messages and calls are end-to-end encrypted
          </Text>
        </View>
      </ScrollView>
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <View style={styles.loaderVisualWrapper}>
              {/* Outer pulsing glow ring */}
              <Animated.View
                style={[
                  styles.loaderPulsingRing,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              />

              {/* Rotating orbital ring */}
              <Animated.View
                style={[
                  styles.loaderRotatingRing,
                  {
                    transform: [
                      {
                        rotate: spinAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '360deg'],
                        }),
                      },
                    ],
                  },
                ]}
              />

              {/* Center emblem */}
              <View style={styles.loaderCenterIcon}>
                <ShieldCheck size={28} color="#10b981" />
              </View>
            </View>

            <Text style={styles.loadingTitle}>
              {isRegisterMode ? 'Creating Enclave Account' : 'Authenticating Operative'}
            </Text>
            <Text style={styles.loadingSubtitle}>{loadingStep}</Text>

            {/* Micro Status Dots */}
            <View style={styles.loadingDotsRow}>
              <View style={[styles.loadingDot, styles.loadingDot1]} />
              <View style={[styles.loadingDot, styles.loadingDot2]} />
              <View style={[styles.loadingDot, styles.loadingDot3]} />
            </View>

            <View style={styles.securityBadge}>
              <Lock size={11} color="#047857" />
              <Text style={styles.securityBadgeText}>256-BIT ZERO KNOWLEDGE</Text>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 20,
  },
  tagline: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  activeTabText: {
    color: colors.primaryDark,
  },
  form: {
    gap: 12,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    height: 48,
    gap: 10,
  },
  inputPrefix: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
    ...shadows.sm,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  quickFillContainer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  quickFillLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  quickFillRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  quickChip: {
    backgroundColor: colors.accentBlueLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  quickChipText: {
    color: colors.accentBlue,
    fontSize: 11,
    fontWeight: '700',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 12,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  strengthContainer: {
    marginBottom: 16,
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    paddingHorizontal: 24,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    ...shadows.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  loaderVisualWrapper: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  loaderPulsingRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
  },
  loaderRotatingRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: '#10b981',
    borderTopColor: 'transparent',
    borderRightColor: '#a7f3d0',
  },
  loaderCenterIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  loadingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  loadingSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '600',
    minHeight: 20,
  },
  loadingDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    marginBottom: 16,
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  loadingDot1: {
    opacity: 0.4,
  },
  loadingDot2: {
    opacity: 0.7,
  },
  loadingDot3: {
    opacity: 1,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  securityBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.8,
  },
});
