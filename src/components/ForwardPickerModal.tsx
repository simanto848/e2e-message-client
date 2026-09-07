import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Search, X, Check, Send } from './Icons';
import { Avatar } from './Avatar';
import { colors, shadows } from '../theme';

export interface ForwardTarget {
  id: string;
  name: string;
  handle?: string;
  avatar?: string;
}

interface Props {
  visible: boolean;
  threads: ForwardTarget[];
  excludeChatId?: string | null;
  sending: boolean;
  onClose: () => void;
  onForward: (chatIds: string[]) => void;
}

const MAX_TARGETS = 5;

/**
 * Multi-select forward picker (Messenger-style): search chats, tap up to 5,
 * hit Forward. The engine re-encrypts content per recipient — this UI only
 * collects the destination set.
 */
export function ForwardPickerModal({ visible, threads, excludeChatId, sending, onClose, onForward }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setQuery('');
      setSelected(new Set());
    }
  }, [visible ]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter(
      t =>
        t.id !== excludeChatId &&
        (!q || t.name.toLowerCase().includes(q) || (t.handle || '').toLowerCase().includes(q))
    );
  }, [threads, excludeChatId, query]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_TARGETS) {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Forward Message</Text>
              <Text style={styles.subtitle}>Select up to {MAX_TARGETS} chats</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close forward picker"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search chats..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={15} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={options}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No chats found</Text>
              </View>
            }
            renderItem={({ item }) => {
              const active = selected.has(item.id);
              return (
                <TouchableOpacity
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => toggle(item.id)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={`Forward to ${item.name}`}
                >
                  <Avatar uri={item.avatar} name={item.name} size={40} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {!!item.handle && (
                      <Text style={styles.rowHandle} numberOfLines={1}>
                        {item.handle}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.check, active && styles.checkActive]}>
                    {active && <Check size={14} color="#ffffff" />}
                  </View>
                </TouchableOpacity>
              );
            }}
          />

          <TouchableOpacity
            style={[styles.sendBtn, (selected.size === 0 || sending) && styles.sendBtnDisabled]}
            onPress={() => onForward(Array.from(selected))}
            disabled={selected.size === 0 || sending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Forward to ${selected.size} chats`}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Send size={16} color="#ffffff" />
                <Text style={styles.sendText}>
                  Forward{selected.size > 0 ? ` (${selected.size})` : ''}
                </Text>
              </>
            )}
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
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    padding: 20,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  list: {
    maxHeight: 320,
  },
  listContent: {
    gap: 4,
    paddingBottom: 8,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowActive: {
    backgroundColor: colors.primaryLight,
    borderColor: '#a7f3d0',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rowHandle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 8,
    ...shadows.sm,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
