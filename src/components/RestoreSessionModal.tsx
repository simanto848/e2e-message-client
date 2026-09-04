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
import { KeyRound, ShieldCheck, RefreshCw, X, Sparkles } from './Icons';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  onRestore: () => void;
  onStartFresh: () => void;
}

export function RestoreSessionModal({ visible, onRestore, onStartFresh }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onStartFresh}
    >
      <View style={styles.backdrop}>
        {/* Tap outside to dismiss as fresh */}
        <TouchableWithoutFeedback onPress={onStartFresh}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>

        <View style={styles.dialogCard}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onStartFresh}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Key Icon Badge */}
          <View style={styles.iconCircle}>
            <KeyRound size={28} color={colors.primary} />
          </View>

          {/* Heading */}
          <Text style={styles.title}>Restore Previous Session?</Text>
          <Text style={styles.subtitle}>
            Encrypted message history and encryption keys from your previous session were found.
          </Text>

          {/* Info Features Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.infoText}>
                <Text style={styles.boldText}>Restore Keys: </Text>
                Decrypt and read all your past messages and conversation history seamlessly.
              </Text>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.infoText}>
                <Text style={styles.boldText}>Zero-Knowledge: </Text>
                Keys are securely decrypted locally on this device using your master PIN.
              </Text>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.infoText}>
                <Text style={styles.boldText}>Start Fresh: </Text>
                Generates a clean new cryptographic identity, starting with an empty inbox.
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.restoreBtn}
              onPress={onRestore}
              activeOpacity={0.85}
            >
              <KeyRound size={18} color="#ffffff" />
              <Text style={styles.restoreBtnText}>Restore Past Messages</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.freshBtn}
              onPress={onStartFresh}
              activeOpacity={0.75}
            >
              <RefreshCw size={15} color={colors.textSecondary} />
              <Text style={styles.freshBtnText}>Start Fresh (New Keys)</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    ...shadows.lg,
    elevation: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  infoCard: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  boldText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionButtons: {
    width: '100%',
    gap: 10,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    width: '100%',
    ...shadows.sm,
    elevation: 3,
  },
  restoreBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  freshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    width: '100%',
  },
  freshBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
});
