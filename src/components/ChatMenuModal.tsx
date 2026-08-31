import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import {
  ShieldCheck,
  Flame,
  Trash2,
  UserX,
  X,
  ChevronRight,
} from './Icons';
import { ChatThread, DisappearingTimer } from '../types';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  chat: ChatThread;
  onOpenSafetyNumbers: () => void;
  onUpdateDisappearingTimer: (timer: DisappearingTimer) => void;
  onClearHistory: () => void;
  onDisconnectContact: () => void;
  onClose: () => void;
}

const TIMER_OPTIONS: { label: string; value: DisappearingTimer }[] = [
  { label: 'Off', value: 0 },
  { label: '5 seconds', value: 5 },
  { label: '15 seconds', value: 15 },
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '1 hour', value: 3600 },
  { label: '24 hours', value: 86400 },
];

export function ChatMenuModal({
  visible,
  chat,
  onOpenSafetyNumbers,
  onUpdateDisappearingTimer,
  onClearHistory,
  onDisconnectContact,
  onClose,
}: Props) {
  const participant = chat.participant;

  const handleClearHistoryPress = () => {
    Alert.alert(
      'Clear Chat History',
      `Are you sure you want to delete all messages with ${participant.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Messages',
          style: 'destructive',
          onPress: () => {
            onClearHistory();
            onClose();
          },
        },
      ]
    );
  };

  const handleDisconnectPress = () => {
    Alert.alert(
      'Remove Contact',
      `Remove ${participant.name} from your contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onDisconnectContact();
            onClose();
          },
        },
      ]
    );
  };

  const handleSelectTimer = (timer: DisappearingTimer) => {
    onUpdateDisappearingTimer(timer);
    Alert.alert('Timer Updated', `Disappearing messages set to ${timer > 0 ? `${timer} seconds` : 'Off'}.`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Chat Options</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* User Info */}
          <View style={styles.peerCard}>
            <Text style={styles.peerName}>{participant.name}</Text>
            <Text style={styles.peerHandle}>{participant.handle}</Text>
            <Text style={styles.peerFingerprint}>Safety Number: {participant.fingerprintHash}</Text>
          </View>

          {/* Menu Items */}
          <View style={styles.menuContainer}>
            {/* Safety Number */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                onClose();
                onOpenSafetyNumbers();
              }}
            >
              <View style={styles.rowAlign}>
                <ShieldCheck size={18} color={colors.primary} />
                <Text style={styles.menuText}>Verify Safety Number</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Disappearing Timer Selector */}
            <View style={[styles.menuItem, styles.columnItem, styles.borderTop]}>
              <View style={styles.rowBetween}>
                <View style={styles.rowAlign}>
                  <Flame size={18} color="#d97706" />
                  <Text style={styles.menuText}>Disappearing Messages</Text>
                </View>
                <Text style={styles.activeTimerBadge}>
                  {chat.disappearingTimer > 0 ? `${chat.disappearingTimer}s` : 'Off'}
                </Text>
              </View>

              {/* Timer chips */}
              <View style={styles.timerChipsRow}>
                {TIMER_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.timerChip,
                      chat.disappearingTimer === opt.value && styles.timerChipActive,
                    ]}
                    onPress={() => handleSelectTimer(opt.value)}
                  >
                    <Text
                      style={[
                        styles.timerChipText,
                        chat.disappearingTimer === opt.value && styles.timerChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Clear History */}
            <TouchableOpacity
              style={[styles.menuItem, styles.borderTop]}
              onPress={handleClearHistoryPress}
            >
              <View style={styles.rowAlign}>
                <Trash2 size={18} color={colors.danger} />
                <Text style={[styles.menuText, { color: colors.danger }]}>Clear Chat History</Text>
              </View>
            </TouchableOpacity>

            {/* Disconnect Contact */}
            <TouchableOpacity
              style={[styles.menuItem, styles.borderTop]}
              onPress={handleDisconnectPress}
            >
              <View style={styles.rowAlign}>
                <UserX size={18} color={colors.danger} />
                <Text style={[styles.menuText, { color: colors.danger }]}>Remove Contact</Text>
              </View>
            </TouchableOpacity>
          </View>
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
  peerCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  peerName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  peerHandle: {
    fontSize: 12,
    color: colors.primaryDark,
    marginTop: 1,
    fontWeight: '600',
  },
  peerFingerprint: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  columnItem: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  activeTimerBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#d97706',
  },
  timerChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    width: '100%',
  },
  timerChip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerChipActive: {
    backgroundColor: colors.warningLight,
    borderColor: '#fde68a',
  },
  timerChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  timerChipTextActive: {
    color: '#92400e',
    fontWeight: '800',
  },
});
