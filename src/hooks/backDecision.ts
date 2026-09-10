import type { ScreenType } from '../navigation/types';

/**
 * Pure back-button priority chain (no React Native imports — unit-testable
 * under bun). The hook in useHardwareBack.ts maps decisions to side effects.
 * ALL hardware-back handling routes through here — screens must NOT register
 * competing BackHandler listeners (see ChatListScreen/AuthScreen: they expose
 * hasSearchQuery / isRegisterMode snapshot params instead).
 *
 * Priority: lock/restore/call blocks → message modals → app modals
 * (fixed topmost-first order) → inline search clear → screen nav →
 * register-mode exit → double-tap-to-exit on chat list → system default on auth.
 */

export type ModalKey =
  | 'update'
  | 'permissions'
  | 'changePassword'
  | 'editProfile'
  | 'duress'
  | 'cloudBackup'
  | 'linkedDevices'
  | 'invites'
  | 'search'
  | 'requests'
  | 'calls';

export interface BackSnapshot {
  isAppLocked: boolean;
  hasRestorePrompt: boolean;
  callActive: boolean;
  hasInspectingMessage: boolean;
  hasSafetyModalChat: boolean;
  openModals: ModalKey[];
  currentScreen: ScreenType;
  /** ChatList inline search text present — back clears it (no competing listener). */
  hasSearchQuery?: boolean;
  /** AuthScreen in Sign-Up tab — back returns to Log In (no competing listener). */
  isRegisterMode?: boolean;
}

export type BackDecision =
  | { kind: 'block' }
  | { kind: 'close-inspecting' }
  | { kind: 'close-safety' }
  | { kind: 'close-modal'; modal: ModalKey }
  | { kind: 'clear-search' }
  | { kind: 'exit-register' }
  | { kind: 'nav-chat-detail-back' }
  | { kind: 'nav-settings-back' }
  | { kind: 'confirm-exit' }
  | { kind: 'system' };

/** Modal close order — must match the visual topmost-first stacking. */
const MODAL_PRIORITY: ModalKey[] = [
  'update',
  'permissions',
  'changePassword',
  'editProfile',
  'duress',
  'cloudBackup',
  'linkedDevices',
  'invites',
  'search',
  'requests',
];

export function decideBackAction(snap: BackSnapshot): BackDecision {
  if (snap.isAppLocked) {
    return { kind: 'block' };
  }
  if (snap.hasRestorePrompt) {
    return { kind: 'block' };
  }
  if (snap.callActive) {
    return { kind: 'block' };
  }
  if (snap.hasInspectingMessage) {
    return { kind: 'close-inspecting' };
  }
  if (snap.hasSafetyModalChat) {
    return { kind: 'close-safety' };
  }
  for (const modal of MODAL_PRIORITY) {
    if (snap.openModals.includes(modal)) {
      return { kind: 'close-modal', modal };
    }
  }
  // Inline search clear beats screen nav (chat_list): back with query text
  // clears the field instead of exiting. Owned centrally — ChatListScreen
  // exposes hasSearchQuery; it registers no BackHandler itself.
  if (snap.hasSearchQuery) {
    return { kind: 'clear-search' };
  }
  if (snap.currentScreen === 'chat_detail') {
    return { kind: 'nav-chat-detail-back' };
  }
  if (snap.currentScreen === 'settings' || snap.currentScreen === 'requests' || snap.currentScreen === 'calls') {
    return { kind: 'nav-settings-back' };
  }
  if (snap.currentScreen === 'chat_list') {
    return { kind: 'confirm-exit' };
  }
  // Register-mode exit beats system default (auth): back in Sign-Up returns
  // to Log In. Owned centrally — AuthScreen exposes isRegisterMode.
  if (snap.currentScreen === 'auth') {
    if (snap.isRegisterMode) {
      return { kind: 'exit-register' };
    }
    return { kind: 'system' };
  }
  return { kind: 'system' };
}
