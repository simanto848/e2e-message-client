import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { ShieldCheck, X, CheckCircle, QrCode, Copy } from './Icons';
import * as Clipboard from 'expo-clipboard';
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
  onToggleVerify?: () => void;
  onClose: () => void;
}

export function SafetyNumberModal({
  visible,
  chat,
  currentUser,
  participant: directParticipant,
  safetyNumber: initialSafetyNumber,
  isVerified: initialIsVerified = true,
  onToggleVerify,
  onClose,
}: Props) {
  const participant = chat?.participant || directParticipant;
  const [computedSafetyNumber, setComputedSafetyNumber] = useState<string>(
    initialSafetyNumber || '48912 00291 88391 00293 88192 39102 88471 00921 77381 99281 33019 44812'
  );
  const [isVerified, setIsVerified] = useState(initialIsVerified);

  useEffect(() => {
    if (currentUser?.publicKey && participant?.publicKey) {
      generateSafetyNumbers(currentUser.publicKey, participant.publicKey).then(num => {
        setComputedSafetyNumber(num);
      });
    } else if (initialSafetyNumber) {
      setComputedSafetyNumber(initialSafetyNumber);
    }
  }, [currentUser?.publicKey, participant?.publicKey, initialSafetyNumber]);

  if (!participant) return null;

  const copySafetyNumber = async () => {
    await Clipboard.setStringAsync(computedSafetyNumber);
  };

  const chunks = computedSafetyNumber.split(' ');

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
              Compare this number with <Text style={styles.bold}>{participant.name}</Text> to confirm your chat is private.
            </Text>

            {/* QR Simulation Box */}
            <View style={styles.qrContainer}>
              <View style={styles.qrBox}>
                <QrCode size={110} color={colors.primaryDark} />
              </View>
              <Text style={styles.qrLabel}>Scan QR code on your friend's phone</Text>
            </View>

            {/* 60-Digit Numbers in 12 blocks of 5 */}
            <View style={styles.numbersGrid}>
              {chunks.map((chunk, idx) => (
                <View key={idx} style={styles.chunkItem}>
                  <Text style={styles.chunkIndex}>{idx + 1}</Text>
                  <Text style={styles.chunkText}>{chunk}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.copyButton} onPress={copySafetyNumber}>
              <Copy size={16} color={colors.primaryDark} />
              <Text style={styles.copyButtonText}>Copy Safety Number</Text>
            </TouchableOpacity>

            {/* Verification Action */}
            <TouchableOpacity
              style={[styles.verifyButton, isVerified ? styles.verifiedBtn : styles.unverifiedBtn]}
              onPress={() => {
                setIsVerified(!isVerified);
                if (onToggleVerify) onToggleVerify();
              }}
            >
              <CheckCircle size={18} color="#ffffff" />
              <Text style={styles.verifyButtonText}>
                {isVerified ? 'Verified Contact' : 'Mark as Verified'}
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
  qrBox: {
    padding: 16,
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    marginBottom: 8,
  },
  qrLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  numbersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chunkItem: {
    width: '31%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chunkIndex: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '800',
    marginBottom: 2,
  },
  chunkText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primaryDark,
    letterSpacing: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primaryLight,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  copyButtonText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    ...shadows.sm,
  },
  verifiedBtn: {
    backgroundColor: colors.primary,
  },
  unverifiedBtn: {
    backgroundColor: colors.accentBlue,
  },
  verifyButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
