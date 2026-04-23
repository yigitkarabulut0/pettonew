import { Redirect, Stack } from "expo-router";

import { useSessionStore } from "@/store/session";

export default function AppLayout() {
  const session = useSessionStore((state) => state.session);

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack screenOptions={{ animation: "slide_from_right" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding/location" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="onboarding/profile" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="onboarding/pets" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="conversation/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="conversations" options={{ headerShown: false }} />
      <Stack.Screen name="edit-pet/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="diary/[petId]" options={{ headerShown: false }} />
      <Stack.Screen name="pet-health/[petId]" options={{ headerShown: false }} />
      <Stack.Screen name="pet-weight/[petId]" options={{ headerShown: false }} />
      <Stack.Screen name="vet-contacts" options={{ headerShown: false }} />
      <Stack.Screen name="feeding/[petId]" options={{ headerShown: false }} />
      <Stack.Screen name="playdates" options={{ headerShown: false }} />
      <Stack.Screen name="groups" options={{ headerShown: false }} />
      <Stack.Screen name="lost-pets" options={{ headerShown: false }} />
      <Stack.Screen name="training-tips" options={{ headerShown: false }} />
      <Stack.Screen name="training-tip/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="pet-sitters" options={{ headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="venue/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="adopt/index" options={{ headerShown: false }} />
      <Stack.Screen name="adopt/[petId]" options={{ headerShown: false }} />
      <Stack.Screen name="shelter/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="my-applications" options={{ headerShown: false }} />
      <Stack.Screen name="favorites" options={{ headerShown: false }} />
    </Stack>
  );
}
