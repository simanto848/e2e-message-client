/**
 * Launching a real external Activity/Intent — expo-image-picker's gallery
 * or camera, the media-library permission dialog — pauses our host Activity
 * on Android, which React Native surfaces as a genuine AppState 'background'
 * event (not the transient 'inactive' state that only exists on iOS). The
 * app's auto-lock effect in App.tsx would otherwise treat that exactly like
 * the user leaving the app and immediately show the biometric lock screen
 * the moment a picker opens, before they've done anything.
 *
 * Call beginExternalActivity() right before launching a picker/camera Intent
 * and endExternalActivity() in a finally block once it resolves, so the
 * lock effect can tell "we caused this background transition" apart from
 * "the user actually left the app".
 */
const MAX_EXTERNAL_ACTIVITY_DURATION_MS = 60000; // 60s self-healing timeout

let activeExternalActivities = 0;
let lastActivityTimestamp = 0;

export function beginExternalActivity(): void {
  activeExternalActivities++;
  lastActivityTimestamp = Date.now();
}

export function endExternalActivity(): void {
  activeExternalActivities = Math.max(0, activeExternalActivities - 1);
  if (activeExternalActivities === 0) {
    lastActivityTimestamp = 0;
  }
}

export function isExternalActivityActive(): boolean {
  if (activeExternalActivities <= 0) return false;
  // Guard against runaway or leaked external activity flags
  if (lastActivityTimestamp > 0 && Date.now() - lastActivityTimestamp > MAX_EXTERNAL_ACTIVITY_DURATION_MS) {
    if (__DEV__) {
      console.warn('[AppLockGuard] External activity guard timed out after 60s — auto-clearing');
    }
    activeExternalActivities = 0;
    lastActivityTimestamp = 0;
    return false;
  }
  return true;
}
