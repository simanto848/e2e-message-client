import type { ScreenType } from '../navigation/types';

/**
 * Pure back-button priority chain (no React Native imports — unit-testable
 * under bun). The hook in useHardwareBack.ts maps decisions to side effects.
 *
 * Priority: floating chat-head window → collapse head → lock/restore/call
 * blocks → message modals → app modals (fixed topmost-first order) →
 * screen nav → double-tap-to-exit on chat list → system default on auth.
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
  | 'requests';

export interface BackSnapshot {
  isOpenedFromChatHead: boolean;
  isChatHeadExpanded: boolean;
  isAppLocked: boolean;
  hasRestorePrompt: boolean;
  callActive: boolean;
  hasInspectingMessage: boolean;
  hasSafetyModalChat: boolean;
  openModals: ModalKey[];
  currentScreen: ScreenType;
}

export type BackDecision =
  | { kind: 'close-floating-window' }
  | { kind: 'collapse-chat-head' }
  | { kind: 'block' }
  | { kind: 'close-inspecting' }
  | { kind: 'close-safety' }
  | { kind: 'close-modal'; modal: ModalKey }
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
  if (snap.isOpenedFromChatHead && snap.isChatHeadExpanded) {
    return { kind: 'close-floating-window' };
  }
  if (snap.isChatHeadExpanded) {
    return { kind: 'collapse-chat-head' };
  }
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
  if (snap.currentScreen === 'chat_detail') {
    return { kind: 'nav-chat-detail-back' };
  }
  if (snap.currentScreen === 'settings') {
    return { kind: 'nav-settings-back' };
  }
  if (snap.currentScreen === 'chat_list') {
    return { kind: 'confirm-exit' };
  }
  return { kind: 'system' };
}
