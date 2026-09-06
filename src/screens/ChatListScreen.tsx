import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl, BackHandler } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Search, Pin, ShieldCheck, Flame, Plus, CheckCircle2, UserPlus, X, UserCheck, Check, CheckCheck } from '../components/Icons';
import { ChatThread } from '../types';
import { colors, shadows } from '../theme';
import { formatDisappearingTimer } from '../utils/timerUtils';
import { formatLastSeen } from '../utils/dateUtils';

interface Props {
  chats: ChatThread[];
  currentUserId?: string;
  loading?: boolean;
  incomingRequestsCount: number;
  onlineUserIds: Set<string>;
  lastSeenMap?: Record<string, number>;
  refreshing?: boolean;
  onRefresh?: () => void;
  onSelectChat: (chatId: string) => void;
  onOpenRequestsModal: () => void;
  onOpenSearchModal: () => void;
}

function ChatRowSkeleton() {
  return (
    <View style={[styles.chatCard, styles.skeletonCard]}>
      <View style={[styles.avatar, styles.skeletonBlock]} />
      <View style={styles.chatInfo}>
        <View style={[styles.skeletonBlock, styles.skeletonLineWide]} />
        <View style={[styles.skeletonBlock, styles.skeletonLineNarrow]} />
      </View>
    </View>
  );
}

export function ChatListScreen({
  chats,
  currentUserId,
  loading = false,
  incomingRequestsCount,
  onlineUserIds,
  lastSeenMap,
  refreshing = false,
  onRefresh,
  onSelectChat,
  onOpenRequestsModal,
  onOpenSearchModal,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  // If search query is active, pressing hardware back clears the search bar
  useEffect(() => {
    if (!searchQuery) return;

    const onHardwareBack = () => {
      setSearchQuery('');
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [searchQuery]);

  const filteredChats = chats.filter(c =>
    c.participant?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.participant?.handle?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Incoming Requests Banner */}
      {incomingRequestsCount > 0 && (
        <TouchableOpacity
          style={styles.requestsBanner}
          onPress={onOpenRequestsModal}
          accessibilityRole="button"
          accessibilityLabel={`${incomingRequestsCount} pending contact requests. Review.`}
        >
          <ShieldCheck size={18} color={colors.primary} />
          <Text style={styles.requestsBannerText}>
            {incomingRequestsCount} pending contact request{incomingRequestsCount > 1 ? 's' : ''}
          </Text>
          <View style={styles.reviewBadge}>
            <Text style={styles.reviewBadgeText}>Review</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Ribbon */}
      <View style={styles.ribbon}>
        <ShieldCheck size={12} color={colors.primaryDark} />
        <Text style={styles.ribbonText}>END-TO-END ENCRYPTED & SECURE</Text>
      </View>

      {/* Chat List */}
      <FlatList
        data={filteredChats}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surface}
            />
          ) : undefined
        }
        ListEmptyComponent={
          loading ? (
            <View>
              <ChatRowSkeleton />
              <ChatRowSkeleton />
              <ChatRowSkeleton />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <UserCheck size={36} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>
                Search for people by their username to start a secure chat.
              </Text>
              <TouchableOpacity style={styles.emptySearchBtn} onPress={onOpenSearchModal}>
                <UserPlus size={16} color="#ffffff" />
                <Text style={styles.emptySearchBtnText}>Find People</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item }) => {
          const participant = item.participant;
          if (!participant) return null;
          const lastMsg = item.lastMessage;
          const isOnline = onlineUserIds.has(participant.id);
          const lastActiveAt = lastSeenMap?.[participant.id] ?? participant.lastActiveAt;
          const isLastMsgMine = !!(lastMsg && currentUserId && lastMsg.senderId === currentUserId);

          return (
            <TouchableOpacity
              style={[styles.chatCard, item.pinned && styles.pinnedCard]}
              onPress={() => onSelectChat(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open chat with ${participant.name}`}
            >
              {/* Avatar */}
              <View style={styles.avatarContainer}>
                <Avatar uri={participant.avatar} name={participant.name} size={48} style={styles.avatar} />
                {isOnline ? (
                  <View style={styles.onlineDot} />
                ) : (
                  <View style={styles.offlineDot} />
                )}
              </View>

              {/* Chat Info */}
              <View style={styles.chatInfo}>
                <View style={styles.nameRow}>
                  <View style={styles.nameBadges}>
                    <Text style={styles.nameText} numberOfLines={1} ellipsizeMode="tail">{participant.name}</Text>
                    {item.isVerifiedSafetyNumber && (
                      <CheckCircle2 size={13} color={colors.primary} />
                    )}
                  </View>

                  <View style={styles.nameRightCol}>
                    <Text style={styles.timeText}>
                      {lastMsg
                        ? new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'New'}
                    </Text>
                    {!isOnline && lastActiveAt ? (
                      <Text style={styles.lastSeenListText} numberOfLines={1}>
                        {formatLastSeen(lastActiveAt)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.messageRow}>
                  <View style={styles.lastMessageContainer}>
                    {isLastMsgMine && (
                      <View style={styles.statusCheckWrapper}>
                        {lastMsg?.status === 'read' ? (
                          <CheckCheck size={13} color="#0284c7" />
                        ) : lastMsg?.status === 'delivered' ? (
                          <CheckCheck size={13} color={colors.textMuted} />
                        ) : (
                          <Check size={13} color={colors.textMuted} />
                        )}
                      </View>
                    )}
                    <Text style={styles.lastMessageText} numberOfLines={1}>
                      {item.isTyping ? (
                        <Text style={styles.typingText}>typing...</Text>
                      ) : lastMsg ? (
                        lastMsg.isDeletedForEveryone ? (
                          'Message deleted'
                        ) : lastMsg.attachment?.type === 'image' && !lastMsg.text ? (
                          '📷 Photo'
                        ) : lastMsg.attachment?.type === 'audio' && !lastMsg.text ? (
                          '🎤 Voice message'
                        ) : (
                          lastMsg.text || 'Encrypted message'
                        )
                      ) : (
                        'No messages yet'
                      )}
                    </Text>
                  </View>

                  <View style={styles.badgeRow}>
                    {item.disappearingTimer > 0 && (
                      <View style={styles.timerPill}>
                        <Flame size={10} color="#d97706" />
                        <Text style={styles.timerPillText}>{formatDisappearingTimer(item.disappearingTimer)}</Text>
                      </View>
                    )}

                    {item.unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                      </View>
                    )}

                    {item.pinned && <Pin size={12} color={colors.primary} />}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Floating Action Button (Search Operatives) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={onOpenSearchModal}
        accessibilityRole="button"
        accessibilityLabel="Search for people to chat"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Plus size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
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
  requestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.warningLight,
    borderColor: '#fde68a',
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  requestsBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestsBannerText: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '700',
  },
  reviewBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  reviewBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingVertical: 6,
    marginTop: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#a7f3d0',
  },
  ribbonText: {
    color: '#065f46',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 80,
    flexGrow: 1,
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  pinnedCard: {
    borderColor: '#a7f3d0',
    backgroundColor: '#f0fdf4',
  },
  skeletonCard: {
    opacity: 0.6,
  },
  skeletonBlock: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
  },
  skeletonLineWide: {
    height: 13,
    width: '55%',
    marginBottom: 8,
  },
  skeletonLineNarrow: {
    height: 11,
    width: '35%',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceElevated,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  offlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  chatInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  nameRightCol: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  lastSeenListText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timeText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  lastMessageContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  statusCheckWrapper: {
    marginRight: 4,
  },
  lastMessageText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  typingText: {
    color: colors.primaryDark,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.warningLight,
    borderColor: '#fde68a',
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timerPillText: {
    color: '#92400e',
    fontSize: 10,
    fontWeight: '800',
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptySearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 10,
    ...shadows.sm,
  },
  emptySearchBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
});
