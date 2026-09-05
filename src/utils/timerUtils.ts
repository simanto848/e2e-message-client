/**
 * Utility functions and constants for Disappearing Messages (Ephemeral Timer).
 */

export function formatDisappearingTimer(seconds: number): string {
  if (!seconds || seconds <= 0) return 'Off';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const remSecs = seconds % 60;
    return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const remMins = Math.floor((seconds % 3600) / 60);
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  }
  const days = Math.floor(seconds / 86400);
  const remHours = Math.floor((seconds % 86400) / 3600);
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

export function formatTimerDescription(seconds: number): string {
  if (!seconds || seconds <= 0) return 'Messages will not disappear';
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const remSecs = seconds % 60;
    return remSecs > 0 ? `${mins} min ${remSecs} sec` : `${mins} minute${mins === 1 ? '' : 's'}`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const remMins = Math.floor((seconds % 3600) / 60);
    if (remMins > 0) return `${hours} hr ${remMins} min`;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.floor(seconds / 86400);
  const remHours = Math.floor((seconds % 86400) / 3600);
  if (remHours > 0) return `${days} day${days === 1 ? '' : 's'} ${remHours} hr`;
  return `${days} day${days === 1 ? '' : 's'}`;
}

export const PRESET_TIMERS: { label: string; value: number; subtitle: string }[] = [
  { label: 'Off', value: 0, subtitle: 'Keep messages permanently' },
  { label: '5s', value: 5, subtitle: '5 seconds' },
  { label: '15s', value: 15, subtitle: '15 seconds' },
  { label: '30s', value: 30, subtitle: '30 seconds' },
  { label: '1m', value: 60, subtitle: '1 minute' },
  { label: '5m', value: 300, subtitle: '5 minutes' },
  { label: '1h', value: 3600, subtitle: '1 hour' },
  { label: '8h', value: 28800, subtitle: '8 hours' },
  { label: '24h', value: 86400, subtitle: '24 hours (1 day)' },
  { label: '7d', value: 604800, subtitle: '7 days (1 week)' },
];
