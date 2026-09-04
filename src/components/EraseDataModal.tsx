import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { Trash2, ShieldAlert, X } from './Icons';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function EraseDataModal({ visible, onClose, onConfirm }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* Tap outside to dismiss */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>

        <View style={styles.dialogCard}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Warning Icon Badge */}
          <View style={styles.iconCircle}>
            <Trash2 size={28} color={colors.danger} />
          </View>

          {/* Heading */}
          <Text style={styles.title}>Erase All App Data?</Text>
          <Text style={styles.subtitle}>
            This action is permanent and will completely reset JABY on this phone.
          </Text>

          {/* Impact list card */}
          <View style={styles.impactCard}>
            <View style={styles.impactRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.impactText}>
                Permanently deletes all messages, voice notes, and media.
              </Text>
            </View>
            <View style={styles.impactRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.impactText}>
                Destroys all private encryption keys and session tokens.
              </Text>
            </View>
            <View style={styles.impactRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.impactText}>
                Logs you out immediately and returns to the setup screen.
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.eraseBtn}
              onPress={() => {
                onClose();
                onConfirm();
              }}
              activeOpacity={0.8}
            >
              <Trash2 size={18} color="#ffffff" />
              <Text style={styles.eraseBtnText}>Erase Everything</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  impactCard: {
    width: '100%',
    backgroundColor: colors.dangerLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 10,
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
    marginTop: 6,
  },
  impactText: {
    flex: 1,
    fontSize: 12,
    color: colors.dangerText,
    lineHeight: 17,
    fontWeight: '500',
  },
  actionButtons: {
    width: '100%',
    gap: 10,
  },
  eraseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.danger,
    paddingVertical: 14,
    borderRadius: 14,
    ...shadows.sm,
  },
  eraseBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
