import { useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';
import { decideBackAction } from './backDecision';
import type { ModalKey } from './backDecision';

export type { ModalKey };
export type { BackSnapshot, BackDecision } from './backDecision';

export interface HardwareBackActions {
  closeFloatingWindow: () => void;
  collapseChatHead: () => void;
  clearInspectingMessage: () => void;
  clearSafetyModalChat: () => void;
  closeModal: (modal: ModalKey) => void;
  backFromChatDetail: () => void;
  backFromSettings: () => void;
}

const EXIT_CONFIRM_WINDOW_MS = 2000;

export function useHardwareBack(
  getSnapshot: () => import('./backDecision').BackSnapshot,
  actions: HardwareBackActions
): void {
  const snapshotRef = useRef(getSnapshot);
  const actionsRef = useRef(actions);
  const lastBackPressTimeRef = useRef<number>(0);

  // Keep the registered listener pointed at fresh state without re-registering.
  useEffect(() => {
    snapshotRef.current = getSnapshot;
    actionsRef.current = actions;
  });

  useEffect(() => {
    const onHardwareBack = (): boolean => {
      const decision = decideBackAction(snapshotRef.current());
      const a = actionsRef.current;
      switch (decision.kind) {
        case 'close-floating-window':
          a.closeFloatingWindow();
          return true;
        case 'collapse-chat-head':
          a.collapseChatHead();
          return true;
        case 'block':
          return true;
        case 'close-inspecting':
          a.clearInspectingMessage();
          return true;
        case 'close-safety':
          a.clearSafetyModalChat();
          return true;
        case 'close-modal':
          a.closeModal(decision.modal);
          return true;
        case 'nav-chat-detail-back':
          a.backFromChatDetail();
          return true;
        case 'nav-settings-back':
          a.backFromSettings();
          return true;
        case 'confirm-exit': {
          const now = Date.now();
          if (now - lastBackPressTimeRef.current < EXIT_CONFIRM_WINDOW_MS) {
            BackHandler.exitApp();
            return true;
          }
          lastBackPressTimeRef.current = now;
          if (Platform.OS === 'android') {
            ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
          }
          return true;
        }
        case 'system':
          return false;
      }
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, []);
}
