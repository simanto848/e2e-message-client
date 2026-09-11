import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Keyboard,
  RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Search,
  UserPlus,
  X,
  Check,
  ShieldCheck,
  Clock,
  MessageSquare,
  Sparkles,
} from '../components/Icons';
import { ContactRequestWithUser, SearchOperativeResult } from '../types';
import { api } from '../services/api';
import { logger } from '../utils/logger';
import { colors, shadows } from '../theme';
import { Avatar } from '../components/Avatar';

interface Props {
  incomingRequests: ContactRequestWithUser[];
  outgoingRequests: ContactRequestWithUser[];
  currentUserId?: string;
  onAcceptRequest: (requestId: string) => void;
  onDeclineRequest: (requestId: string) => void;
  onSendRequest: (receiverId: string) => Promise<void>;
  onOpenChatWithPeer?: (peerId: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

type TabType = 'search' | 'received' | 'sent';

export function RequestsScreen({
  incomingRequests,
  outgoingRequests,
  currentUserId,
  onAcceptRequest,
  onDeclineRequest,
  onSendRequest,
  onOpenChatWithPeer,
  onRefresh,
  refreshing = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>(
    incomingRequests.length > 0 ? 'received' : 'search'
  );
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchOperativeResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setSearchResults([]);
    }
  };

  // Debounced search for operatives
  useEffect(() => {
    const trimmed = query.trim();
    if (activeTab !== 'search' || !trimmed) {
      return;
    }

    let cancelled = false;
    const executeSearch = async () => {
      setSearchLoading(true);
      try {
        const list = await api.searchOperatives(trimmed);
        if (!cancelled) {
          const filtered = currentUserId ? list.filter(item => item.id !== currentUserId) : list;
          setSearchResults(filtered);
        }
      } catch (err) {
        if (!cancelled) {
          logger.error('RequestsScreen', 'Search error:', err);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    };

    const debounce = setTimeout(executeSearch, 250);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [query, activeTab, currentUserId]);

  const handleSend = async (targetUserId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setSendingIds(prev => new Set(prev).add(targetUserId));
    try {
      await onSendRequest(targetUserId);
      setSearchResults(prev =>
        prev.map(item =>
          item.id === targetUserId ? { ...item, connectionStatus: 'pending_sent' } : item
        )
      );
    } catch (err) {
      logger.error('RequestsScreen', 'Send request failed:', err);
    } finally {
      setSendingIds(prev => {
        const next = new Set(prev);
        next.delete(targetUserId);
        return next;
      });
    }
  };

  const handleTabChange = (tab: TabType) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    setActiveTab(tab);
    if (tab !== 'search') {
      Keyboard.dismiss();
      setSearchResults([]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Banner / Privacy Note */}
      <View style={styles.privacyBanner}>
        <ShieldCheck size={16} color={colors.primary} />
        <Text style={styles.privacyBannerText}>
          Private Network · Messaging requires mutual approval
        </Text>
      </View>

      {/* Segmented Filter Pills */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'search' && styles.tabButtonActive]}
          onPress={() => handleTabChange('search')}
          activeOpacity={0.8}
        >
          <Search
            size={14}
            color={activeTab === 'search' ? '#ffffff' : colors.textSecondary}
          />
          <Text
            style={[styles.tabButtonText, activeTab === 'search' && styles.tabButtonTextActive]}
          >
            Find Friends
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'received' && styles.tabButtonActive]}
          onPress={() => handleTabChange('received')}
          activeOpacity={0.8}
        >
          <UserPlus
            size={14}
            color={activeTab === 'received' ? '#ffffff' : colors.textSecondary}
          />
          <Text
            style={[styles.tabButtonText, activeTab === 'received' && styles.tabButtonTextActive]}
          >
            Received
          </Text>
          {incomingRequests.length > 0 && (
            <View
              style={[
                styles.pillBadge,
                activeTab === 'received' ? styles.pillBadgeActive : styles.pillBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.pillBadgeText,
                  activeTab === 'received' && styles.pillBadgeTextActive,
                ]}
              >
                {incomingRequests.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'sent' && styles.tabButtonActive]}
          onPress={() => handleTabChange('sent')}
          activeOpacity={0.8}
        >
          <Clock
            size={14}
            color={activeTab === 'sent' ? '#ffffff' : colors.textSecondary}
          />
          <Text
            style={[styles.tabButtonText, activeTab === 'sent' && styles.tabButtonTextActive]}
          >
            Sent
          </Text>
          {outgoingRequests.length > 0 && (
            <View
              style={[
                styles.pillBadge,
                activeTab === 'sent' ? styles.pillBadgeActive : styles.pillBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.pillBadgeText,
                  activeTab === 'sent' && styles.pillBadgeTextActive,
                ]}
              >
                {outgoingRequests.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* TAB 1: FIND FRIENDS */}
      {activeTab === 'search' && (
        <View style={styles.tabContent}>
          <View style={styles.searchBarContainer}>
            <Search size={18} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or @handle..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={handleQueryChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => handleQueryChange('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {searchLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Searching network...</Text>
            </View>
          )}

          {!searchLoading && query.trim().length > 0 && searchResults.length === 0 && (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Search size={28} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No operatives found</Text>
              <Text style={styles.emptySubtitle}>
                No matches found for &quot;{query}&quot;. Check spelling or try a handle.
              </Text>
            </View>
          )}

          {!searchLoading && query.trim().length === 0 && (
            <View style={styles.heroEmptyContainer}>
              <View style={styles.heroIconCircle}>
                <Sparkles size={32} color={colors.primary} />
              </View>
              <Text style={styles.heroTitle}>Discover Contacts</Text>
              <Text style={styles.heroSubtitle}>
                Search by full name or handle to invite operatives to your encrypted enclave.
              </Text>
            </View>
          )}

          <FlatList
            data={searchResults}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSending = sendingIds.has(item.id);
              const isConnected = item.connectionStatus === 'connected';
              const isRequestSent = item.connectionStatus === 'pending_sent';
              const isRequestReceived = item.connectionStatus === 'pending_received';

              return (
                <View style={styles.userCard}>
                  <Avatar uri={item.avatar} name={item.name} size={46} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.userHandle}>{item.handle}</Text>
                    {item.statusMessage ? (
                      <Text style={styles.userBio} numberOfLines={1}>
                        {item.statusMessage}
                      </Text>
                    ) : null}
                  </View>

                  {/* Actions */}
                  {isConnected ? (
                    <TouchableOpacity
                      style={styles.messageButton}
                      onPress={() => onOpenChatWithPeer?.(item.id)}
                      activeOpacity={0.8}
                    >
                      <MessageSquare size={14} color="#ffffff" />
                      <Text style={styles.messageButtonText}>Chat</Text>
                    </TouchableOpacity>
                  ) : isRequestSent ? (
                    <View style={styles.pendingBadge}>
                      <Clock size={12} color={colors.textMuted} />
                      <Text style={styles.pendingBadgeText}>Sent</Text>
                    </View>
                  ) : isRequestReceived ? (
                    <TouchableOpacity
                      style={styles.reviewButton}
                      onPress={() => handleTabChange('received')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.reviewButtonText}>Review</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => handleSend(item.id)}
                      disabled={isSending}
                      activeOpacity={0.8}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <UserPlus size={14} color="#ffffff" />
                          <Text style={styles.addButtonText}>Add</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        </View>
      )}

      {/* TAB 2: RECEIVED REQUESTS */}
      {activeTab === 'received' && (
        <View style={styles.tabContent}>
          {incomingRequests.length === 0 ? (
            <View style={styles.heroEmptyContainer}>
              <View style={styles.heroIconCircle}>
                <ShieldCheck size={32} color={colors.primary} />
              </View>
              <Text style={styles.heroTitle}>No Incoming Requests</Text>
              <Text style={styles.heroSubtitle}>
                When another operative sends you a contact invitation, it will appear here for you to accept or decline.
              </Text>
            </View>
          ) : (
            <FlatList
              data={incomingRequests}
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
              renderItem={({ item }) => (
                <View style={styles.requestCard}>
                  <Avatar uri={item.sender.avatar} name={item.sender.name} size={46} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {item.sender.name}
                    </Text>
                    <Text style={styles.userHandle}>{item.sender.handle}</Text>
                    {item.sender.statusMessage ? (
                      <Text style={styles.userBio} numberOfLines={1}>
                        {item.sender.statusMessage}
                      </Text>
                    ) : null}
                  </View>

                  {/* Accept / Decline actions */}
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={styles.declineButton}
                      onPress={() => {
                        try {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        } catch {}
                        onDeclineRequest(item.id);
                      }}
                      activeOpacity={0.7}
                      accessibilityLabel="Decline request"
                    >
                      <X size={16} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.acceptButton}
                      onPress={() => {
                        try {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        } catch {}
                        onAcceptRequest(item.id);
                      }}
                      activeOpacity={0.8}
                      accessibilityLabel="Accept request"
                    >
                      <Check size={16} color="#ffffff" />
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* TAB 3: SENT REQUESTS */}
      {activeTab === 'sent' && (
        <View style={styles.tabContent}>
          {outgoingRequests.length === 0 ? (
            <View style={styles.heroEmptyContainer}>
              <View style={styles.heroIconCircle}>
                <Clock size={32} color={colors.textMuted} />
              </View>
              <Text style={styles.heroTitle}>No Sent Requests</Text>
              <Text style={styles.heroSubtitle}>
                You haven&apos;t sent any pending invitations. Use Find Friends to connect with others.
              </Text>
            </View>
          ) : (
            <FlatList
              data={outgoingRequests}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.requestCard}>
                  <Avatar uri={item.receiver.avatar} name={item.receiver.name} size={46} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {item.receiver.name}
                    </Text>
                    <Text style={styles.userHandle}>{item.receiver.handle}</Text>
                    {item.receiver.statusMessage ? (
                      <Text style={styles.userBio} numberOfLines={1}>
                        {item.receiver.statusMessage}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.pendingBadge}>
                    <Clock size={12} color={colors.warning} />
                    <Text style={[styles.pendingBadgeText, { color: colors.warning }]}>
                      Pending
                    </Text>
                  </View>
                </View>
              )}
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
  privacyBanner: {
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
  privacyBannerText: {
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
  pillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  pillBadgeInactive: {
    backgroundColor: colors.primaryLight,
  },
  pillBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  pillBadgeTextActive: {
    color: '#ffffff',
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
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  userName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  userHandle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  userBio: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    ...shadows.sm,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    ...shadows.sm,
  },
  messageButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  reviewButton: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  reviewButtonText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingBadgeText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  declineButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    ...shadows.sm,
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
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
  heroEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 36,
  },
  heroIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    ...shadows.sm,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});
