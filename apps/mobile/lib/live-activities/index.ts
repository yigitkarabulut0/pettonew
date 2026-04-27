import AsyncStorage from "@react-native-async-storage/async-storage";

import LiveActivities from "petto-live-activities";

import { useSessionStore } from "@/store/session";

import { postActivityToken, postStartToken } from "./api";

let listenersInstalled = false;

const DEVICE_ID_KEY = "PETTO_LIVE_ACTIVITY_DEVICE_ID";
let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }
  const fresh = `ios-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  cachedDeviceId = fresh;
  return fresh;
}

/**
 * Wire native ActivityKit token streams to the backend. Idempotent — call
 * once at app bootstrap (after auth state is restored). Tokens are pushed
 * to the server whenever they rotate; we ignore failures so a transient
 * network error doesn't block app startup.
 */
export function setupLiveActivityListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  LiveActivities.addPushToStartTokenListener((event) => {
    const token = useSessionStore.getState().session?.tokens.accessToken;
    if (!token) return;
    void (async () => {
      try {
        await postStartToken(token, {
          kind: event.kind,
          deviceId: await getDeviceId(),
          token: event.token,
        });
      } catch {
        // network error — device will resend on next token rotation.
      }
    })();
  });

  LiveActivities.addActivityPushTokenListener((event) => {
    const token = useSessionStore.getState().session?.tokens.accessToken;
    if (!token) return;
    void postActivityToken(token, {
      activityId: event.activityId,
      kind: event.kind,
      relatedId: event.playdateId,
      token: event.token,
    }).catch(() => {});
  });
}

export { ensurePlaydateLiveActivity, endPlaydateLiveActivity } from "./playdate";
