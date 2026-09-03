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
 * "the user actually left the app". A counter (not a boolean) so nested or
 * overlapping calls can't leave it stuck suppressed if one resolves before
 * another starts.
 */
let activeExternalActivities = 0;

export function beginExternalActivity(): void {
  activeExternalActivities++;
}

export function endExternalActivity(): void {
  // Give a 2.5-second grace window so that returning Android Activity transitions
  // (which can fire AppState 'background'/'inactive' slightly after the promise resolves)
  // do not immediately trigger the biometric lock screen.
  setTimeout(() => {
    activeExternalActivities = Math.max(0, activeExternalActivities - 1);
  }, 2500);
}

export function isExternalActivityActive(): boolean {
  return activeExternalActivities > 0;
}
