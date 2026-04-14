/**
 * Human-readable distance label.
 * 0.42 → "420 m"
 * 0.98 → "980 m"
 * 1.2  → "1.2 km"
 * 12.5 → "13 km"
 */
export function formatDistance(km: number | undefined | null): string {
  if (km == null || !Number.isFinite(km) || km <= 0) return "";
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `${meters} m`;
  }
  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}
