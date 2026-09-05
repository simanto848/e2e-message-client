import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Phone,
  PhoneOff,
  Video,
  ShieldAlert,
  ShieldCheck,
  X,
  ChevronRight,
} from './Icons';
import { InAppNotification, notificationService } from '../services/notificationService';
import { colors, shadows } from '../theme';

interface Props {
  onOpenChat?: (chatId: string) => void;
  onOpenSecurity?: () => void;
}

export function InAppNotificationBanner({ onOpenChat, onOpenSecurity }: Props) {
  const [currentNotif, setCurrentNotif] = useState<InAppNotification | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const insets = useSafeAreaInsets();
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = notificationService.subscribeInApp(notif => {
      // If a new notification arrives, show it immediately
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }

      setCurrentNotif(notif);

      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
        speed: 14,
      }).start();

      // Calls require explicit user action or engine hangup; messages and security auto-dismiss after 4.5s
      if (notif.type !== 'call') {
        dismissTimerRef.current = setTimeout(() => {
          hideBanner();
        }, 4500);
      }
    });

    return () => {
      unsubscribe();
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const hideBanner = () => {
    Animated.timing(translateY, {
      toValue: -150,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setCurrentNotif(null);
    });
  };

  if (!currentNotif) return null;

  const isCall = currentNotif.type === 'call';
  const isSecurity = currentNotif.type === 'security';

  const handlePressBanner = () => {
    if (currentNotif.onPress) {
      currentNotif.onPress();
    } else if (currentNotif.chatId && onOpenChat) {
      onOpenChat(currentNotif.chatId);
    } else if (isSecurity && onOpenSecurity) {
      onOpenSecurity();
    }
    hideBanner();
  };

  const topOffset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: topOffset + 8,
          transform: [{ translateY }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={handlePressBanner}
        style={[
          styles.container,
          isSecurity ? styles.securityContainer : isCall ? styles.callContainer : styles.messageContainer,
        ]}
      >
        {/* Left Icon */}
        <View
          style={[
            styles.iconBox,
            isSecurity ? styles.securityIconBox : isCall ? styles.callIconBox : styles.messageIconBox,
          ]}
        >
          {isSecurity ? (
            <ShieldAlert size={20} color="#f59e0b" />
          ) : isCall ? (
            <Phone size={20} color="#38bdf8" />
          ) : (
            <Bell size={19} color={colors.primary} />
          )}
        </View>

        {/* Content Column */}
        <View style={styles.contentCol}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {currentNotif.title}
            </Text>
            <Text style={styles.timeText}>Just now</Text>
          </View>
          <Text
            style={[styles.body, isSecurity && styles.securityBody]}
            numberOfLines={2}
          >
            {currentNotif.body}
          </Text>

          {/* Quick Call Actions */}
          {isCall && (
            <View style={styles.callActionsRow}>
              <TouchableOpacity
                style={styles.declineBtn}
                onPress={e => {
                  e.stopPropagation();
                  currentNotif.onAction?.('decline');
                  hideBanner();
                }}
              >
                <PhoneOff size={14} color="#ffffff" />
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={e => {
                  e.stopPropagation();
                  currentNotif.onAction?.('accept');
                  hideBanner();
                }}
              >
                <Phone size={14} color="#ffffff" />
                <Text style={styles.acceptBtnText}>Answer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Close Button */}
        {!isCall && (
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={e => {
              e.stopPropagation();
              hideBanner();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 99999,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    ...shadows.lg,
  },
  messageContainer: {
    borderColor: 'rgba(16, 185, 129, 0.35)',
    backgroundColor: '#09151f',
  },
  callContainer: {
    borderColor: 'rgba(56, 189, 248, 0.45)',
    backgroundColor: '#081726',
  },
  securityContainer: {
    borderColor: 'rgba(245, 158, 11, 0.5)',
    backgroundColor: '#1c1508',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  messageIconBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  callIconBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  securityIconBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  contentCol: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  body: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.82)',
    lineHeight: 16,
  },
  securityBody: {
    color: '#fde68a',
  },
  callActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  declineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  declineBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  acceptBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  closeBtn: {
    padding: 6,
    marginLeft: 6,
  },
});
