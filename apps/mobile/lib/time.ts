// Tiny time formatting helpers — no external dep.

/**
 * Formats a duration in milliseconds as a short "X left"-style label.
 * Examples:
 *   90_000       → "1m"
 *   3_600_000    → "1h"
 *   5_400_000    → "1h 30m"
 *   172_800_000  → "2d"
 *   0 or negative→ "0s"
 */
export function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}
