import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";

import {
  getCachedLocation,
  saveCachedLocation,
  type CachedLocation
} from "@/lib/location";

// Grid cell size. 3 decimals of a degree ≈ 110m near the equator — below
// typical GPS drift but small enough that moving across a neighbourhood
// changes the key. Discover queries are keyed on `roundedKey` so that
// normal jitter does NOT invalidate them.
const GRID_PRECISION = 3;

// Soft refresh cadence. The device still gets its real-time position via
// presence.ts (which drives the admin live-map); this hook only needs a
// slow, stable anchor for Discover / Venue queries.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export type ReferenceLocation = {
  latitude?: number;
  longitude?: number;
  /** Rounded grid cell — stable across GPS jitter. Safe for React Query keys. */
  roundedKey?: string;
  refresh: () => Promise<void>;
};

function roundKey(lat: number, lng: number): string {
  return `${lat.toFixed(GRID_PRECISION)},${lng.toFixed(GRID_PRECISION)}`;
}

async function readFresh(): Promise<CachedLocation | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const fix = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });
    const next: CachedLocation = {
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      ts: Date.now()
    };
    await saveCachedLocation(next);
    return next;
  } catch {
    return null;
  }
}

/**
 * Stable reference location for feature queries (Discover, Venue Detail).
 *
 * Design notes:
 *  - Initial value comes from AsyncStorage so the map does not flash.
 *  - `roundedKey` only changes when the user crosses a ~110m grid cell,
 *    so React Query keys remain stable under GPS jitter.
 *  - Refresh happens at most every 15 minutes; `refresh()` lets callers
 *    force a pull-to-refresh without resetting the interval.
 */
export function useReferenceLocation(): ReferenceLocation {
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [roundedKey, setRoundedKey] = useState<string | undefined>();
  const roundedKeyRef = useRef<string | undefined>(undefined);

  const commit = (lat: number, lng: number) => {
    const nextKey = roundKey(lat, lng);
    setLatitude(lat);
    setLongitude(lng);
    // Only push a new cell key when it actually changes. Consumers keyed on
    // `roundedKey` stay put through normal drift.
    if (roundedKeyRef.current !== nextKey) {
      roundedKeyRef.current = nextKey;
      setRoundedKey(nextKey);
    }
  };

  const refresh = async () => {
    const fresh = await readFresh();
    if (fresh) commit(fresh.latitude, fresh.longitude);
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Warm the UI with the cached location before GPS returns.
      const cached = await getCachedLocation();
      if (mounted && cached) {
        commit(cached.latitude, cached.longitude);
      }
      const fresh = await readFresh();
      if (mounted && fresh) {
        commit(fresh.latitude, fresh.longitude);
      }
    })();

    const timer = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { latitude, longitude, roundedKey, refresh };
}
