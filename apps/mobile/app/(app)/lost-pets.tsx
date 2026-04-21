// Legacy user-adoption screen — replaced in v0.13. The actual Adopt
// experience lives under `app/(app)/adopt/*`. This stub keeps any
// outstanding deep links from crashing; Expo Router will resolve it.
import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

export default function LegacyAdoptRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(app)/(tabs)/home");
  }, [router]);
  return <View />;
}
