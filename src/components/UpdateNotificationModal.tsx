import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Download, Sparkles, X, ExternalLink, ShieldCheck } from './Icons';
import { colors, shadows } from '../theme';
import { ReleaseInfo, openReleaseDownload } from '../services/updateService';

interface Props {
  visible: boolean;
  release: ReleaseInfo | null;
  onDismiss: () => void;
}

export function UpdateNotificationModal({ visible, release, onDismiss }: Props) {
  if (!release) return null;

  const handleDownload = () => {
    const targetUrl = release.apkUrl || release.downloadUrl;
    openReleaseDownload(targetUrl);
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Header Badge */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Sparkles size={24} color={colors.primary} />
            </View>
            {!release.isMandatory && (
              <TouchableOpacity style={styles.closeBtn} onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Title & Version */}
          <View style={styles.content}>
            <View style={styles.versionBadge}>
              <ShieldCheck size={12} color={colors.primary} />
              <Text style={styles.versionBadgeText}>UPDATE AVAILABLE</Text>
            </View>
            <Text style={styles.title}>{release.title || `New Update v${release.version}`}</Text>
            <Text style={styles.subtitle}>Version {release.version} is now available on GitHub Releases.</Text>

            {/* Changelog Card */}
            <View style={styles.changelogBox}>
              <Text style={styles.changelogTitle}>What's New:</Text>
              <ScrollView style={styles.changelogScroll} showsVerticalScrollIndicator={true}>
                <Text style={styles.changelogText}>{release.notes}</Text>
              </ScrollView>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.downloadBtn} onPress={handleDownload} activeOpacity={0.85}>
              <Download size={18} color="#ffffff" />
              <Text style={styles.downloadBtnText}>Download & Install</Text>
              <ExternalLink size={14} color="#ffffff" style={{ opacity: 0.7 }} />
            </TouchableOpacity>

            {!release.isMandatory && (
              <TouchableOpacity style={styles.laterBtn} onPress={onDismiss} activeOpacity={0.7}>
                <Text style={styles.laterBtnText}>Remind Me Later</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    marginBottom: 20,
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  versionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  changelogBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 140,
  },
  changelogTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  changelogScroll: {
    maxHeight: 100,
  },
  changelogText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    gap: 10,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  downloadBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  laterBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  laterBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});
