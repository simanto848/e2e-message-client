import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ticket, X, Copy, Plus, Check } from './Icons';
import * as Clipboard from 'expo-clipboard';
import { InviteCode } from '../types';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  invites: InviteCode[];
  remainingCount: number;
  onGenerateInvite: () => void;
  onClose: () => void;
}

export function InviteManagerModal({
  visible,
  invites,
  remainingCount,
  onGenerateInvite,
  onClose,
}: Props) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ticket size={20} color={colors.primary} />
              <Text style={styles.title}>Invite Friends</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Invite Status Card */}
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <View>
                  <Text style={styles.statusLabel}>INVITES REMAINING</Text>
                  <Text style={styles.statusCount}>{remainingCount} Available</Text>
                </View>
                <TouchableOpacity
                  style={[styles.generateButton, remainingCount <= 0 && styles.disabledButton]}
                  onPress={onGenerateInvite}
                  disabled={remainingCount <= 0}
                >
                  <Plus size={16} color="#ffffff" />
                  <Text style={styles.generateButtonText}>Create Code</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.statusHint}>
                Share an invite code with friends so they can join JABY.
              </Text>
            </View>

            {/* List of Invites */}
            <Text style={styles.listSectionTitle}>YOUR INVITE CODES</Text>

            {invites.map((inv) => (
              <View key={inv.code} style={[styles.inviteCard, inv.used && styles.usedInviteCard]}>
                <View style={styles.inviteCardLeft}>
                  <Text style={[styles.codeText, inv.used && styles.usedCodeText]}>{inv.code}</Text>
                  <Text style={styles.expiryText}>
                    {inv.used
                      ? `Used on ${new Date(inv.usedAt || Date.now()).toLocaleDateString()}`
                      : `Expires in ${Math.max(1, Math.ceil((inv.expiresAt - Date.now()) / 86400000))} days`}
                  </Text>
                </View>

                {!inv.used && (
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => copyCode(inv.code)}
                  >
                    {copiedCode === inv.code ? (
                      <Check size={16} color={colors.primary} />
                    ) : (
                      <Copy size={16} color={colors.accentBlue} />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ))}
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
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: {
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065f46',
    letterSpacing: 1,
  },
  statusCount: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 2,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    ...shadows.sm,
  },
  disabledButton: {
    backgroundColor: colors.surfaceHighlight,
  },
  generateButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  statusHint: {
    fontSize: 12,
    color: '#065f46',
    marginTop: 10,
  },
  listSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  usedInviteCard: {
    opacity: 0.5,
  },
  inviteCardLeft: {
    flex: 1,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: '800',
    color: colors.accentBlue,
  },
  usedCodeText: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  expiryText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  copyBtn: {
    padding: 8,
    backgroundColor: colors.accentBlueLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
});
