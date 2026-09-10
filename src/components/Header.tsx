import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ticket } from './Icons';
import { JabyLogo } from './JabyLogo';
import { Avatar } from './Avatar';
import { UserProfile } from '../types';
import { colors, shadows } from '../theme';

interface Props {
  currentUser?: UserProfile | null;
  onAvatarPress?: () => void;
  onInvitesPress?: () => void;
  onLockPress?: () => void;
  inviteCount?: number;
  isEnclaveActive?: boolean;
}

export function Header({
  currentUser,
  onAvatarPress,
  onInvitesPress,
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
        {onInvitesPress && (
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
        )}

        <TouchableOpacity
          style={styles.avatarButton}
          onPress={onAvatarPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Signed in as ${currentUser?.name || 'Account'}. Open settings.`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Avatar
            uri={currentUser?.avatar}
            name={currentUser?.name || 'User'}
            size={36}
          />
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
  avatarButton: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 1,
    backgroundColor: colors.surfaceElevated,
    ...shadows.sm,
  },
});
