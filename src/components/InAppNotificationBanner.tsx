import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  StatusBar,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  Bell,
  Phone,
  PhoneOff,
  Video,
  ShieldAlert,
  X,
  Send,
  Paperclip,
  ExternalLink,
} from './Icons';
import { InAppNotification, notificationService } from '../services/notificationService';
import { colors, shadows } from '../theme';

export interface InAppNotificationBannerProps {
  onOpenChat?: (chatId: string) => void;
  onOpenSecurity?: () => void;
  onQuickReply?: (chatId: string, text: string) => Promise<void> | void;
  onSendAttachment?: (
    chatId: string,
    attachment: { uri: string; name: string; type: 'image' | 'audio'; size: number; mimeType?: string }
  ) => Promise<void> | void;
  onStartCall?: (type: 'audio' | 'video', chatId: string) => void;
}

export function InAppNotificationBanner({
  onOpenChat,
  onOpenSecurity,
  onQuickReply,
  onSendAttachment,
  onStartCall,
}: InAppNotificationBannerProps) {
  // Queue up to 3 distinct contact notifications
  const [queuedNotifs, setQueuedNotifs] = useState<InAppNotification[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingAttachment, setIsSendingAttachment] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const translateY = useRef(new Animated.Value(-160)).current;
  const insets = useSafeAreaInsets();
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetDismissTimer = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    // Only auto-dismiss if user is not typing or interacting with reply bar
    if (!isInputFocused && replyText.trim().length === 0) {
      dismissTimerRef.current = setTimeout(() => {
        hideBanner();
      }, 7000);
    }
  };

  useEffect(() => {
    const unsubscribe = notificationService.subscribeInApp(notif => {
      setQueuedNotifs(prev => {
        // Filter out same chat and prepend to keep up to 3 recent contacts in header
        const filtered = prev.filter(n => (n.chatId ? n.chatId !== notif.chatId : n.id !== notif.id));
        const updated = [notif, ...filtered].slice(0, 3);
        return updated;
      });

      if (notif.chatId) {
        setActiveChatId(notif.chatId);
      }

      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 5,
        speed: 14,
      }).start();

      resetDismissTimer();
    });

    return () => {
      unsubscribe();
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [isInputFocused, replyText]);

  const hideBanner = () => {
    Animated.timing(translateY, {
      toValue: -220,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setQueuedNotifs([]);
      setActiveChatId(null);
      setReplyText('');
    });
  };

  const handleDismissTab = (chatId?: string) => {
    setQueuedNotifs(prev => {
      const remaining = prev.filter(n => n.chatId !== chatId);
      if (remaining.length === 0) {
        hideBanner();
        return [];
      }
      if (activeChatId === chatId) {
        setActiveChatId(remaining[0].chatId || remaining[0].id);
      }
      return remaining;
    });
  };

  if (queuedNotifs.length === 0) return null;

  const currentNotif =
    queuedNotifs.find(n => (n.chatId ? n.chatId === activeChatId : n.id === activeChatId)) ||
    queuedNotifs[0];

  const isCall = currentNotif.type === 'call';
  const isSecurity = currentNotif.type === 'security';
  const isMessage = currentNotif.type === 'message';

  const handleSendReply = async () => {
    if (!replyText.trim() || !currentNotif.chatId || !onQuickReply) return;
    const textToSend = replyText.trim();
    const targetChatId = currentNotif.chatId;
    setReplyText('');
    await onQuickReply(targetChatId, textToSend);
    handleDismissTab(targetChatId);
  };

  const handlePickAttachment = async () => {
    if (!currentNotif.chatId || !onSendAttachment) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Please grant photo library access to send attachments.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setIsSendingAttachment(true);
      await onSendAttachment(currentNotif.chatId, {
        uri: asset.uri,
        name: asset.fileName || 'photo.jpg',
        type: 'image',
        size: asset.fileSize || 0,
        mimeType: asset.mimeType || 'image/jpeg',
      });
      handleDismissTab(currentNotif.chatId);
    } catch (err) {
      console.warn('[NotificationBanner] Attachment error:', err);
      Alert.alert('Attachment failed', 'Could not send attachment.');
    } finally {
      setIsSendingAttachment(false);
    }
  };

  const topOffset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: topOffset + 4,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.container,
          isSecurity ? styles.securityContainer : isCall ? styles.callContainer : styles.messageContainer,
        ]}
      >
        {/* Multi-User Tabs Header (Max 3 Users) */}
        {queuedNotifs.length > 1 && (
          <View style={styles.tabRow}>
            {queuedNotifs.map(n => {
              const isActive = (n.chatId ? n.chatId === activeChatId : n.id === activeChatId);
              return (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.tabPill, isActive && styles.tabPillActive]}
                  onPress={() => {
                    if (n.chatId) setActiveChatId(n.chatId);
                  }}
                >
                  {n.avatarUri ? (
                    <Image source={{ uri: n.avatarUri }} style={styles.tabAvatar} />
                  ) : (
                    <View style={styles.tabAvatarFallback}>
                      <Text style={styles.tabAvatarText}>{n.title.slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={[styles.tabTitle, isActive && styles.tabTitleActive]} numberOfLines={1}>
                    {n.title.split(' ')[0]}
                  </Text>
                  <TouchableOpacity
                    style={styles.tabClose}
                    onPress={() => handleDismissTab(n.chatId)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <X size={10} color={isActive ? '#ffffff' : '#94a3b8'} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Main Notification Card Content */}
        <View style={styles.headerRow}>
          {/* Avatar or Icon */}
          <View style={styles.avatarContainer}>
            {currentNotif.avatarUri ? (
              <Image source={{ uri: currentNotif.avatarUri }} style={styles.avatarImage} />
            ) : (
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
            )}
          </View>

          {/* Details */}
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
          </View>

          {/* Action Icons (Calling, Full App Open, Dismiss) */}
          <View style={styles.actionButtonsCol}>
            {/* Direct Voice & Video Call Buttons right in the Header */}
            {isMessage && currentNotif.chatId && onStartCall && (
              <View style={styles.callIconsRow}>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => {
                    hideBanner();
                    onStartCall('audio', currentNotif.chatId!);
                  }}
                >
                  <Phone size={16} color={colors.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => {
                    hideBanner();
                    onStartCall('video', currentNotif.chatId!);
                  }}
                >
                  <Video size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Open Full App Button */}
            {currentNotif.chatId && onOpenChat && (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => {
                  hideBanner();
                  onOpenChat(currentNotif.chatId!);
                }}
              >
                <ExternalLink size={15} color="#94a3b8" />
              </TouchableOpacity>
            )}

            {/* Dismiss Button */}
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => handleDismissTab(currentNotif.chatId)}
            >
              <X size={15} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Incoming Call Accept/Decline Buttons */}
        {isCall && (
          <View style={styles.callActionsRow}>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => {
                currentNotif.onAction?.('decline');
                hideBanner();
              }}
            >
              <PhoneOff size={14} color="#ffffff" />
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => {
                currentNotif.onAction?.('accept');
                hideBanner();
              }}
            >
              <Phone size={14} color="#ffffff" />
              <Text style={styles.acceptBtnText}>Answer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Reply & File Attachment Bar (Directly In-Header) */}
        {isMessage && currentNotif.chatId && onQuickReply && (
          <View style={styles.quickReplyRow}>
            {onSendAttachment && (
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={handlePickAttachment}
                disabled={isSendingAttachment}
              >
                {isSendingAttachment ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Paperclip size={18} color="#94a3b8" />
                )}
              </TouchableOpacity>
            )}

            <TextInput
              style={styles.quickInput}
              placeholder={`Reply to ${currentNotif.title}...`}
              placeholderTextColor="#64748b"
              value={replyText}
              onChangeText={setReplyText}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onSubmitEditing={handleSendReply}
            />

            <TouchableOpacity
              style={[styles.sendBtn, !replyText.trim() && styles.sendBtnDisabled]}
              onPress={handleSendReply}
              disabled={!replyText.trim()}
            >
              <Send size={15} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 99999,
  },
  container: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    ...shadows.lg,
    elevation: 24,
  },
  messageContainer: {
    borderColor: '#10b981',
    backgroundColor: '#09151f',
  },
  callContainer: {
    borderColor: '#38bdf8',
    backgroundColor: '#081726',
  },
  securityContainer: {
    borderColor: '#f59e0b',
    backgroundColor: '#1c1508',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 6,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  tabPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  tabAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  tabAvatarFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabAvatarText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  tabTitle: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  tabTitleActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  tabClose: {
    padding: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 10,
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: '#10b981',
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageIconBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  callIconBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  securityIconBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
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
    marginRight: 6,
  },
  timeText: {
    fontSize: 10,
    color: '#94a3b8',
  },
  body: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 16,
  },
  securityBody: {
    color: '#fde68a',
  },
  actionButtonsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  callIconsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  declineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    borderRadius: 10,
  },
  declineBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10b981',
    paddingVertical: 8,
    borderRadius: 10,
  },
  acceptBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  quickReplyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    gap: 8,
  },
  attachBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickInput: {
    flex: 1,
    height: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 17,
    paddingHorizontal: 12,
    fontSize: 12,
    color: '#ffffff',
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
