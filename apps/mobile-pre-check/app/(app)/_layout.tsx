import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding/location" options={{ title: "Your location", headerShown: false }} />
      <Stack.Screen name="onboarding/profile" options={{ title: "Your profile", headerShown: false }} />
      <Stack.Screen name="onboarding/pets" options={{ title: "Your pets", headerShown: false }} />
      <Stack.Screen name="conversation/[id]" options={{ title: "Conversation", headerShown: false }} />
    </Stack>
  );
}
