import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import { Cloud, X, Lock, ShieldCheck, Download, KeyRound, Calendar, Clock, Check } from './Icons';
import { CloudBackupMetadata, BackupFrequency } from '../types';
import { colors, shadows } from '../theme';
import { saveBackupPassphrase } from '../utils/keyStore';

interface Props {
  visible: boolean;
  initialMode?: 'backup' | 'restore';
  metadata: CloudBackupMetadata;
  backupFrequency?: BackupFrequency;
  onChangeFrequency?: (frequency: BackupFrequency) => void;
  onCreateBackup: (passphrase: string) => Promise<boolean>;
  onRestoreBackup: (passphrase: string) => Promise<boolean>;
  onClose: () => void;
}

export function CloudBackupModal({
  visible,
  initialMode = 'backup',
  metadata,
  backupFrequency = 'daily',
  onChangeFrequency,
  onCreateBackup,
  onRestoreBackup,
  onClose,
}: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'backup' | 'restore'>(initialMode);

  React.useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setPassphrase('');
    }
  }, [visible, initialMode]);

  const handleAction = async () => {
    if (!passphrase || passphrase.length < 4) {
      Alert.alert('Password Required', 'Please enter your account PIN or backup password (at least 4 characters).');
      return;
    }

    setIsProcessing(true);
    try {
      if (mode === 'backup') {
        const success = await onCreateBackup(passphrase);
        if (success) {
          // Remember passphrase securely so scheduled auto-backups succeed in background
          await saveBackupPassphrase(passphrase);
          Alert.alert('Backup Created', 'Your session encryption keys were backed up securely. Automatic backup is active.');
          setPassphrase('');
        }
      } else {
        const success = await onRestoreBackup(passphrase);
        if (success) {
          await saveBackupPassphrase(passphrase);
          Alert.alert('Restore Complete', 'Your chat session and encryption keys have been restored.');
          setPassphrase('');
          onClose();
        }
      }
    } catch {
      Alert.alert('Error', 'Operation failed. Please check your password.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getScheduleText = () => {
    if (!backupFrequency || backupFrequency === 'off') {
      return 'Automatic backup is turned off.';
    }
    const intervals: Record<string, number> = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
    };
    const intervalMs = intervals[backupFrequency] || intervals.daily;
    if (!metadata.lastBackupTime) {
      return `Schedule: ${backupFrequency.toUpperCase()} (runs on next sync)`;
    }
    const nextTime = metadata.lastBackupTime + intervalMs;
    if (Date.now() >= nextTime) {
      return 'Auto-backup due now (will sync in background)';
    }
    const nextDate = new Date(nextTime);
    return `Next auto-backup: ${nextDate.toLocaleDateString()} at ${nextDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const frequencyOptions: { label: string; value: BackupFrequency; desc: string }[] = [
    { label: 'Daily', value: 'daily', desc: 'Every 24h' },
    { label: 'Weekly', value: 'weekly', desc: 'Every 7d' },
    { label: 'Monthly', value: 'monthly', desc: 'Every 30d' },
    { label: 'Off', value: 'off', desc: 'Disabled' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Cloud size={20} color={colors.primary} />
              <Text style={styles.title}>{mode === 'restore' ? 'Restore Session Keys' : 'Chat Backup'}</Text>
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
                <Text style={styles.metaTitle}>ZERO-KNOWLEDGE VAULT</Text>
              </View>
              <Text style={styles.metaDetail}>
                Last Backup: {metadata.lastBackupTime ? new Date(metadata.lastBackupTime).toLocaleDateString() : 'Never'}
              </Text>
              <Text style={styles.metaDetail}>
                Key Escrow: {metadata.totalChatsCount} chats · {metadata.totalMessagesCount} messages ({metadata.backupSizeKb || 128} KB)
              </Text>
            </View>

            {/* Auto-Backup Frequency Section */}
            <View style={styles.scheduleCard}>
              <View style={styles.scheduleHeader}>
                <Calendar size={16} color={colors.primary} />
                <Text style={styles.scheduleTitle}>AUTO-BACKUP FREQUENCY</Text>
              </View>
              <Text style={styles.scheduleSubtitle}>
                Automatically encrypt and back up your chat keys in the background.
              </Text>
              <View style={styles.frequencyChips}>
                {frequencyOptions.map(opt => {
                  const isSelected = backupFrequency === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.freqChip, isSelected && styles.activeFreqChip]}
                      onPress={() => onChangeFrequency && onChangeFrequency(opt.value)}
                    >
                      <View style={styles.chipContent}>
                        {isSelected && <Check size={12} color="#ffffff" style={styles.checkIcon} />}
                        <Text style={[styles.freqChipText, isSelected && styles.activeFreqChipText]}>
                          {opt.label}
                        </Text>
                      </View>
                      <Text style={[styles.freqChipSub, isSelected && styles.activeFreqChipSub]}>
                        {opt.desc}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.scheduleStatusRow}>
                <Clock size={13} color={colors.textSecondary} />
                <Text style={styles.scheduleStatusText}>{getScheduleText()}</Text>
              </View>
            </View>

            {/* Mode switch */}
            <View style={styles.modeTabs}>
              <TouchableOpacity
                style={[styles.tab, mode === 'backup' && styles.activeTab]}
                onPress={() => setMode('backup')}
              >
                <Text style={[styles.tabText, mode === 'backup' && styles.activeTabText]}>Manual Backup</Text>
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
                {mode === 'backup' ? 'SET BACKUP PASSWORD / PIN' : 'ACCOUNT PIN OR BACKUP PASSWORD'}
              </Text>
              <View style={styles.inputWrapper}>
                <KeyRound size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="PIN or Password (min 4 characters)"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={true}
                  value={passphrase}
                  onChangeText={setPassphrase}
                />
              </View>
              <Text style={styles.inputHint}>
                {mode === 'backup'
                  ? 'Your identity keys are encrypted using PBKDF2 (100,000 rounds) before leaving your device.'
                  : 'Enter your account PIN or backup password to restore your historical encryption keys and unlock previous messages.'}
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
                  ? 'Processing Vault...'
                  : mode === 'backup'
                  ? 'Back Up Keys Now'
                  : 'Restore Session Messages'}
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
  scheduleCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  scheduleTitle: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  scheduleSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 12,
  },
  frequencyChips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  freqChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  activeFreqChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  checkIcon: {
    marginRight: 2,
  },
  freqChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  activeFreqChipText: {
    color: '#ffffff',
  },
  freqChipSub: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  activeFreqChipSub: {
    color: '#d1fae5',
  },
  scheduleStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  scheduleStatusText: {
    fontSize: 11,
    color: colors.textSecondary,
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
