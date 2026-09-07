import { describe, test, expect } from 'bun:test';
import { decideBackAction, type BackSnapshot } from '../backDecision';

const base: BackSnapshot = {
  isOpenedFromChatHead: false,
  isChatHeadExpanded: false,
  isAppLocked: false,
  hasRestorePrompt: false,
  callActive: false,
  hasInspectingMessage: false,
  hasSafetyModalChat: false,
  openModals: [],
  currentScreen: 'chat_list',
};

describe('decideBackAction priority chain', () => {
  test('floating chat-head window closes first', () => {
    expect(
      decideBackAction({ ...base, isOpenedFromChatHead: true, isChatHeadExpanded: true, isAppLocked: true })
    ).toEqual({ kind: 'close-floating-window' });
  });

  test('expanded head collapses before lock block', () => {
    expect(decideBackAction({ ...base, isChatHeadExpanded: true, isAppLocked: true })).toEqual({
      kind: 'collapse-chat-head',
    });
  });

  test('lock / restore / call all block (in that precedence)', () => {
    expect(decideBackAction({ ...base, isAppLocked: true, callActive: true }).kind).toBe('block');
    expect(decideBackAction({ ...base, hasRestorePrompt: true, callActive: true }).kind).toBe('block');
    expect(decideBackAction({ ...base, callActive: true, hasInspectingMessage: true }).kind).toBe('block');
  });

  test('inspecting beats safety beats modals', () => {
    expect(
      decideBackAction({ ...base, hasInspectingMessage: true, hasSafetyModalChat: true, openModals: ['invites'] })
    ).toEqual({ kind: 'close-inspecting' });
    expect(
      decideBackAction({ ...base, hasSafetyModalChat: true, openModals: ['invites'] })
    ).toEqual({ kind: 'close-safety' });
  });

  test('modals close topmost-first', () => {
    expect(decideBackAction({ ...base, openModals: ['requests', 'search', 'update'] })).toEqual({
      kind: 'close-modal',
      modal: 'update',
    });
    expect(decideBackAction({ ...base, openModals: ['requests'] })).toEqual({
      kind: 'close-modal',
      modal: 'requests',
    });
  });

  test('screen navigation: detail and settings go back to list', () => {
    expect(decideBackAction({ ...base, currentScreen: 'chat_detail' })).toEqual({ kind: 'nav-chat-detail-back' });
    expect(decideBackAction({ ...base, currentScreen: 'settings' })).toEqual({ kind: 'nav-settings-back' });
  });

  test('chat list asks for confirm-exit, auth defers to system', () => {
    expect(decideBackAction({ ...base, currentScreen: 'chat_list' })).toEqual({ kind: 'confirm-exit' });
    expect(decideBackAction({ ...base, currentScreen: 'auth' })).toEqual({ kind: 'system' });
  });
});
