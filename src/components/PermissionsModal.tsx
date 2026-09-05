import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Camera, Mic, ImageIcon, ShieldCheck, CheckCircle2, ChevronRight, Bell } from './Icons';
import { AppPermissionsStatus, requestSinglePermission } from '../utils/permissions';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  status: AppPermissionsStatus;
  onRequestPermissions: () => void;
  onRefreshStatus?: () => void;
  onDismiss: () => void;
}

export function PermissionsModal({
  visible,
  status,
  onRequestPermissions,
  onRefreshStatus,
  onDismiss,
}: Props) {
  const handleSinglePerm = async (type: 'camera' | 'microphone' | 'photos' | 'notifications') => {
    await requestSinglePermission(type);
    if (onRefreshStatus) onRefreshStatus();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header Shield */}
          <View style={styles.iconCircle}>
            <ShieldCheck size={32} color={colors.primary} />
          </View>

          <Text style={styles.title}>App Permissions</Text>
          <Text style={styles.subtitle}>
            To make calls and share photos, please allow the following permissions:
          </Text>

          {/* Permission Rows */}
          <View style={styles.permissionsList}>
            {/* Camera */}
            <TouchableOpacity
              style={[styles.permItem, status.camera && styles.permItemGranted]}
              onPress={() => !status.camera && handleSinglePerm('camera')}
              activeOpacity={status.camera ? 1 : 0.7}
            >
              <View style={styles.permIconBox}>
                <Camera size={20} color={status.camera ? colors.primary : colors.accentBlue} />
              </View>
              <View style={styles.permTextCol}>
                <Text style={styles.permName}>Camera</Text>
                <Text style={styles.permDesc}>For video calls and QR scanning</Text>
              </View>
              {status.camera ? (
                <CheckCircle2 size={18} color={colors.primary} />
              ) : (
                <ChevronRight size={18} color={colors.textSecondary} />
              )}
            </TouchableOpacity>

            {/* Microphone */}
            <TouchableOpacity
              style={[styles.permItem, status.microphone && styles.permItemGranted]}
              onPress={() => !status.microphone && handleSinglePerm('microphone')}
              activeOpacity={status.microphone ? 1 : 0.7}
            >
              <View style={styles.permIconBox}>
                <Mic size={20} color={status.microphone ? colors.primary : colors.accentPurple} />
              </View>
              <View style={styles.permTextCol}>
                <Text style={styles.permName}>Microphone</Text>
                <Text style={styles.permDesc}>For voice calls and audio messages</Text>
              </View>
              {status.microphone ? (
                <CheckCircle2 size={18} color={colors.primary} />
              ) : (
                <ChevronRight size={18} color={colors.textSecondary} />
              )}
            </TouchableOpacity>

            {/* Photos / Media */}
            <TouchableOpacity
              style={[styles.permItem, status.photos && styles.permItemGranted]}
              onPress={() => !status.photos && handleSinglePerm('photos')}
              activeOpacity={status.photos ? 1 : 0.7}
            >
              <View style={styles.permIconBox}>
                <ImageIcon size={20} color={status.photos ? colors.primary : '#d97706'} />
              </View>
              <View style={styles.permTextCol}>
                <Text style={styles.permName}>Photos & Files</Text>
                <Text style={styles.permDesc}>To send pictures and attachments</Text>
              </View>
              {status.photos ? (
                <CheckCircle2 size={18} color={colors.primary} />
              ) : (
                <ChevronRight size={18} color={colors.textSecondary} />
              )}
            </TouchableOpacity>

            {/* Notifications */}
            <TouchableOpacity
              style={[styles.permItem, status.notifications && styles.permItemGranted]}
              onPress={() => !status.notifications && handleSinglePerm('notifications')}
              activeOpacity={status.notifications ? 1 : 0.7}
            >
              <View style={styles.permIconBox}>
                <Bell size={20} color={status.notifications ? colors.primary : '#3b82f6'} />
              </View>
              <View style={styles.permTextCol}>
                <Text style={styles.permName}>Notifications</Text>
                <Text style={styles.permDesc}>To receive calls and message alerts</Text>
              </View>
              {status.notifications ? (
                <CheckCircle2 size={18} color={colors.primary} />
              ) : (
                <ChevronRight size={18} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          {/* Action Button */}
          <TouchableOpacity style={styles.grantButton} onPress={onRequestPermissions}>
            <ShieldCheck size={18} color="#ffffff" />
            <Text style={styles.grantButtonText}>
              {status.allGranted ? 'Permissions Granted' : 'Allow Permissions'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={onDismiss}>
            <Text style={styles.skipButtonText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    ...shadows.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  permissionsList: {
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  permItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  permItemGranted: {
    borderColor: '#a7f3d0',
    backgroundColor: colors.primaryLight,
  },
  permIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  permTextCol: {
    flex: 1,
  },
  permName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  permDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  grantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    width: '100%',
    ...shadows.sm,
  },
  grantButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  skipButton: {
    paddingVertical: 12,
    marginTop: 4,
  },
  skipButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
});
