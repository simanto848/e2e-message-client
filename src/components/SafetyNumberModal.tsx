import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, TextInput } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ShieldCheck, ShieldAlert, X, CheckCircle } from './Icons';
import { ChatThread, UserProfile } from '../types';
import { generateSafetyNumbers } from '../utils/crypto';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  chat?: ChatThread | null;
  currentUser?: UserProfile | null;
  participant?: UserProfile | null;
  safetyNumber?: string;
  isVerified?: boolean;
  verifiedSafetyNumber?: string | null;
  // Persists the change server-side; resolves true only when the server
  // accepted it (stale numbers after key rotation are rejected).
  onToggleVerify?: (safetyNumber: string | null, nextVerified: boolean) => Promise<boolean>;
  onClose: () => void;
}

export function SafetyNumberModal({
  visible,
  chat,
  currentUser,
  participant: directParticipant,
  safetyNumber: initialSafetyNumber,
  isVerified: initialIsVerified = false,
  verifiedSafetyNumber: initialVerifiedNumber = null,
  onToggleVerify,
  onClose,
}: Props) {
  const participant = chat?.participant || directParticipant;
  const [computedSafetyNumber, setComputedSafetyNumber] = useState<string | null>(initialSafetyNumber || null);
  const [isVerified, setIsVerified] = useState(initialIsVerified);
  const [verifiedNumber, setVerifiedNumber] = useState<string | null>(initialVerifiedNumber);
  const [isComputing, setIsComputing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scannedValue, setScannedValue] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    setIsVerified(initialIsVerified);
    setVerifiedNumber(initialVerifiedNumber);
  }, [initialIsVerified, initialVerifiedNumber, participant?.id]);

  useEffect(() => {
    let active = true;
    if (currentUser?.publicKey && participant?.publicKey) {
      setIsComputing(true);
      generateSafetyNumbers(currentUser.publicKey, participant.publicKey)
        .then(num => {
          if (active) {
            setComputedSafetyNumber(num);
            setIsComputing(false);
          }
        })
        .catch(() => {
          if (active) setIsComputing(false);
        });
    } else if (initialSafetyNumber) {
      setComputedSafetyNumber(initialSafetyNumber);
    } else {
      setComputedSafetyNumber(null);
    }
    return () => {
      active = false;
    };
  }, [currentUser?.publicKey, participant?.publicKey, participant?.id, initialSafetyNumber]);

  if (!participant) return null;

  const displaySafetyNumber = computedSafetyNumber || (isComputing ? 'Computing safety number…' : 'Awaiting keys');
  // Encoded payload both sides derive identically from the same key pair,
  // so scanning each other's code verifies without exposing digits on screen.
  const qrValue = computedSafetyNumber
    ? `JABY-SAFETY-V1:${computedSafetyNumber.replace(/\s/g, '')}`
    : 'JABY-SAFETY-V1:PENDING';

  // Keys rotated since the last verification: the old approval is revoked
  // and the user must compare again in person.
  const numberChanged =
    !!verifiedNumber && !!computedSafetyNumber && verifiedNumber.replace(/\s/g, '') !== computedSafetyNumber.replace(/\s/g, '');
  const showVerified = isVerified && !numberChanged;

  // Bidirectional scan-compare: paste/scan the peer's QR payload here. Both
  // sides must scan EACH OTHER (not just display) — verification is only
  // valid when the scanned value matches the locally computed number.
  const normalizeScan = (v: string) =>
    v.replace(/^JABY-SAFETY-V1:/i, '').replace(/\s/g, '').trim().toUpperCase();
  const normalizedComputed = (computedSafetyNumber || '').replace(/\s/g, '').trim().toUpperCase();
  const normalizedScanned = scannedValue ? normalizeScan(scannedValue) : '';
  const scanMismatch =
    normalizedScanned.length > 0 && normalizedComputed.length > 0 && normalizedScanned !== normalizedComputed;
  const scanMatch =
    normalizedScanned.length > 0 && normalizedComputed.length > 0 && normalizedScanned === normalizedComputed;

  const handleScanChange = (v: string) => {
    setScannedValue(v);
    if (!v.trim()) {
      setScanError(null);
      return;
    }
    const n = normalizeScan(v);
    const c = (computedSafetyNumber || '').replace(/\s/g, '').trim().toUpperCase();
    if (c && n !== c) {
      setScanError('Scanned code does NOT match this chat — do NOT verify. Possible wrong contact or interception.');
    } else {
      setScanError(null);
    }
  };

  const handleVerifyPress = () => {
    if (isSaving || !onToggleVerify) return;
    if (scanMismatch) {
      Alert.alert(
        'Safety Number Mismatch',
        'The scanned code does not match the computed safety number. Verification rejected — compare again in person.'
      );
      return;
    }
    if (showVerified) {
      Alert.alert(
        'Remove Verification',
        `Stop trusting ${participant.name}'s identity? You'll need to compare safety numbers again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setIsSaving(true);
              try {
                const ok = await onToggleVerify(computedSafetyNumber, false);
                if (ok) {
                  setIsVerified(false);
                }
              } finally {
                setIsSaving(false);
              }
            },
          },
        ]
      );
      return;
    }
    (async () => {
      setIsSaving(true);
      try {
        const ok = await onToggleVerify(computedSafetyNumber, true);
        if (ok) {
          setIsVerified(true);
          setVerifiedNumber(computedSafetyNumber);
        }
      } finally {
        setIsSaving(false);
      }
    })();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <ShieldCheck size={20} color={colors.primary} />
              <Text style={styles.title}>Safety Number</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.subtitle}>
              Scan this code with <Text style={styles.bold}>{participant.name}'s</Text> phone to confirm your chat is private.
            </Text>

            {/* Real scannable QR — the only way to verify (no copy, no visible digits) */}
            <View style={styles.qrContainer}>
              <View style={styles.qrCard}>
                {computedSafetyNumber ? (
                  <QRCode
                    value={qrValue}
                    size={190}
                    color="#111827"
                    backgroundColor="#ffffff"
                  />
                ) : (
                  <View style={styles.qrPlaceholder}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.qrPlaceholderText}>{displaySafetyNumber}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.qrName}>{participant.name}</Text>
              <Text style={styles.qrLabel}>Scan this code with {participant.name}'s phone to verify</Text>
            </View>

            {/* Bidirectional verification note */}
            <View style={styles.compareNote}>
              <Text style={styles.compareNoteText}>
                Both sides must scan each other's code in person. Display alone proves nothing — only a matching
                scan in BOTH directions means no one is intercepting this chat.
              </Text>
            </View>

            {/* Peer scan-compare input */}
            <Text style={styles.scanLabel}>COMPARE SCANNED CODE</Text>
            <TextInput
              style={[styles.scanInput, scanMismatch && styles.scanInputError]}
              placeholder="Paste scanned JABY-SAFETY-V1:… payload"
              placeholderTextColor={colors.textMuted}
              value={scannedValue}
              onChangeText={handleScanChange}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Paste the scanned safety number to compare"
            />
            {scanMatch && (
              <View style={styles.matchBanner}>
                <CheckCircle size={15} color="#065f46" />
                <Text style={styles.matchText}>Scanned code matches — safe to verify.</Text>
              </View>
            )}
            {(scanMismatch || scanError) && (
              <View style={styles.mismatchBanner}>
                <ShieldAlert size={15} color="#b91c1c" />
                <Text style={styles.mismatchText}>
                  {scanError || 'Scanned code does NOT match — verification rejected.'}
                </Text>
              </View>
            )}

            {/* Key-change warning: previously verified, but the number moved */}
            {numberChanged && (
              <View style={styles.changedBanner}>
                <ShieldAlert size={16} color="#b45309" />
                <Text style={styles.changedText}>
                  Safety number changed since you verified — {participant.name}'s keys may have rotated (new install) or someone may be intercepting. Compare again in person before trusting this chat.
                </Text>
              </View>
            )}

            {/* Verification Action */}
            <TouchableOpacity
              style={[
                styles.verifyButton,
                showVerified ? styles.verifiedBtn : numberChanged ? styles.changedBtn : styles.unverifiedBtn,
                (isSaving || !computedSafetyNumber || scanMismatch) && styles.verifyButtonDisabled,
              ]}
              onPress={handleVerifyPress}
              disabled={isSaving || !computedSafetyNumber || scanMismatch}
              accessibilityRole="button"
              accessibilityLabel={
                showVerified
                  ? `Verified contact. Remove verification for ${participant.name}`
                  : numberChanged
                    ? `Verify new safety number for ${participant.name}`
                    : `Mark ${participant.name} as verified`
              }
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <CheckCircle size={18} color="#ffffff" />
              )}
              <Text style={styles.verifyButtonText}>
                {isSaving
                  ? 'Saving…'
                  : showVerified
                    ? 'Verified Contact'
                    : numberChanged
                      ? 'Verify New Number'
                      : 'Mark as Verified'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: {
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },
  bold: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  qrCard: {
    width: 230,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    ...shadows.lg,
  },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  qrPlaceholderText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  qrName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  qrLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  compareNote: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  compareNoteText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#1e40af',
    fontWeight: '600',
  },
  scanLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  scanInput: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  scanInputError: {
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  matchBanner: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  matchText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#065f46',
  },
  mismatchBanner: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  mismatchText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
    lineHeight: 17,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
    ...shadows.sm,
  },
  verifiedBtn: {
    backgroundColor: colors.primary,
  },
  unverifiedBtn: {
    backgroundColor: colors.accentBlue,
  },
  changedBtn: {
    backgroundColor: '#d97706',
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  changedBanner: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  changedText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#92400e',
    fontWeight: '600',
  },
  verifyButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
