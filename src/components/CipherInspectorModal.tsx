import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { ShieldCheck, X, Copy, Lock, Cpu, Key } from './Icons';
import * as Clipboard from 'expo-clipboard';
import { Message } from '../types';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  message: Message | null;
  onClose: () => void;
}

export function CipherInspectorModal({ visible, message, onClose }: Props) {
  if (!message) return null;

  const payload = message.encryptedPayload;

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          {/* Sheet Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Cpu size={20} color={colors.primary} />
              <Text style={styles.title}>Encryption Inspector</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Decrypted in Memory */}
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeader}>
                <Lock size={14} color={colors.primary} />
                <Text style={styles.sectionLabel}>DECRYPTED MESSAGE (THIS DEVICE)</Text>
              </View>
              <Text style={styles.plaintext}>{message.text || '[Purged / Encrypted Binary]'}</Text>
            </View>

            {/* Ciphertext Base64 */}
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>ENCRYPTED CIPHERTEXT</Text>
                <TouchableOpacity onPress={() => copyToClipboard(payload.ciphertext)}>
                  <Copy size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.codeText} numberOfLines={4}>
                {payload.ciphertext || '[Empty Payload]'}
              </Text>
            </View>

            {/* IV and Auth Tag */}
            <View style={styles.gridRow}>
              <View style={[styles.sectionBox, { flex: 1, marginRight: 6 }]}>
                <Text style={styles.sectionLabel}>IV / NONCE</Text>
                <Text style={styles.codeText}>{payload.iv}</Text>
              </View>
              <View style={[styles.sectionBox, { flex: 1, marginLeft: 6 }]}>
                <Text style={styles.sectionLabel}>AUTH TAG</Text>
                <Text style={styles.codeText}>{payload.authTag}</Text>
              </View>
            </View>

            {/* Algorithm & Fingerprint */}
            <View style={styles.sectionBox}>
              <Text style={styles.sectionLabel}>ALGORITHM & KEY</Text>
              <Text style={styles.valueHighlight}>{payload.algorithm}</Text>
              <Text style={styles.codeText}>{payload.keyFingerprint}</Text>
            </View>

            {/* Sender Public Key */}
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeader}>
                <Key size={14} color={colors.accentBlue} />
                <Text style={styles.sectionLabel}>SENDER PUBLIC KEY</Text>
              </View>
              <Text style={styles.codeText} numberOfLines={2}>
                {payload.senderPublicKey}
              </Text>
            </View>

            <View style={styles.zeroKnowledgeBanner}>
              <ShieldCheck size={16} color={colors.primary} />
              <Text style={styles.zkText}>
                End-to-End Encryption: Only you and your recipient can read this message. The server never sees unencrypted text.
              </Text>
            </View>
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
    maxHeight: '85%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: {
    marginBottom: 16,
  },
  sectionBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  plaintext: {
    fontSize: 14,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.textPrimary,
    marginTop: 4,
  },
  valueHighlight: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentBlue,
    marginTop: 2,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  zeroKnowledgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  zkText: {
    fontSize: 11,
    color: '#065f46',
    flex: 1,
    lineHeight: 16,
  },
});
