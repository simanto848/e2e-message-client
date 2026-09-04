import { NativeModules, Platform } from 'react-native';

const { ChatHeadModule } = NativeModules;

export interface NativeChatHeadOptions {
  contactId: string;
  contactName: string;
  avatarUrl?: string;
  unreadCount?: number;
  isOnline?: boolean;
}

export const chatHeadNative = {
  isSupported(): boolean {
    return Platform.OS === 'android' && Boolean(ChatHeadModule);
  },

  async checkOverlayPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !ChatHeadModule) return false;
    try {
      return await ChatHeadModule.checkOverlayPermission();
    } catch {
      return false;
    }
  },

  async requestOverlayPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !ChatHeadModule) return false;
    try {
      return await ChatHeadModule.requestOverlayPermission();
    } catch {
      return false;
    }
  },

  async showNativeChatHead(options: NativeChatHeadOptions): Promise<boolean> {
    if (Platform.OS !== 'android' || !ChatHeadModule) return false;
    try {
      return await ChatHeadModule.showChatHead({
        contactId: options.contactId,
        contactName: options.contactName,
        avatarUrl: options.avatarUrl || '',
        unreadCount: options.unreadCount || 0,
        isOnline: Boolean(options.isOnline),
      });
    } catch {
      return false;
    }
  },

  async hideNativeChatHead(): Promise<boolean> {
    if (Platform.OS !== 'android' || !ChatHeadModule) return false;
    try {
      return await ChatHeadModule.hideChatHead();
    } catch {
      return false;
    }
  },

  async getPendingChatIntent(): Promise<{ chatId: string; contactName: string } | null> {
    if (Platform.OS !== 'android' || !ChatHeadModule) return null;
    try {
      return await ChatHeadModule.getPendingChatIntent();
    } catch {
      return null;
    }
  },
};
