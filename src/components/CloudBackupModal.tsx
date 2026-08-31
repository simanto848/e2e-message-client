import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import { Cloud, X, Lock, ShieldCheck, Download, KeyRound } from './Icons';
import { CloudBackupMetadata } from '../types';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  metadata: CloudBackupMetadata;
  onCreateBackup: (passphrase: string) => Promise<boolean>;
  onRestoreBackup: (passphrase: string) => Promise<boolean>;
  onClose: () => void;
}

export function CloudBackupModal({
  visible,
  metadata,
  onCreateBackup,
  onRestoreBackup,
  onClose,
}: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'backup' | 'restore'>('backup');

  const handleAction = async () => {
    if (!passphrase || passphrase.length < 6) {
      Alert.alert('Password Required', 'Please enter a backup password of at least 6 characters.');
      return;
    }

    setIsProcessing(true);
    try {
      if (mode === 'backup') {
        const success = await onCreateBackup(passphrase);
        if (success) {
          Alert.alert('Backup Created', 'Your chats were backed up securely.');
          setPassphrase('');
        }
      } else {
        const success = await onRestoreBackup(passphrase);
        if (success) {
          Alert.alert('Restore Complete', 'Your chats were restored successfully.');
          setPassphrase('');
        }
      }
    } catch {
      Alert.alert('Error', 'Operation failed. Please check your password.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Cloud size={20} color={colors.primary} />
              <Text style={styles.title}>Chat Backup</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Status overview */}
            <View style={styles.metaCard}>
              <View style={styles.metaHeader}>
                <ShieldCheck size={16} color={colors.primaryDark} />
                <Text style={styles.metaTitle}>ENCRYPTED BACKUP</Text>
              </View>
              <Text style={styles.metaDetail}>
                Last Backup: {metadata.lastBackupTime ? new Date(metadata.lastBackupTime).toLocaleDateString() : 'Never'}
              </Text>
              <Text style={styles.metaDetail}>
                Backup Data: {metadata.totalChatsCount} chats · {metadata.totalMessagesCount} messages ({metadata.backupSizeKb} KB)
              </Text>
            </View>

            {/* Mode switch */}
            <View style={styles.modeTabs}>
              <TouchableOpacity
                style={[styles.tab, mode === 'backup' && styles.activeTab]}
                onPress={() => setMode('backup')}
              >
                <Text style={[styles.tabText, mode === 'backup' && styles.activeTabText]}>Back Up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, mode === 'restore' && styles.activeTab]}
                onPress={() => setMode('restore')}
              >
                <Text style={[styles.tabText, mode === 'restore' && styles.activeTabText]}>Restore</Text>
              </TouchableOpacity>
            </View>

            {/* Passphrase Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>
                {mode === 'backup' ? 'SET BACKUP PASSWORD' : 'ENTER BACKUP PASSWORD'}
              </Text>
              <View style={styles.inputWrapper}>
                <KeyRound size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Password (min 6 characters)"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={true}
                  value={passphrase}
                  onChangeText={setPassphrase}
                />
              </View>
              <Text style={styles.inputHint}>
                Please remember this password. If lost, your backup cannot be recovered.
              </Text>
            </View>

            {/* Action button */}
            <TouchableOpacity
              style={[styles.actionButton, isProcessing && styles.disabledBtn]}
              onPress={handleAction}
              disabled={isProcessing}
            >
              {mode === 'backup' ? (
                <Lock size={18} color="#ffffff" />
              ) : (
                <Download size={18} color="#ffffff" />
              )}
              <Text style={styles.actionButtonText}>
                {isProcessing
                  ? 'Processing...'
                  : mode === 'backup'
                  ? 'Back Up Now'
                  : 'Restore Chats'}
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
  metaCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    marginBottom: 16,
  },
  metaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaTitle: {
    color: '#065f46',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  metaDetail: {
    color: colors.textPrimary,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
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
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    color: colors.textPrimary,
    fontSize: 14,
  },
  inputHint: {
    fontSize: 12,
    color: '#d97706',
    lineHeight: 16,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
    ...shadows.sm,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
