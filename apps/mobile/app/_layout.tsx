import { useEffect, useRef, useState } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold
} from "@expo-google-fonts/inter";
import { AppState, Platform, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";

import "@/lib/i18n";
// Side-effect import: TaskManager.defineTask MUST execute at module scope
// before React mounts so the OS can locate the task when it fires in the
// background. Do NOT convert this to a lazy / dynamic import.
import "@/lib/notification-background";
// Debug panel registry: populates the hidden QA panel's routes and scenarios.
import "@/lib/debug-registry";
import Constants from "expo-constants";
import {
  DebugOverrideBanner,
  DebugPanel,
  DebugProvider,
  installDebugFetch,
  type EnvironmentInfo
} from "@petto/debug-panel";
import { AnimatedSplash } from "@/components/animated-splash";
import { ErrorBoundary } from "@/components/error-boundary";
import { NetworkBanner } from "@/components/network-banner";
import {
  registerForPushNotifications,
  addNotificationResponseListener
} from "@/lib/notifications";
import {
  flushPendingReplies,
  performInlineReply,
  REPLY_ACTION_ID,
  registerReplyCategory
} from "@/lib/notification-actions";
import { registerBackgroundNotificationTask } from "@/lib/notification-background";
import { useSessionStore } from "@/store/session";

SplashScreen.preventAutoHideAsync();

// Install the debug-aware fetch wrapper once, before any screen renders.
// Passes through when no overrides are set.
installDebugFetch();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep cached data for 1 hour in memory so tab switches are instant.
      gcTime: 1000 * 60 * 60 * 24, // 24h
      staleTime: 1000 * 30
    }
  }
});

// Persist React Query cache to AsyncStorage so it survives app restarts.
// maxAge limits what gets restored — stale data older than 1h is discarded.
// buster invalidates the entire cache when the app version changes.
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "PETTO_REACT_QUERY_CACHE"
});

const PERSIST_OPTIONS = {
  persister: asyncStoragePersister,
  maxAge: 1000 * 60 * 60 * 24, // 24h — show yesterday's data instantly, refetch in bg
  buster: "0.14.5", // cache busted on version change
  dehydrateOptions: {
    shouldDehydrateQuery: (query: any) => {
      // Only persist lightweight list / metadata queries. Chat scrollback
      // (`messages-*`) intentionally stays out — it can grow into the MBs
      // and we want fresh history every open anyway. Header/context
      // queries are persisted so opening a chat shows the right title,
      // member list, or playdate banner instantly while the live data
      // refetches in the background.
      const key = query.queryKey?.[0] as string;
      return [
        "matches",
        "conversations",
        "my-pets",
        "explore-venues",
        // Chat header context — what kind of chat this is + counterpart info.
        // Without these, the conversation page loads cold every tap and the
        // peer name / group members / playdate banner pop in seconds late.
        "group-by-conv",
        "playdate-by-conv",
        "group-detail",
        "playdate-detail",
        // Discovery lists — same "show stale, refetch fresh" treatment so
        // hopping into a tab feels instant on cold launch.
        "groups",
        "playdates",
        "my-playdates"
      ].includes(key);
    }
  }
};

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hasHydrated = useSessionStore((state) => state._hasHydrated);
  const session = useSessionStore((state) => state.session);
  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const [splashDone, setSplashDone] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold
  });

  const ready = fontsLoaded && hasHydrated;

  // Register push notifications when session exists
  useEffect(() => {
    if (!session) return;

    (async () => {
      const token = await registerForPushNotifications();
      if (token) {
        try {
          await fetch(`${API_BASE}/v1/push-token`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.tokens.accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ token, platform: Platform.OS })
          });
        } catch {
          // silently fail
        }
      }
    })();
  }, [session]);

  // Start real-time presence tracking while signed in. The tracker posts a
  // heartbeat every ~20s with lat/lng so the admin dashboard can display
  // true "online now" status and live location.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const { startPresence, stopPresence } = await import("@/lib/presence");
      if (cancelled) return;
      startPresence();
      // Tear down on sign-out / unmount.
      return () => {
        stopPresence();
      };
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Handle notification taps — shared handler for both cold start and foreground.
  // When the user replies inline (REPLY_ACTION_ID) while the app is foreground,
  // the response lands here instead of the background task. We send via the
  // same performInlineReply() helper and return early so the user does NOT
  // get deep-linked to the chat — the whole point of inline reply is staying
  // where they were.
  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    if (response.actionIdentifier === REPLY_ACTION_ID) {
      const userText = ((response as any).userText ?? "").toString().trim();
      const d = response.notification.request.content.data as Record<string, string> | undefined;
      if (userText && d?.conversationId && d?.messageId) {
        performInlineReply({
          conversationId: d.conversationId,
          messageId: d.messageId,
          userText,
          notificationRequestId: response.notification.request.identifier
        });
      }
      return;
    }

    const data = response.notification.request.content.data;
    if (data?.type === "match") {
      router.push("/(app)/(tabs)/match");
    } else if (data?.type === "message" && data?.conversationId) {
      router.push(`/(app)/conversation/${data.conversationId}`);
    } else if (data?.type === "like") {
      router.push("/(app)/(tabs)/match");
    } else if (data?.type === "health" && data?.petId) {
      router.push(`/(app)/pet-health/${data.petId}` as any);
    } else if (data?.type === "medication" && data?.petId) {
      // Tap on a medication reminder → straight to the medications screen
      // for that pet, ready for the user to hit "Mark given".
      router.push(`/(app)/medications/${data.petId}` as any);
    } else if (data?.type === "weekly_summary") {
      // Sunday digest opens the Care tab; the per-pet "this week" panel is
      // a Faz 3 follow-up, so for now we just land on Care.
      router.push("/(app)/(tabs)/care");
    } else if (data?.type === "playdate_invite" && data?.playdateId) {
      // v0.13.5 — the backend already includes {playdateId, inviteId} on this
      // push; an invitee row is guaranteed to exist in playdate_invites at
      // this point, so the detail screen will pass the private-visibility
      // gate without needing a share token.
      router.push({
        pathname: "/(app)/playdates/[id]",
        params: { id: data.playdateId as string }
      } as any);
    }
  };

  // Listen for notification taps while app is running
  useEffect(() => {
    notifListenerRef.current = addNotificationResponseListener(handleNotificationResponse);

    return () => {
      notifListenerRef.current?.remove();
    };
  }, []);

  // One-shot: register the "message_reply" notification category (iOS text
  // action + Android RemoteInput) and wire up the background task that
  // receives the reply when the app isn't running. Safe to re-run — both
  // calls are idempotent (inner try/catch swallows duplicate-registration).
  useEffect(() => {
    (async () => {
      await registerReplyCategory();
      await registerBackgroundNotificationTask();
    })();
  }, []);

  // Silent retry queue for inline replies: drain any replies that failed
  // to post (network / token issue) every time the app comes to the
  // foreground. Users never see a failure notification — replies either
  // go through or land in AsyncStorage and flush next time the app wakes.
  useEffect(() => {
    flushPendingReplies();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") flushPendingReplies();
    });
    return () => sub.remove();
  }, []);

  // Handle cold start — notification tap that launched the app
  useEffect(() => {
    if (!splashDone) return;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });
  }, [splashDone]);

  // Hide native splash when ready, show our custom animated splash
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  // Not ready yet - native splash still showing
  if (!ready) {
    return null;
  }

  // Show animated splash
  if (!splashDone) {
    return (
      <>
        <StatusBar style="light" />
        <AnimatedSplash onFinish={() => setSplashDone(true)} />
      </>
    );
  }

  const debugEnv: EnvironmentInfo = {
    appName: "Fetcht",
    appSlug: Constants.expoConfig?.slug ?? "fetcht",
    version: Constants.expoConfig?.version ?? "0.0.0",
    buildNumber:
      (Constants.expoConfig?.ios?.buildNumber as string | undefined) ??
      (Constants.expoConfig?.android?.versionCode != null
        ? String(Constants.expoConfig.android.versionCode)
        : undefined),
    apiBaseUrl: API_BASE,
    platform: Platform.OS as EnvironmentInfo["platform"],
    isDev: __DEV__,
    sessionSummary:
      session?.user?.firstName ??
      session?.user?.email ??
      "none"
  };

  // Main app
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={PERSIST_OPTIONS}
        >
          <DebugProvider env={debugEnv}>
            <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
            <NetworkBanner />
            <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
            <DebugOverrideBanner />
            <DebugPanel />
          </DebugProvider>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
