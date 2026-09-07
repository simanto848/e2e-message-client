/**
 * System call-UI integration via react-native-callkeep (CallKit / ConnectionService).
 *
 * Why: today incoming calls only surface through the in-app CallModal +
 * polling, so a backgrounded/killed app can miss calls entirely. CallKeep
 * routes incoming calls through the OS phone UI (full-screen, lockscreen,
 * Do-Not-Disturb bypass) and wires hardware answer/decline into the app.
 *
 * Safety: every entry point is guarded by isCallKeepAvailable() — in
 * Expo Go (no native module) all calls are no-ops and the existing in-app
 * flow is untouched. Requires a dev build (`expo run:android/ios`) and,
 * on iOS, PushKit (see CALLKEEP_TODO below) for killed-state wake.
 */
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import RNCallKeep from 'react-native-callkeep';
import { logger } from '../utils/logger';

// CALLKEEP_TODO (killed-state iOS wake): add react-native-voip-push-notification,
// register its PushKit token with the server alongside the Expo push token,
// and have the server send a VoIP push on incoming call; the push handler
// then calls displayIncomingCall. Android killed-state works via FCM
// high-priority data message → same entry point.

let isSetup = false;
let isAvailable: boolean | null = null;

/** True only on a dev build with the native module linked + setup done. */
export function isCallKeepAvailable(): boolean {
  return isAvailable === true && isSetup;
}

function markUnavailable(reason: string): false {
  if (isAvailable !== false) {
    logger.info('CallKeep', `unavailable (${reason}), using in-app call UI`);
  }
  isAvailable = false;
  return false;
}

export async function setupCallKeep(): Promise<boolean> {
  if (isSetup) return isCallKeepAvailable();
  try {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return markUnavailable('unsupported platform');
    const options = {
      ios: {
        appName: 'JABY Secure',
        supportsVideo: true,
        includesCallsInRecents: false,
      },
      android: {
        alertTitle: 'Permissions required',
        alertDescription: 'JABY needs phone permissions to show incoming calls on the system screen.',
        cancelButton: 'Cancel',
        okButton: 'Allow',
        additionalPermissions: [] as string[],
        foregroundService: {
          channelId: 'jaby_expo_calls',
          channelName: 'Calls',
          notificationTitle: 'JABY call in progress',
        },
      },
    };
    await RNCallKeep.setup(options);
    // Reject system-UI originated outgoing calls — dialing stays in-app.
    RNCallKeep.addEventListener('didReceiveStartCallAction', ({ handle, callUUID }) => {
      if (callUUID) RNCallKeep.endCall(callUUID);
      logger.info('CallKeep', 'system dial suppressed, handle:', handle);
    });
    isAvailable = true;
    isSetup = true;
    logger.info('CallKeep', 'setup complete');
    return true;
  } catch (err) {
    logger.warn('CallKeep', 'setup failed:', err);
    return markUnavailable('setup threw');
  }
}

/** UUIDs for CallKeep (callIds are app-scoped strings, not UUIDs). */
export function newCallUUID(): string {
  try {
    const b = Crypto.getRandomBytes(16);
    const hex = Array.from(b)
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return `jaby-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

export function displayIncomingCall(params: {
  callUUID: string;
  handle: string;
  callerName: string;
  hasVideo: boolean;
}): void {
  if (!isCallKeepAvailable()) return;
  try {
    RNCallKeep.displayIncomingCall(params.callUUID, params.handle, params.callerName, 'generic', params.hasVideo);
  } catch (err) {
    logger.warn('CallKeep', 'displayIncomingCall failed:', err);
  }
}

export function reportCallEnded(callUUID: string): void {
  if (!isCallKeepAvailable()) return;
  try {
    RNCallKeep.endCall(callUUID);
  } catch (err) {
    logger.warn('CallKeep', 'endCall failed:', err);
  }
}

export function reportAllCallsEnded(): void {
  if (!isCallKeepAvailable()) return;
  try {
    RNCallKeep.endAllCalls();
  } catch (err) {
    logger.warn('CallKeep', 'endAllCalls failed:', err);
  }
}

export interface CallKeepCallbacks {
  onAnswerCall?: (callUUID: string) => void;
  onEndCall?: (callUUID: string) => void;
}

/** System answer/decline → app handlers. Returns unsubscribe. */
export function addCallKeepListeners(callbacks: CallKeepCallbacks): () => void {
  if (!isCallKeepAvailable()) return () => {};
  try {
    const answerSub = RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
      callbacks.onAnswerCall?.(callUUID);
    });
    const endSub = RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
      callbacks.onEndCall?.(callUUID);
    });
    return () => {
      try {
        answerSub.remove();
      } catch {}
      try {
        endSub.remove();
      } catch {}
    };
  } catch (err) {
    logger.warn('CallKeep', 'addEventListener failed:', err);
    return () => {};
  }
}
