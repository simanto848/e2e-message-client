import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenCapture from 'expo-screen-capture';
import { isExternalActivityActive } from '../utils/appLockGuard';

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

  // Load saved auto-lock delay preference
  useEffect(() => {
    AsyncStorage.getItem('jaby_autolock_delay')
      .then(val => {
        if (val !== null) {
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed)) setAutoLockDelay(parsed);
        }
      })
      .catch(() => {});
  }, []);

  const handleUpdateAutoLockDelay = async (seconds: number) => {
    setAutoLockDelay(seconds);
    await AsyncStorage.setItem('jaby_autolock_delay', seconds.toString()).catch(() => {});
  };

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
    setAntiScreenshotEnabled,
    callVerificationEnabled,
    setCallVerificationEnabled,
    isDecoyMode,
    setIsDecoyMode,
    handleUnlockDecoy,
  };
}
