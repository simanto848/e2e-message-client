import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ticket, Lock, Settings } from './Icons';
import { JabyLogo } from './JabyLogo';
import { colors, shadows } from '../theme';

interface Props {
  onLockPress: () => void;
  onInvitesPress: () => void;
  onSettingsPress: () => void;
  inviteCount?: number;
  isEnclaveActive?: boolean;
}

// Linked Devices and Chat Backup used to live here too, but they're already
// reachable from Settings (ACCOUNT section) — having them in both places was
// redundant clutter, so this row now only keeps what's worth one-tap access:
// invite quota at a glance, settings, and the lock button.
export function Header({
  onLockPress,
  onInvitesPress,
  onSettingsPress,
  inviteCount = 0,
  isEnclaveActive = true,
}: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.leftRow}>
        <JabyLogo size={36} showText={true} subtitle="SECURE MESSENGER" />
        <View style={[styles.enclaveDot, isEnclaveActive ? styles.enclaveOn : styles.enclaveOff]} />
      </View>

      <View style={styles.rightActions}>
        <TouchableOpacity
          style={styles.pillButton}
          onPress={onInvitesPress}
          accessibilityRole="button"
          accessibilityLabel={`${inviteCount} invites remaining. Manage invites.`}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ticket size={14} color={colors.primaryDark} />
          <Text style={styles.pillText}>{inviteCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={onSettingsPress}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Settings size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.lockButton}
          onPress={onLockPress}
          accessibilityRole="button"
          accessibilityLabel="Lock app"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Lock size={16} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  enclaveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  enclaveOn: {
    backgroundColor: colors.primary,
  },
  enclaveOff: {
    backgroundColor: colors.textMuted,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  pillText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  iconButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 7,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lockButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 7,
    backgroundColor: colors.dangerLight,
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 10,
  },
});
