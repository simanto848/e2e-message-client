import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, BackHandler } from 'react-native';
import { ShieldCheck, Lock, KeyRound, Ticket, Fingerprint, ArrowRight, User } from '../components/Icons';
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
  ) => void;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (!handle || !pinCode) {
      Alert.alert('Missing Details', 'Please enter your handle and PIN code.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login(handle, pinCode);
      if (res.success && res.user && res.token) {
        onAuthenticated(res.user, res.token, undefined, pinCode);
      } else {
        Alert.alert('Authentication Failed', res.error || 'Invalid credentials, or the server is unreachable.');
      }
    } catch {
      Alert.alert('Connection Error', 'Unable to reach the backend server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name || !handle || !inviteCode) {
      Alert.alert('Missing Details', 'Please enter your name, a handle, and an invite code.');
      return;
    }
    if (!pinCode || pinCode.length < 4) {
      Alert.alert('PIN Too Short', 'Choose a PIN or passphrase of at least 4 characters.');
      return;
    }

    setLoading(true);
    try {
      const keyPair = generateIdentityKeyPair();
      const fingerprint = await computeFingerprint(keyPair.publicKey);

      const res = await api.register({
        name,
        handle,
        inviteCode,
        publicKey: keyPair.publicKey,
        pinCode,
        fingerprintHash: fingerprint,
      });

      if (res.success && res.user && res.token) {
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

        Alert.alert('Account Created', `Welcome, ${name}!`);
        onAuthenticated(res.user, res.token, keyPair, pinCode);
      } else {
        Alert.alert('Registration Error', res.error || 'Failed to redeem invite code');
      }
    } catch {
      Alert.alert('Error', 'Unable to connect to backend server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
                  value={handle.replace('@', '')}
                  onChangeText={t => setHandle(`@${t}`)}
                  autoCapitalize="none"
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
                />
              </View>

              <View style={styles.inputBox}>
                <KeyRound size={18} color={colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Choose a PIN (4-6 digits)"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={true}
                  value={pinCode}
                  onChangeText={setPinCode}
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
                  value={handle.replace('@', '')}
                  onChangeText={t => setHandle(`@${t}`)}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputBox}>
                <KeyRound size={18} color={colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="PIN or Password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={true}
                  keyboardType="numeric"
                  value={pinCode}
                  onChangeText={setPinCode}
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
    </View>
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
});
