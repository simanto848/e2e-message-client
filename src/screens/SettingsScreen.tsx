import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { Avatar } from '../components/Avatar';
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  Laptop,
  Cloud,
  KeyRound,
  Ticket,
  EyeOff,
  LogOut,
  ChevronRight,
  Sparkles,
  Phone,
  Trash2,
  ShieldAlert,
  RefreshCw,
  Calendar,
} from '../components/Icons';
import { UserProfile, BackupFrequency } from '../types';
import { colors, shadows } from '../theme';


interface Props {
  currentUser: UserProfile;
  antiScreenshotEnabled: boolean;
  onToggleAntiScreenshot: (val: boolean) => void;
  callVerificationEnabled: boolean;
  onToggleCallVerification: (val: boolean) => void;
  autoLockDelay: number;
  onChangeAutoLockDelay: (val: number) => void;
  onOpenInvites: () => void;
  onOpenLinkedDevices: () => void;
  onOpenCloudBackup: () => void;
  backupFrequency?: BackupFrequency;
  onChangeBackupFrequency?: (freq: BackupFrequency) => void;
  onOpenRestoreSession?: () => void;
  onOpenChangePassword?: () => void;
  onOpenDuressSettings?: () => void;
  onOpenPermissions?: () => void;
  onCheckUpdates?: () => void;
  onEditProfile: () => void;
  onLockEnclave: () => void;
  onEmergencyWipe?: () => void;
  onSignOut?: () => void;
  onBack: () => void;
}

export function SettingsScreen({
  currentUser,
  antiScreenshotEnabled,
  onToggleAntiScreenshot,
  callVerificationEnabled,
  onToggleCallVerification,
  autoLockDelay,
  onChangeAutoLockDelay,
  onOpenInvites,
  onOpenLinkedDevices,
  onOpenCloudBackup,
  backupFrequency = 'daily',
  onChangeBackupFrequency,
  onOpenRestoreSession,
  onOpenChangePassword,
  onOpenDuressSettings,
  onOpenPermissions,
  onCheckUpdates,
  onEditProfile,
  onLockEnclave,
  onEmergencyWipe,
  onSignOut,
  onBack,
}: Props) {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <TouchableOpacity style={styles.profileCard} onPress={onEditProfile} activeOpacity={0.7}>
          <Avatar uri={currentUser.avatar} name={currentUser.name} size={60} style={styles.avatar} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{currentUser.name}</Text>
            <Text style={styles.profileHandle}>{currentUser.handle}</Text>
            <Text style={styles.profileStatus}>{currentUser.statusMessage}</Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Privacy */}
        <Text style={styles.sectionHeader}>PRIVACY</Text>
        <View style={styles.settingCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextContainer}>
              <View style={styles.rowAlign}>
                <EyeOff size={18} color={colors.danger} />
                <Text style={styles.toggleTitle}>Block Screenshots</Text>
              </View>
              <Text style={styles.toggleDesc}>
                Prevents screenshots and screen recording while the app is open.
              </Text>
            </View>
            <Switch
              value={antiScreenshotEnabled}
              onValueChange={onToggleAntiScreenshot}
              trackColor={{ false: colors.surfaceHighlight, true: '#a7f3d0' }}
              thumbColor={antiScreenshotEnabled ? colors.primary : colors.textMuted}
            />
          </View>

          <View style={[styles.toggleRow, styles.borderTop]}>
            <View style={styles.toggleTextContainer}>
              <View style={styles.rowAlign}>
                <Phone size={18} color={colors.primary} />
                <Text style={styles.toggleTitle}>Call Verification Words</Text>
              </View>
              <Text style={styles.toggleDesc}>
                Shows security words during calls to verify no one is intercepting the connection.
              </Text>
            </View>
            <Switch
              value={callVerificationEnabled}
              onValueChange={onToggleCallVerification}
              trackColor={{ false: colors.surfaceHighlight, true: '#a7f3d0' }}
              thumbColor={callVerificationEnabled ? colors.primary : colors.textMuted}
            />
          </View>

          {/* Auto-Lock Delay Selector */}
          <View style={[styles.customRow, styles.borderTop]}>
            <View style={styles.toggleTextContainer}>
              <View style={styles.rowAlign}>
                <Lock size={18} color={colors.accentPurple} />
                <Text style={styles.toggleTitle}>Auto-Lock Delay</Text>
              </View>
              <Text style={styles.toggleDesc}>
                Locks the app after being in the background for this duration.
              </Text>
            </View>
            <View style={styles.chipsContainer}>
              {[
                { label: '5s', value: 5 },
                { label: '1m', value: 60 },
                { label: '5m', value: 300 },
                { label: '15m', value: 900 },
                { label: 'Never', value: 0 },
              ].map(opt => {
                const isActive = autoLockDelay === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.chip, isActive && styles.activeChip]}
                    onPress={() => onChangeAutoLockDelay(opt.value)}
                  >
                    <Text style={[styles.chipText, isActive && styles.activeChipText]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Emergency Decoy PIN */}
          {onOpenDuressSettings && (
            <TouchableOpacity style={[styles.menuItem, styles.borderTop]} onPress={onOpenDuressSettings}>
              <View style={styles.rowAlign}>
                <ShieldAlert size={18} color={colors.warning} />
                <Text style={styles.menuItemText}>Emergency Decoy PIN</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          {/* Erase All App Data */}
          {onEmergencyWipe && (
            <TouchableOpacity
              style={[styles.menuItem, styles.borderTop]}
              onPress={() => {
                Alert.alert(
                  'Erase All App Data',
                  'This will permanently delete all messages, encryption keys, and log you out of this device. Are you sure you want to proceed?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Erase All Data', style: 'destructive', onPress: onEmergencyWipe },
                  ]
                );
              }}
            >
              <View style={styles.rowAlign}>
                <Trash2 size={18} color={colors.danger} />
                <Text style={[styles.menuItemText, { color: colors.danger }]}>Erase All App Data</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Account */}
        <Text style={styles.sectionHeader}>ACCOUNT</Text>
        <View style={styles.settingCard}>
          <TouchableOpacity style={styles.menuItem} onPress={onOpenInvites}>
            <View style={styles.rowAlign}>
              <Ticket size={18} color={colors.primary} />
              <Text style={styles.menuItemText}>Invite Friends</Text>
            </View>
            <View style={styles.rowAlign}>
              <Text style={styles.menuItemBadge}>{currentUser.inviteCodesRemaining} left</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, styles.borderTop]} onPress={onOpenLinkedDevices}>
            <View style={styles.rowAlign}>
              <Laptop size={18} color={colors.accentBlue} />
              <Text style={styles.menuItemText}>Linked Devices</Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, styles.borderTop]} onPress={onOpenCloudBackup}>
            <View style={styles.rowAlign}>
              <Cloud size={18} color={colors.accentPurple} />
              <Text style={styles.menuItemText}>Chat Backup</Text>
            </View>
            <View style={styles.rowAlign}>
              <Text style={styles.menuItemBadge}>
                {backupFrequency === 'off'
                  ? 'Off'
                  : backupFrequency.charAt(0).toUpperCase() + backupFrequency.slice(1)}
              </Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>

          {/* Auto-Backup Frequency Schedule Selector */}
          <View style={[styles.customRow, styles.borderTop]}>
            <View style={styles.toggleTextContainer}>
              <View style={styles.rowAlign}>
                <Calendar size={18} color={colors.primary} />
                <Text style={styles.toggleTitle}>Auto-Backup Frequency</Text>
              </View>
              <Text style={styles.toggleDesc}>
                Scheduled zero-knowledge chat keys & session backup.
              </Text>
            </View>
            <View style={styles.chipsContainer}>
              {[
                { label: 'Daily', value: 'daily' },
                { label: 'Weekly', value: 'weekly' },
                { label: 'Monthly', value: 'monthly' },
                { label: 'Off', value: 'off' },
              ].map(opt => {
                const isActive = (backupFrequency || 'daily') === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.chip, isActive && styles.activeChip]}
                    onPress={() => onChangeBackupFrequency && onChangeBackupFrequency(opt.value as BackupFrequency)}
                  >
                    <Text style={[styles.chipText, isActive && styles.activeChipText]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>


          {onOpenRestoreSession && (
            <TouchableOpacity style={[styles.menuItem, styles.borderTop]} onPress={onOpenRestoreSession}>
              <View style={styles.rowAlign}>
                <RefreshCw size={18} color={colors.primary} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.menuItemText}>Restore Session & Messages</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                    Recover old keys to unlock previous chats
                  </Text>
                </View>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          {onOpenChangePassword && (
            <TouchableOpacity style={[styles.menuItem, styles.borderTop]} onPress={onOpenChangePassword}>
              <View style={styles.rowAlign}>
                <KeyRound size={18} color={colors.primary} />
                <Text style={styles.menuItemText}>Change Password</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* App */}
        {(onOpenPermissions || onCheckUpdates) && (
          <>
            <Text style={styles.sectionHeader}>APP</Text>
            <View style={styles.settingCard}>
              {onOpenPermissions && (
                <TouchableOpacity style={styles.menuItem} onPress={onOpenPermissions}>
                  <View style={styles.rowAlign}>
                    <ShieldCheck size={18} color={colors.primary} />
                    <Text style={styles.menuItemText}>App Permissions</Text>
                  </View>
                  <ChevronRight size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}

              {onCheckUpdates && (
                <TouchableOpacity style={[styles.menuItem, onOpenPermissions && styles.borderTop]} onPress={onCheckUpdates}>
                  <View style={styles.rowAlign}>
                    <Sparkles size={18} color={colors.accentBlue} />
                    <Text style={styles.menuItemText}>Check for Updates</Text>
                  </View>
                  <ChevronRight size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* Lock Button */}
        <TouchableOpacity style={styles.lockButton} onPress={onLockEnclave}>
          <Lock size={18} color={colors.danger} />
          <Text style={styles.lockButtonText}>Lock App</Text>
        </TouchableOpacity>

        {/* Sign Out Button */}
        {onSignOut && (
          <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
            <LogOut size={18} color={colors.textSecondary} />
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        )}

        {/* Version info */}
        <View style={styles.footerContainer}>
          <Text style={styles.footerBrand}>JABY Messenger v1.0.0</Text>
          <Text style={styles.footerSpecs}>End-to-End Encrypted</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  backButton: {
    padding: 6,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  content: {
    padding: 16,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
    ...shadows.sm,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 14,
    backgroundColor: colors.surfaceElevated,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  profileHandle: {
    fontSize: 13,
    color: colors.primaryDark,
    marginTop: 2,
    fontWeight: '600',
  },
  profileStatus: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  settingCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
    ...shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  infoCol: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  infoValue: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    marginTop: 8,
    paddingTop: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  toggleDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  menuItemBadge: {
    fontSize: 12,
    color: colors.primaryDark,
    fontWeight: '700',
    marginRight: 6,
  },
  lockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.dangerLight,
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  lockButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 24,
  },
  signOutButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  footerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  footerBrand: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  footerSpecs: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
  customRow: {
    padding: 16,
    gap: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activeChipText: {
    color: '#ffffff',
  },
});
