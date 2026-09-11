import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Phone,
  Video,
  Search,
  X,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  PhoneOff,
  Clock,
} from '../components/Icons';
import { Avatar } from '../components/Avatar';
import { colors, shadows } from '../theme';
import type { ChatThread, Message } from '../types';

interface Props {
  chats: ChatThread[];
  onlineUserIds: Set<string>;
  messages?: Message[];
  onStartCall: (chat: ChatThread, type: 'audio' | 'video') => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

type CallsTab = 'direct' | 'history';

interface CallRecord {
  id: string;
  chat: ChatThread;
  callType: 'audio' | 'video';
  callStatus: string;
  duration: number;
  timestamp: number;
  isOutgoing: boolean;
}

export function CallsScreen({
  chats,
  onlineUserIds,
  messages = [],
  onStartCall,
  onRefresh,
  refreshing = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<CallsTab>('direct');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract call logs from chat last messages and memory messages
  const callLogs = useMemo(() => {
    const logs: CallRecord[] = [];

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

    for (const msg of messages) {
      if (msg.attachment?.type === 'call' && !logs.some(l => l.id === msg.id)) {
        const chat = chats.find(
          c => c.id === msg.chatId || c.participant.id === msg.senderId || c.participant.id === msg.receiverId
        );
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
    if (!searchQuery.trim()) return chats;
    const q = searchQuery.toLowerCase();
    return chats.filter(
      c =>
        c.participant.name.toLowerCase().includes(q) ||
        c.participant.handle.toLowerCase().includes(q)
    );
  }, [chats, searchQuery]);

  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  const formatTimestamp = (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const handleCall = (chat: ChatThread, type: 'audio' | 'video') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onStartCall(chat, type);
  };

  return (
    <View style={styles.container}>
      {/* Encryption Top Banner */}
      <View style={styles.banner}>
        <ShieldCheck size={16} color={colors.primary} />
        <Text style={styles.bannerText}>
          P2P WebRTC · Cryptographic SAS Voice & Video Verification
        </Text>
      </View>

      {/* Segmented Filter Pills */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'direct' && styles.tabButtonActive]}
          onPress={() => {
            try {
              Haptics.selectionAsync();
            } catch {}
            setActiveTab('direct');
          }}
          activeOpacity={0.8}
        >
          <Phone
            size={14}
            color={activeTab === 'direct' ? '#ffffff' : colors.textSecondary}
          />
          <Text
            style={[styles.tabButtonText, activeTab === 'direct' && styles.tabButtonTextActive]}
          >
            Direct Call ({chats.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
          onPress={() => {
            try {
              Haptics.selectionAsync();
            } catch {}
            setActiveTab('history');
          }}
          activeOpacity={0.8}
        >
          <Clock
            size={14}
            color={activeTab === 'history' ? '#ffffff' : colors.textSecondary}
          />
          <Text
            style={[styles.tabButtonText, activeTab === 'history' && styles.tabButtonTextActive]}
          >
            Call History ({callLogs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB 1: DIRECT CALL CONTACTS */}
      {activeTab === 'direct' && (
        <View style={styles.tabContent}>
          <View style={styles.searchBarContainer}>
            <Search size={18} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search contacts to call..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {filteredChats.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <PhoneOff size={28} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No matching contacts' : 'No contacts available'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No contacts match "${searchQuery}".`
                  : 'Add contacts through the Request tab to initiate encrypted P2P calls.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredChats}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                onRefresh ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={[colors.primary]}
                    tintColor={colors.primary}
                  />
                ) : undefined
              }
              renderItem={({ item }) => {
                const isOnline = onlineUserIds.has(item.participant.id);

                return (
                  <View style={styles.contactCard}>
                    <Avatar uri={item.participant.avatar} name={item.participant.name} size={46} />
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName} numberOfLines={1}>
                        {item.participant.name}
                      </Text>
                      <View style={styles.statusRow}>
                        <View
                          style={[
                            styles.statusDot,
                            isOnline ? styles.statusDotOnline : styles.statusDotOffline,
                          ]}
                        />
                        <Text style={styles.statusText}>
                          {isOnline ? 'Online' : 'Offline (notify via push)'}
                        </Text>
                      </View>
                    </View>

                    {/* Dual Voice & Video Call Action Buttons */}
                    <View style={styles.callButtonsRow}>
                      <TouchableOpacity
                        style={styles.voiceButton}
                        onPress={() => handleCall(item, 'audio')}
                        activeOpacity={0.8}
                        accessibilityLabel={`Voice call ${item.participant.name}`}
                      >
                        <Phone size={16} color="#ffffff" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.videoButton}
                        onPress={() => handleCall(item, 'video')}
                        activeOpacity={0.8}
                        accessibilityLabel={`Video call ${item.participant.name}`}
                      >
                        <Video size={16} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* TAB 2: CALL HISTORY */}
      {activeTab === 'history' && (
        <View style={styles.tabContent}>
          {callLogs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Clock size={28} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No call records yet</Text>
              <Text style={styles.emptySubtitle}>
                Completed and missed calls with your contacts will appear here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={callLogs}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isMissed = item.callStatus === 'missed';
                return (
                  <View style={styles.historyCard}>
                    <Avatar
                      uri={item.chat.participant.avatar}
                      name={item.chat.participant.name}
                      size={44}
                    />
                    <View style={styles.historyInfo}>
                      <Text style={styles.contactName} numberOfLines={1}>
                        {item.chat.participant.name}
                      </Text>
                      <View style={styles.historyMetaRow}>
                        {item.isOutgoing ? (
                          <ArrowUpRight size={13} color={colors.primary} />
                        ) : isMissed ? (
                          <PhoneOff size={13} color={colors.danger} />
                        ) : (
                          <ArrowDownLeft size={13} color="#0284c7" />
                        )}
                        <Text
                          style={[
                            styles.historyMetaText,
                            isMissed && { color: colors.danger, fontWeight: '700' },
                          ]}
                        >
                          {isMissed
                            ? 'Missed'
                            : item.isOutgoing
                              ? 'Outgoing'
                              : 'Incoming'}
                          {item.duration > 0 ? ` · ${formatDuration(item.duration)}` : ''}
                        </Text>
                        <Text style={styles.historyTimeText}>
                          · {formatTimestamp(item.timestamp)}
                        </Text>
                      </View>
                    </View>

                    {/* Redial button */}
                    <TouchableOpacity
                      style={styles.redialButton}
                      onPress={() => handleCall(item.chat, item.callType)}
                      activeOpacity={0.8}
                    >
                      {item.callType === 'video' ? (
                        <Video size={16} color={colors.primary} />
                      ) : (
                        <Phone size={16} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primaryLight,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#a7f3d0',
  },
  bannerText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  tabContent: {
    flex: 1,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  historyInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  contactName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusDotOnline: {
    backgroundColor: colors.primary,
  },
  statusDotOffline: {
    backgroundColor: colors.textMuted,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  historyMetaText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  historyTimeText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  callButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  videoButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  redialButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
