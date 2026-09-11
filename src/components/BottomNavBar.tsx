import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  MessageSquare,
  UserPlus,
  Phone,
  Settings,
} from './Icons';
import { colors, shadows } from '../theme';
import type { BottomTabId } from '../navigation/types';

interface Props {
  activeTab: BottomTabId;
  unreadCount?: number;
  requestsCount?: number;
  onTabPress: (tab: BottomTabId) => void;
}

interface TabItemProps {
  id: BottomTabId;
  label: string;
  badge?: number;
  active: boolean;
  onPress: () => void;
  renderIcon: (color: string) => React.ReactNode;
}

function NavTabButton({
  label,
  badge = 0,
  active,
  onPress,
  renderIcon,
}: TabItemProps) {
  const scaleAnim = useRef<Animated.Value | null>(null);
  if (!scaleAnim.current) {
    scaleAnim.current = new Animated.Value(1);
  }

  useEffect(() => {
    const anim = scaleAnim.current;
    if (!anim) return;
    if (active) {
      Animated.sequence([
        Animated.spring(anim, {
          toValue: 1.12,
          friction: 4,
          tension: 140,
          useNativeDriver: true,
        }),
        Animated.spring(anim, {
          toValue: 1,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(anim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [active]);

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onPress();
  };

  const iconColor = active ? colors.primary : colors.textMuted;

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
    >
      <View style={[styles.pillWrap, active && styles.pillWrapActive]}>
        <Animated.View style={[styles.iconContainer, { transform: [{ scale: scaleAnim.current! }] }]}>
          {renderIcon(iconColor)}
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
            </View>
          )}
        </Animated.View>
        <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
          {label}
        </Text>
        {active && <View style={styles.activeGlowDot} />}
      </View>
    </TouchableOpacity>
  );
}

export function BottomNavBar({
  activeTab,
  unreadCount = 0,
  requestsCount = 0,
  onTabPress,
}: Props) {
  const insets = useSafeAreaInsets();

  const tabs: Array<{
    id: BottomTabId;
    label: string;
    badge?: number;
    renderIcon: (color: string) => React.ReactNode;
  }> = [
    {
      id: 'chats',
      label: 'Chat',
      badge: unreadCount,
      renderIcon: color => <MessageSquare size={22} color={color} strokeWidth={2.2} />,
    },
    {
      id: 'requests',
      label: 'Request',
      badge: requestsCount,
      renderIcon: color => <UserPlus size={22} color={color} strokeWidth={2.2} />,
    },
    {
      id: 'calls',
      label: 'Calls',
      renderIcon: color => <Phone size={22} color={color} strokeWidth={2.2} />,
    },
    {
      id: 'settings',
      label: 'Settings',
      renderIcon: color => <Settings size={22} color={color} strokeWidth={2.2} />,
    },
  ];

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        {tabs.map(tab => (
          <NavTabButton
            key={tab.id}
            id={tab.id}
            label={tab.label}
            badge={tab.badge}
            active={activeTab === tab.id}
            onPress={() => onTabPress(tab.id)}
            renderIcon={tab.renderIcon}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 4,
    paddingHorizontal: 2,
    ...shadows.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  pillWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 14,
    minHeight: 52,
    width: '100%',
  },
  pillWrapActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -13,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.surface,
    ...shadows.sm,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  activeGlowDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 2,
  },
});
