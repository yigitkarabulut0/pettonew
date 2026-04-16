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
import { Platform, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";

import "@/lib/i18n";
import { AnimatedSplash } from "@/components/animated-splash";
import { ErrorBoundary } from "@/components/error-boundary";
import { NetworkBanner } from "@/components/network-banner";
import {
  registerForPushNotifications,
  addNotificationResponseListener
} from "@/lib/notifications";
import { useSessionStore } from "@/store/session";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep cached data for 1 hour in memory so tab switches are instant.
      gcTime: 1000 * 60 * 60,
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
  maxAge: 1000 * 60 * 60, // 1 hour — don't restore very old data
  buster: "0.11.11", // cache busted on version change
  dehydrateOptions: {
    shouldDehydrateQuery: (query: any) => {
      // Only persist lightweight list queries — skip large/binary data.
      const key = query.queryKey?.[0] as string;
      return ["matches", "conversations", "my-pets", "explore-venues"].includes(key);
    }
  }
};

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hasHydrated = useSessionStore((state) => state._hasHydrated);
  const session = useSessionStore((state) => state.session);
  const notifListenerRef = useRef<Notifications.EventSubscription>();
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

  // Handle notification taps — shared handler for both cold start and foreground
  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    if (data?.type === "match") {
      router.push("/(app)/(tabs)/match");
    } else if (data?.type === "message" && data?.conversationId) {
      router.push(`/(app)/conversation/${data.conversationId}`);
    } else if (data?.type === "like") {
      router.push("/(app)/(tabs)/match");
    } else if (data?.type === "health" && data?.petId) {
      router.push(`/(app)/pet-health/${data.petId}` as any);
    }
  };

  // Listen for notification taps while app is running
  useEffect(() => {
    notifListenerRef.current = addNotificationResponseListener(handleNotificationResponse);

    return () => {
      notifListenerRef.current?.remove();
    };
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

  // Main app
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={PERSIST_OPTIONS}
        >
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
          <NetworkBanner />
          <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
