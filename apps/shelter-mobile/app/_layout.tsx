import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import {
  DebugOverrideBanner,
  DebugPanel,
  DebugProvider,
  DebugTriggerZone,
  installDebugFetch,
  type EnvironmentInfo
} from "@petto/debug-panel";

import { useSession } from "@/store/session";
// Side-effect import: registers every shelter screen/modal/scenario with
// the shared debug panel before React mounts.
import "@/lib/debug-registry";

installDebugFetch();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: 1
    }
  }
});

export default function RootLayout() {
  const hydrate = useSession((s) => s.hydrate);
  const shelter = useSession((s) => s.shelter);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const debugEnv: EnvironmentInfo = {
    appName: "Fetcht Shelter",
    appSlug: Constants.expoConfig?.slug ?? "fetcht-shelter",
    version: Constants.expoConfig?.version ?? "0.0.0",
    buildNumber:
      (Constants.expoConfig?.ios?.buildNumber as string | undefined) ??
      (Constants.expoConfig?.android?.versionCode != null
        ? String(Constants.expoConfig.android.versionCode)
        : undefined),
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    platform: Platform.OS as EnvironmentInfo["platform"],
    isDev: __DEV__,
    sessionSummary: shelter?.name ?? shelter?.email ?? "none"
  };

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <DebugProvider env={debugEnv}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
            {/* Public onboarding wizard for would-be shelters (no session). */}
            <Stack.Screen name="(apply)" />
          </Stack>
          <DebugTriggerZone />
          <DebugOverrideBanner />
          <DebugPanel />
        </DebugProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
