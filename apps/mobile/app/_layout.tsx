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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

const queryClient = new QueryClient();

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

  // Handle notification taps
  useEffect(() => {
    notifListenerRef.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === "match") {
        router.push("/(app)/(tabs)/match");
      } else if (data?.type === "message" && data?.conversationId) {
        router.push(`/(app)/conversation/${data.conversationId}`);
      } else if (data?.type === "health" && data?.petId) {
        router.push(`/(app)/pet-health/${data.petId}` as any);
      }
    });

    return () => {
      notifListenerRef.current?.remove();
    };
  }, []);

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
        <QueryClientProvider client={queryClient}>
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
          <NetworkBanner />
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
