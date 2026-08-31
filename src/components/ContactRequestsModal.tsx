import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, FlatList, Image } from 'react-native';
import { UserPlus, X, Check, ShieldCheck, Clock } from './Icons';
import { ContactRequestWithUser } from '../types';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  incomingRequests: ContactRequestWithUser[];
  outgoingRequests: ContactRequestWithUser[];
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  onClose: () => void;
}

export function ContactRequestsModal({
  visible,
  incomingRequests,
  outgoingRequests,
  onAccept,
  onDecline,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <UserPlus size={20} color={colors.primary} />
              <Text style={styles.title}>Contact Requests</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            You can only message someone after you both accept a request — this keeps your chats private.
          </Text>

          {/* Incoming Requests */}
          <Text style={styles.sectionHeader}>
            RECEIVED ({incomingRequests.length})
          </Text>

          {incomingRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <ShieldCheck size={24} color={colors.textMuted} />
              <Text style={styles.emptyText}>No requests right now</Text>
            </View>
          ) : (
            <FlatList
              data={incomingRequests}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={styles.requestCard}>
                  <Image source={{ uri: item.sender.avatar }} style={styles.avatar} />
                  <View style={styles.requestInfo}>
                    <Text style={styles.nameText}>{item.sender.name}</Text>
                    <Text style={styles.handleText}>{item.sender.handle}</Text>
                    <Text style={styles.statusText} numberOfLines={1}>
                      {item.sender.statusMessage}
                    </Text>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => onAccept(item.id)}
                    >
                      <Check size={16} color="#ffffff" />
                      <Text style={styles.btnText}>Accept</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.declineBtn}
                      onPress={() => onDecline(item.id)}
                    >
                      <X size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}

          {/* Outgoing Requests */}
          {outgoingRequests.length > 0 && (
            <>
              <Text style={[styles.sectionHeader, { marginTop: 16 }]}>
                SENT ({outgoingRequests.length})
              </Text>

              <FlatList
                data={outgoingRequests}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <View style={[styles.requestCard, styles.outgoingCard]}>
                    <Image source={{ uri: item.receiver.avatar }} style={styles.avatar} />
                    <View style={styles.requestInfo}>
                      <Text style={styles.nameText}>{item.receiver.name}</Text>
                      <Text style={styles.handleText}>{item.receiver.handle}</Text>
                    </View>
                    <View style={styles.pendingBadge}>
                      <Clock size={12} color="#d97706" />
                      <Text style={styles.pendingText}>Pending</Text>
                    </View>
                  </View>
                )}
              />
            </>
          )}
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
    marginBottom: 10,
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
  description: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outgoingCard: {
    opacity: 0.8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: colors.surface,
  },
  requestInfo: {
    flex: 1,
  },
  nameText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  handleText: {
    fontSize: 12,
    color: colors.primaryDark,
    marginTop: 1,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    ...shadows.sm,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  declineBtn: {
    padding: 8,
    backgroundColor: colors.dangerLight,
    borderRadius: 8,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  pendingText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '700',
  },
});
