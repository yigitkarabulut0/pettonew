import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

// Cached user location — persisted across app restarts via AsyncStorage
// so features like the Playdates discovery hub can show the map
// immediately on first render instead of flashing a permission prompt
// and an empty state.

const CACHE_KEY = "lastKnownLocation:v1";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type CachedLocation = {
  latitude: number;
  longitude: number;
  ts: number;
};

export async function getCachedLocation(): Promise<CachedLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedLocation;
    if (
      !parsed ||
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number"
    ) {
      return null;
    }
    if (Date.now() - (parsed.ts ?? 0) > MAX_AGE_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCachedLocation(loc: {
  latitude: number;
  longitude: number;
}): Promise<void> {
  try {
    const payload: CachedLocation = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      ts: Date.now()
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export type LocationResult =
  | { status: "granted"; location: CachedLocation }
  | { status: "denied" }
  | { status: "error"; reason: string };

/**
 * Requests foreground location permission and fetches a fresh fix.
 * On success the result is persisted via saveCachedLocation so the next
 * first-render has an instant starting point.
 */
export async function refreshLocation(): Promise<LocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      return { status: "denied" };
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });
    const loc: CachedLocation = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      ts: Date.now()
    };
    await saveCachedLocation(loc);
    return { status: "granted", location: loc };
  } catch (err: any) {
    return { status: "error", reason: err?.message ?? "unknown" };
  }
}
