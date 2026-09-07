import { useCallback, useState } from 'react';
import type { ScreenType } from '../navigation/types';

/**
 * Manual screen navigation extracted from App.tsx.
 *
 * Behavior-preserving: same 4 screens, same transitions. All navigation
 * intent flows through these actions so a future react-navigation migration
 * only rewrites this hook, not every call site.
 */
export function useAppNavigation() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('auth');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const openChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setCurrentScreen('chat_detail');
  }, []);

  const goChatList = useCallback(() => {
    setActiveChatId(null);
    setCurrentScreen('chat_list');
  }, []);

  const openSettings = useCallback(() => {
    setCurrentScreen('settings');
  }, []);

  const resetToAuth = useCallback(() => {
    setActiveChatId(null);
    setCurrentScreen('auth');
  }, []);

  const enterApp = useCallback(() => {
    setCurrentScreen('chat_list');
  }, []);

  return {
    currentScreen,
    setCurrentScreen,
    activeChatId,
    setActiveChatId,
    openChat,
    goChatList,
    openSettings,
    resetToAuth,
    enterApp,
  };
}

export type AppNavigation = ReturnType<typeof useAppNavigation>;
