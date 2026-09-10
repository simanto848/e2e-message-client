/**
 * App navigation screens (manual state navigation).
 *
 * App.tsx previously declared this inline. Centralizing here so the
 * navigation hook, back-handler, and future react-navigation migration
 * share one source of truth.
 */
export type ScreenType = 'auth' | 'chat_list' | 'chat_detail' | 'settings';

export type BottomTabId = 'chats' | 'requests' | 'calls' | 'settings';
