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

export type CountdownState = {
  label: string;
  tone: "live" | "soon" | "upcoming" | "ended";
};

/**
 * Formats a future/past date into a decision-friendly countdown label:
 *   < 0            → "Ended 3h ago" / "Ended 2d ago"
 *   < 60m          → "Starts in 23m"
 *   < 24h          → "Starts in 4h 12m"
 *   < 7d           → "Starts in 3d"
 *   ≥ 7d           → "On 12 May"
 */
export function formatCountdown(target: Date | string | null | undefined): CountdownState {
  if (!target) return { label: "", tone: "upcoming" };
  const date = typeof target === "string" ? new Date(target) : target;
  if (!date || isNaN(date.getTime())) return { label: "", tone: "upcoming" };

  const now = Date.now();
  const diff = date.getTime() - now;

  if (diff <= 0) {
    const past = Math.abs(diff);
    return { label: `Ended ${formatDurationShort(past)} ago`, tone: "ended" };
  }

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) {
    return { label: `Starts in ${minutes}m`, tone: "live" };
  }
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) {
    const remMin = Math.floor((diff - hours * 3_600_000) / 60000);
    return {
      label: remMin > 0 ? `Starts in ${hours}h ${remMin}m` : `Starts in ${hours}h`,
      tone: "soon"
    };
  }
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) {
    return { label: `Starts in ${days}d`, tone: "upcoming" };
  }
  return {
    label: `On ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
    tone: "upcoming"
  };
}
