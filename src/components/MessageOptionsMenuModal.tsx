import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  Reply,
  Copy,
  Forward,
  Shield,
  Trash2,
  X,
} from './Icons';
import { colors, shadows } from '../theme';
import type { Message } from '../types';

interface Props {
  visible: boolean;
  message: Message | null;
  isMe: boolean;
  onClose: () => void;
  onReply: (message: Message) => void;
  onCopy?: () => void;
  onForward?: (message: Message) => void;
  onInspectCiphertext?: (message: Message) => void;
  onDeleteForMe?: (messageId: string) => void;
  onDeleteForEveryone?: (messageId: string) => void;
}

export function MessageOptionsMenuModal({
  visible,
  message,
  isMe,
  onClose,
  onReply,
  onCopy,
  onForward,
  onInspectCiphertext,
  onDeleteForMe,
  onDeleteForEveryone,
}: Props) {
  const insets = useSafeAreaInsets();

  if (!message) return null;

  const handleAction = (callback?: () => void) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onClose();
    if (callback) {
      setTimeout(() => {
        callback();
      }, 120);
    }
  };

  const previewSnippet =
    message.text ||
    (message.attachment?.type === 'image'
      ? '📷 Image attachment'
      : message.attachment?.type === 'audio'
      ? '🎤 Voice note'
      : message.attachment?.type === 'call'
      ? '📞 Call log'
      : 'Encrypted message');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
          onPress={e => e.stopPropagation()}
        >
          {/* Handle bar */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Message snippet header */}
          <View style={styles.snippetWrap}>
            <View style={styles.snippetBadge}>
              <Text style={styles.snippetBadgeText}>
                {isMe ? 'Your message' : 'Incoming message'}
              </Text>
            </View>
            <Text style={styles.snippetText} numberOfLines={2}>
              "{previewSnippet}"
            </Text>
          </View>

          {/* Menu Actions */}
          <View style={styles.actionsList}>
            {/* 1. Reply (works for any message including your own) */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => handleAction(() => onReply(message))}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, styles.replyIconBg]}>
                <Reply size={18} color={colors.primary} />
              </View>
              <View style={styles.actionTextWrap}>
                <Text style={styles.actionTitle}>Reply</Text>
                <Text style={styles.actionSub}>
                  {isMe ? 'Reply to your own message' : 'Quote and respond to this message'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* 2. Copy (if text exists) */}
            {Boolean(message.text) && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => handleAction(onCopy)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, styles.copyIconBg]}>
                  <Copy size={18} color={colors.accentBlue} />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionTitle}>Copy Text</Text>
                  <Text style={styles.actionSub}>Copy message to clipboard</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* 3. Forward */}
            {onForward && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => handleAction(() => onForward(message))}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, styles.forwardIconBg]}>
                  <Forward size={18} color="#0284c7" />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionTitle}>Forward</Text>
                  <Text style={styles.actionSub}>Share with another operative</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* 4. Inspect Ciphertext */}
            {onInspectCiphertext && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => handleAction(() => onInspectCiphertext(message))}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, styles.inspectIconBg]}>
                  <Shield size={18} color={colors.accentPurple} />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionTitle}>Inspect Encryption</Text>
                  <Text style={styles.actionSub}>View E2EE payload, auth tag & keys</Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.divider} />

            {/* 5. Delete for Me */}
            {onDeleteForMe && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => handleAction(() => onDeleteForMe(message.id))}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, styles.deleteMeIconBg]}>
                  <Trash2 size={18} color={colors.textSecondary} />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionTitle}>Delete for Me</Text>
                  <Text style={styles.actionSub}>Remove from this device only</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* 6. Delete for Everyone */}
            {onDeleteForEveryone && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => handleAction(() => onDeleteForEveryone(message.id))}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, styles.deleteEveryoneIconBg]}>
                  <Trash2 size={18} color={colors.danger} />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={[styles.actionTitle, styles.dangerTitle]}>
                    Delete for Everyone
                  </Text>
                  <Text style={styles.actionSub}>
                    Permanently delete for both sides in real-time
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Cancel button */}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  snippetWrap: {
    backgroundColor: colors.surfaceElevated,
    padding: 12,
    borderRadius: 14,
    marginTop: 6,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  snippetBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  snippetBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryText,
  },
  snippetText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
  actionsList: {
    gap: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  replyIconBg: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  copyIconBg: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
  },
  forwardIconBg: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
  },
  inspectIconBg: {
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
  },
  deleteMeIconBg: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
  },
  deleteEveryoneIconBg: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dangerTitle: {
    color: colors.danger,
  },
  actionSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
  cancelBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
