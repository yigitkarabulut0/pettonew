import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { mobileTheme } from "@/lib/theme";

const queryClient = new QueryClient();

function FontLoader({ children }: { children: React.ReactNode }) {
  const [fontsLoaded] = useFonts({
    [mobileTheme.fontFamily]: Inter_400Regular,
    "Inter-Medium": Inter_500Medium,
    "Inter-SemiBold": Inter_600SemiBold,
    "Inter-Bold": Inter_700Bold,
    "Inter-ExtraBold": Inter_800ExtraBold
  });

  if (!fontsLoaded) {
    return null;
  }

  return children;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <FontLoader>
          <Stack screenOptions={{ headerShown: false }} />
        </FontLoader>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
