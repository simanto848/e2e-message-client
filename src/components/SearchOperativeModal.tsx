import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Search, UserPlus, X, Clock, CheckCircle2 } from './Icons';
import { SearchOperativeResult } from '../types';
import { api } from '../services/api';
import { colors, shadows } from '../theme';
import { Avatar } from './Avatar';

interface Props {
  visible: boolean;
  currentUserId: string;
  onSendRequest: (receiverId: string) => Promise<void>;
  onOpenChat: (peerId: string) => void;
  onClose: () => void;
}

export function SearchOperativeModal({
  visible,
  currentUserId,
  onSendRequest,
  onOpenChat,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchOperativeResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !query.trim()) {
      setResults([]);
      return;
    }

    const search = async () => {
      setLoading(true);
      try {
        const list = await api.searchOperatives(query);
        setResults(list);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(search, 250);
    return () => clearTimeout(debounce);
  }, [query, visible, currentUserId]);

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const handleAction = async (item: SearchOperativeResult) => {
    if (item.connectionStatus === 'connected') {
      onClose();
      onOpenChat(item.id);
    } else if (item.connectionStatus === 'none') {
      await onSendRequest(item.id);
      setResults(prev =>
        prev.map(r => (r.id === item.id ? { ...r, connectionStatus: 'pending_sent' } : r))
      );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <UserPlus size={20} color={colors.primary} />
              <Text style={styles.title}>Find Friends</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={styles.searchBox}>
            <Search size={18} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or username..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoFocus={true}
            />
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
          ) : results.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {query ? 'No users found' : 'Type a name or @username to search'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => (
                <View style={styles.resultCard}>
                  <Avatar uri={item.avatar} name={item.name} size={44} style={styles.avatar} />
                  <View style={styles.infoCol}>
                    <Text style={styles.nameText}>{item.name}</Text>
                    <Text style={styles.handleText}>{item.handle}</Text>
                    <Text style={styles.statusText} numberOfLines={1}>
                      {item.statusMessage}
                    </Text>
                  </View>

                  {/* Dynamic Action Button based on connection status */}
                  {item.connectionStatus === 'connected' ? (
                    <TouchableOpacity
                      style={styles.connectedBtn}
                      onPress={() => handleAction(item)}
                    >
                      <CheckCircle2 size={14} color={colors.primaryDark} />
                      <Text style={styles.connectedBtnText}>Message</Text>
                    </TouchableOpacity>
                  ) : item.connectionStatus === 'pending_sent' ? (
                    <View style={styles.pendingBadge}>
                      <Clock size={12} color="#d97706" />
                      <Text style={styles.pendingBadgeText}>Pending</Text>
                    </View>
                  ) : item.connectionStatus === 'pending_received' ? (
                    <View style={styles.receivedBadge}>
                      <Text style={styles.receivedBadgeText}>Review</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.connectBtn}
                      onPress={() => handleAction(item)}
                    >
                      <UserPlus size={14} color="#ffffff" />
                      <Text style={styles.connectBtnText}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '80%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: colors.surface,
  },
  infoCol: {
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
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    ...shadows.sm,
  },
  connectBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  connectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderColor: '#a7f3d0',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  connectedBtnText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '700',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningLight,
    borderColor: '#fde68a',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pendingBadgeText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '700',
  },
  receivedBadge: {
    backgroundColor: colors.accentBlueLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  receivedBadgeText: {
    color: colors.accentBlue,
    fontSize: 11,
    fontWeight: '700',
  },
});
