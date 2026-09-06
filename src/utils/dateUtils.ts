/**
 * Human-readable date and presence time formatting utilities.
 */

/**
 * Format a last-seen Unix millisecond timestamp into an intuitive, human-friendly string.
 * Examples:
 * - "Active just now" (< 1 min)
 * - "Active 5m ago"
 * - "Active 2h ago"
 * - "Active yesterday at 10:15 PM"
 * - "Active Sep 4 at 3:30 PM"
 * - "Offline" (no timestamp available)
 */
export function formatLastSeen(timestamp?: number | null): string {
  if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) {
    return 'Active recently';
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'Active just now';
  }

  if (diffMin < 60) {
    return `Active ${diffMin}m ago`;
  }

  if (diffHour < 12) {
    return `Active ${diffHour}h ago`;
  }

  const date = new Date(timestamp);
  const timeString = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const nowDate = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(nowDate.getDate() - 1);

  if (
    date.getDate() === nowDate.getDate() &&
    date.getMonth() === nowDate.getMonth() &&
    date.getFullYear() === nowDate.getFullYear()
  ) {
    return `Active today at ${timeString}`;
  }

  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return `Active yesterday at ${timeString}`;
  }

  if (diffDay < 7) {
    return `Active ${diffDay}d ago`;
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthStr = monthNames[date.getMonth()];
  const dayStr = date.getDate();

  if (date.getFullYear() === nowDate.getFullYear()) {
    return `Active ${monthStr} ${dayStr} at ${timeString}`;
  }

  return `Active ${monthStr} ${dayStr}, ${date.getFullYear()}`;
}
