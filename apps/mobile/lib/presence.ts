import * as Location from "expo-location";
import { AppState, Platform, type AppStateStatus } from "react-native";

import { getCachedLocation } from "@/lib/location";
import { useSessionStore } from "@/store/session";

// Admin dashboard treats `is_online AND last_seen_at > now-60s` as live, so
// the client pings every 20 seconds while the app is in the foreground.
const HEARTBEAT_MS = 20_000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let lastLat: number | null = null;
let lastLng: number | null = null;
let lastAccuracy: number | null = null;
let lastLocationAt = 0;

// Re-fetch a GPS fix at most every 2 minutes. Heartbeats in between reuse
// the last known position so we don't drain the battery.
const GPS_REFRESH_MS = 2 * 60 * 1000;

function getApiBaseUrl() {
  const url =
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    (process.env as Record<string, string | undefined>).API_BASE_URL;
  return url?.replace(/\/+$/, "") ?? "";
}

async function refreshLocationSoft() {
  const now = Date.now();
  if (now - lastLocationAt < GPS_REFRESH_MS && lastLat != null && lastLng != null) {
    return;
  }

  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      // Fall back to the cached last-known location so the heartbeat still
      // carries a useful pin. Admin map renders this as the last known fix.
      const cached = await getCachedLocation();
      if (cached) {
        lastLat = cached.latitude;
        lastLng = cached.longitude;
        lastAccuracy = null;
      }
      return;
    }

    const fix = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });
    lastLat = fix.coords.latitude;
    lastLng = fix.coords.longitude;
    lastAccuracy = fix.coords.accuracy ?? null;
    lastLocationAt = now;
  } catch {
    // Non-fatal: we'll retry on the next heartbeat.
  }
}

async function postPresence(path: string, body: Record<string, unknown>) {
  const session = useSessionStore.getState().session;
  const base = getApiBaseUrl();
  if (!session || !base) return;
  try {
    await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.tokens.accessToken}`
      },
      body: JSON.stringify(body),
      // Presence is fire-and-forget — don't hold the UI on a stuck network.
      signal: AbortSignal.timeout?.(5000)
    });
  } catch {
    // ignore — retried on the next tick
  }
}

async function heartbeat() {
  const session = useSessionStore.getState().session;
  if (!session) return;
  await refreshLocationSoft();
  await postPresence("/v1/presence/heartbeat", {
    lat: lastLat,
    lng: lastLng,
    accuracy: lastAccuracy,
    state: AppState.currentState === "active" ? "foreground" : "background",
    platform: Platform.OS
  });
}

async function markOffline() {
  const session = useSessionStore.getState().session;
  if (!session) return;
  await postPresence("/v1/presence/offline", {});
}

function handleAppStateChange(next: AppStateStatus) {
  if (next === "active") {
    // Fire immediately so the admin sees the online flip without waiting
    // for the next interval tick.
    heartbeat();
    if (!intervalId) {
      intervalId = setInterval(heartbeat, HEARTBEAT_MS);
    }
  } else {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    markOffline();
  }
}

/**
 * Start presence tracking — call once after the user is signed in. Safe to
 * call multiple times (no-ops if already started). Call `stopPresence()` on
 * sign-out.
 */
export function startPresence() {
  if (intervalId) return;
  intervalId = setInterval(heartbeat, HEARTBEAT_MS);
  heartbeat();
  appStateSubscription = AppState.addEventListener("change", handleAppStateChange);
}

export function stopPresence() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  markOffline();
}
