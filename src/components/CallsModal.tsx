import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Phone,
  PhoneOff,
  Video,
  Search,
  X,
  ShieldCheck,
  Shield,
  ArrowUpRight,
  ArrowDownLeft,
} from './Icons';
import { Avatar } from './Avatar';
import { colors, shadows } from '../theme';
import type { ChatThread, Message } from '../types';

interface Props {
  visible: boolean;
  chats: ChatThread[];
  onlineUserIds: Set<string>;
  onClose: () => void;
  onCallContact: (chat: ChatThread, type: 'audio' | 'video') => void;
  messages?: Message[];
}

export function CallsModal({
  visible,
  chats,
  onlineUserIds,
  onClose,
  onCallContact,
  messages = [],
}: Props) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'contacts' | 'logs'>('contacts');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract recent call records from chat history & attachments
  const callLogs = useMemo(() => {
    const logs: Array<{
      id: string;
      chat: ChatThread;
      callType: 'audio' | 'video';
      callStatus: string;
      duration: number;
      timestamp: number;
      isOutgoing: boolean;
    }> = [];

    for (const chat of chats) {
      if (chat.lastMessage?.attachment?.type === 'call') {
        const att = chat.lastMessage.attachment;
        logs.push({
          id: chat.lastMessage.id,
          chat,
          callType: att.callType || 'audio',
          callStatus: att.callStatus || 'completed',
          duration: att.duration || 0,
          timestamp: chat.lastMessage.timestamp,
          isOutgoing: chat.lastMessage.senderId !== chat.participant.id,
        });
      }
    }

    // Also scan any in-memory messages with call attachments
    for (const msg of messages) {
      if (msg.attachment?.type === 'call' && !logs.some(l => l.id === msg.id)) {
        const chat = chats.find(c => c.id === msg.chatId || c.participant.id === msg.senderId);
        if (chat) {
          const att = msg.attachment;
          logs.push({
            id: msg.id,
            chat,
            callType: att.callType || 'audio',
            callStatus: att.callStatus || 'completed',
            duration: att.duration || 0,
            timestamp: msg.timestamp,
            isOutgoing: msg.senderId !== chat.participant.id,
          });
        }
      }
    }

    return logs.sort((a, b) => b.timestamp - a.timestamp);
  }, [chats, messages]);

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      c =>
        c.participant.name.toLowerCase().includes(q) ||
        c.participant.id.toLowerCase().includes(q)
    );
  }, [chats, searchQuery]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return callLogs;
    return callLogs.filter(
      l =>
        l.chat.participant.name.toLowerCase().includes(q) ||
        l.chat.participant.id.toLowerCase().includes(q)
    );
  }, [callLogs, searchQuery]);

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.headerTitle}>Encrypted Calls</Text>
              <View style={styles.p2pBadge}>
                <Shield size={12} color={colors.primary} />
                <Text style={styles.p2pBadgeText}>P2P WebRTC</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>
              Direct audio & video with cryptographic SAS verification
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close calls"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Tab Switcher */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'contacts' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('contacts')}
            activeOpacity={0.8}
          >
            <Phone size={15} color={activeTab === 'contacts' ? '#fff' : colors.textMuted} />
            <Text
              style={[
                styles.segmentText,
                activeTab === 'contacts' && styles.segmentTextActive,
              ]}
            >
              Direct Call ({chats.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'logs' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('logs')}
            activeOpacity={0.8}
          >
            <ArrowUpRight size={15} color={activeTab === 'logs' ? '#fff' : colors.textMuted} />
            <Text
              style={[
                styles.segmentText,
                activeTab === 'logs' && styles.segmentTextActive,
              ]}
            >
              Call History ({callLogs.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarWrap}>
          <Search size={16} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={activeTab === 'contacts' ? 'Search contacts to call…' : 'Filter call logs…'}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* List Content */}
        {activeTab === 'contacts' ? (
          <FlatList
            data={filteredChats}
            keyExtractor={item => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <PhoneOff size={36} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No contacts available</Text>
                <Text style={styles.emptySub}>
                  {searchQuery
                    ? 'No operatives matched your query.'
                    : 'Connect with operatives using their Operative ID or invite link to place calls.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isOnline = onlineUserIds.has(item.participant.id);
              return (
                <View style={styles.contactRow}>
                  <View style={styles.avatarContainer}>
                    <Avatar uri={item.participant.avatar} name={item.participant.name} size={46} />
                    <View
                      style={[
                        styles.onlineDot,
                        isOnline ? styles.onlineDotActive : styles.onlineDotInactive,
                      ]}
                    />
                  </View>

                  <View style={styles.contactInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.contactName} numberOfLines={1}>
                        {item.participant.name}
                      </Text>
                      {item.isVerifiedSafetyNumber && (
                        <ShieldCheck size={14} color={colors.primary} style={{ marginLeft: 4 }} />
                      )}
                    </View>
                    <Text style={styles.contactStatus}>
                      {isOnline ? '🟢 Available now' : '⚪ Offline (notify via push)'}
                    </Text>
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionsGroup}>
                    <TouchableOpacity
                      style={styles.callActionButton}
                      onPress={() => onCallContact(item, 'audio')}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Voice call ${item.participant.name}`}
                    >
                      <Phone size={18} color="#fff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.callActionButton, styles.videoActionButton]}
                      onPress={() => onCallContact(item, 'video')}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Video call ${item.participant.name}`}
                    >
                      <Video size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        ) : (
          <FlatList
            data={filteredLogs}
            keyExtractor={item => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Phone size={36} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No call history yet</Text>
                <Text style={styles.emptySub}>
                  Placed and received encrypted voice and video calls will appear here.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isMissed = item.callStatus !== 'completed';
              const CallIcon = isMissed ? PhoneOff : item.callType === 'video' ? Video : Phone;
              const DirectionIcon = item.isOutgoing ? ArrowUpRight : ArrowDownLeft;

              return (
                <View style={styles.contactRow}>
                  <View style={styles.avatarContainer}>
                    <Avatar uri={item.chat.participant.avatar} name={item.chat.participant.name} size={42} />
                  </View>

                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName} numberOfLines={1}>
                      {item.chat.participant.name}
                    </Text>
                    <View style={styles.logMetaRow}>
                      <DirectionIcon
                        size={12}
                        color={isMissed ? colors.danger : colors.primary}
                        style={{ marginRight: 3 }}
                      />
                      <Text style={[styles.logMetaText, isMissed && styles.logMetaMissed]}>
                        {isMissed
                          ? 'Missed call'
                          : `${item.callType === 'video' ? 'Video' : 'Voice'} · ${formatDuration(item.duration)}`}
                      </Text>
                      <Text style={styles.logTimeText}> · {formatTime(item.timestamp)}</Text>
                    </View>
                  </View>

                  <View style={styles.actionsGroup}>
                    <TouchableOpacity
                      style={[styles.callActionButton, isMissed && styles.redialButton]}
                      onPress={() => onCallContact(item.chat, item.callType)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Redial ${item.chat.participant.name}`}
                    >
                      <CallIcon size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  p2pBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  p2pBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  segmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
    ...shadows.sm,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  avatarContainer: {
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  onlineDotActive: {
    backgroundColor: colors.primary,
  },
  onlineDotInactive: {
    backgroundColor: colors.textMuted,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  contactStatus: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  videoActionButton: {
    backgroundColor: '#0284c7', // vibrant cyan/blue for video
  },
  redialButton: {
    backgroundColor: colors.primary,
  },
  logMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  logMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  logMetaMissed: {
    color: colors.danger,
  },
  logTimeText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
