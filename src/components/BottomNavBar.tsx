import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, UserPlus, Ticket, Settings } from './Icons';
import { colors, shadows } from '../theme';
import type { BottomTabId } from '../navigation/types';

interface Props {
  activeTab: BottomTabId;
  unreadCount?: number;
  requestsCount?: number;
  inviteCount?: number;
  onTabPress: (tab: BottomTabId) => void;
}

function MessageIcon({ size, color }: { size: number; color: string }) {
  // Inline chat-bubble glyph (no new dep) matching Icons stroke style.
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size - 4 }}>💬</Text>
    </View>
  );
}

export function BottomNavBar({ activeTab, unreadCount = 0, requestsCount = 0, inviteCount = 0, onTabPress }: Props) {
  const insets = useSafeAreaInsets();

  const tabs: { id: BottomTabId; label: string; badge?: number; render: (active: boolean) => React.ReactNode }[] = [
    {
      id: 'chats',
      label: 'Chats',
      badge: unreadCount,
      render: () => <MessageIcon size={24} color={activeTab === 'chats' ? colors.primary : colors.textSecondary} />,
    },
    {
      id: 'search',
      label: 'Find',
      render: (active) => <Search size={22} color={active ? colors.primary : colors.textSecondary} />,
    },
    {
      id: 'requests',
      label: 'Requests',
      badge: requestsCount,
      render: (active) => <UserPlus size={22} color={active ? colors.primary : colors.textSecondary} />,
    },
    {
      id: 'invites',
      label: 'Invites',
      badge: inviteCount,
      render: (active) => <Ticket size={22} color={active ? colors.primary : colors.textSecondary} />,
    },
    {
      id: 'settings',
      label: 'Settings',
      render: (active) => <Settings size={22} color={active ? colors.primary : colors.textSecondary} />,
    },
  ];

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tab}
              onPress={() => onTabPress(tab.id)}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={styles.iconWrap}>
                {tab.render(active)}
                {!!tab.badge && tab.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tab.badge > 99 ? '99+' : String(tab.badge)}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
              {active && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    paddingHorizontal: 4,
    ...shadows.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 2,
    minHeight: 56,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 26,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -14,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.primaryDark,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 2,
  },
});
