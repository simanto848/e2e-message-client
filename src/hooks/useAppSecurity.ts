import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenCapture from 'expo-screen-capture';
import { isExternalActivityActive } from '../utils/appLockGuard';

const STORAGE_KEY_AUTOLOCK = 'jaby_autolock_delay';
const STORAGE_KEY_SCREENSHOT = 'jaby_anti_screenshot';
const STORAGE_KEY_CALL_VERIF = 'jaby_call_verification';

interface UseAppSecurityOptions {
  isAuthenticated: boolean;
  isCallActive: boolean;
}

export function useAppSecurity({ isAuthenticated, isCallActive }: UseAppSecurityOptions) {
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [autoLockDelay, setAutoLockDelay] = useState<number>(5);
  const autoLockDelayRef = useRef<number>(5);
  autoLockDelayRef.current = autoLockDelay;

  const [antiScreenshotEnabled, setAntiScreenshotEnabled] = useState(true);
  const [callVerificationEnabled, setCallVerificationEnabled] = useState(true);
  const [isDecoyMode, setIsDecoyMode] = useState(false);

  // Load saved privacy and security preferences from local cache on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_AUTOLOCK),
      AsyncStorage.getItem(STORAGE_KEY_SCREENSHOT),
      AsyncStorage.getItem(STORAGE_KEY_CALL_VERIF),
    ])
      .then(([savedDelay, savedScreenshot, savedCallVerif]) => {
        if (savedDelay !== null) {
          const parsed = parseInt(savedDelay, 10);
          if (!isNaN(parsed)) setAutoLockDelay(parsed);
        }
        if (savedScreenshot !== null) {
          setAntiScreenshotEnabled(savedScreenshot === 'true');
        }
        if (savedCallVerif !== null) {
          setCallVerificationEnabled(savedCallVerif === 'true');
        }
      })
      .catch(() => {});
  }, []);

  const handleUpdateAutoLockDelay = useCallback(async (seconds: number) => {
    setAutoLockDelay(seconds);
    await AsyncStorage.setItem(STORAGE_KEY_AUTOLOCK, seconds.toString()).catch(() => {});
  }, []);

  const handleUpdateAntiScreenshot = useCallback(async (enabled: boolean) => {
    setAntiScreenshotEnabled(enabled);
    await AsyncStorage.setItem(STORAGE_KEY_SCREENSHOT, enabled ? 'true' : 'false').catch(() => {});
  }, []);

  const handleUpdateCallVerification = useCallback(async (enabled: boolean) => {
    setCallVerificationEnabled(enabled);
    await AsyncStorage.setItem(STORAGE_KEY_CALL_VERIF, enabled ? 'true' : 'false').catch(() => {});
  }, []);

  // Sync settings when loaded from server database
  const applyPrivacySettings = useCallback((settings: {
    blockScreenshots?: boolean;
    callVerification?: boolean;
    autoLockDelay?: number;
  }) => {
    if (typeof settings.blockScreenshots === 'boolean') {
      handleUpdateAntiScreenshot(settings.blockScreenshots);
    }
    if (typeof settings.callVerification === 'boolean') {
      handleUpdateCallVerification(settings.callVerification);
    }
    if (typeof settings.autoLockDelay === 'number') {
      handleUpdateAutoLockDelay(settings.autoLockDelay);
    }
  }, [handleUpdateAntiScreenshot, handleUpdateCallVerification, handleUpdateAutoLockDelay]);

  // Screenshot / screen-recording prevention OS-level flag
  useEffect(() => {
    if (antiScreenshotEnabled) {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    } else {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    }
  }, [antiScreenshotEnabled]);

  // Re-lock the enclave whenever the app leaves the foreground, respecting
  // the user's configured auto-lock delay (or remaining unlocked if set to Never/0).
  useEffect(() => {
    let backgroundTimer: NodeJS.Timeout | null = null;

    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'background') {
        if (!isAuthenticated || isExternalActivityActive() || isCallActive) {
          return;
        }

        // If configured delay is 0, user chose 'Never' — keep enclave unlocked
        if (autoLockDelayRef.current === 0) {
          return;
        }

        const delayMs = autoLockDelayRef.current * 1000;
        backgroundTimer = setTimeout(() => {
          if (AppState.currentState === 'background' && !isExternalActivityActive() && !isCallActive) {
            setIsAppLocked(true);
          }
        }, delayMs);
      } else if (nextState === 'active') {
        if (backgroundTimer) {
          clearTimeout(backgroundTimer);
          backgroundTimer = null;
        }
      }
    });

    return () => {
      if (backgroundTimer) clearTimeout(backgroundTimer);
      sub.remove();
    };
  }, [isAuthenticated, isCallActive]);

  const handleUnlockDecoy = (onAfterUnlock?: () => void) => {
    setIsDecoyMode(true);
    setIsAppLocked(false);
    if (onAfterUnlock) onAfterUnlock();
  };

  return {
    isAppLocked,
    setIsAppLocked,
    autoLockDelay,
    handleUpdateAutoLockDelay,
    antiScreenshotEnabled,
    setAntiScreenshotEnabled: handleUpdateAntiScreenshot,
    callVerificationEnabled,
    setCallVerificationEnabled: handleUpdateCallVerification,
    applyPrivacySettings,
    isDecoyMode,
    setIsDecoyMode,
    handleUnlockDecoy,
  };
}
