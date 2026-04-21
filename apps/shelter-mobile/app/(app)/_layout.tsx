import { Redirect, Stack } from "expo-router";
import { useSession } from "@/store/session";

export default function AppLayout() {
  const hydrated = useSession((s) => s.hydrated);
  const shelter = useSession((s) => s.shelter);
  const mustChangePassword = useSession((s) => s.mustChangePassword);

  if (!hydrated) return null;
  if (!shelter) return <Redirect href="/(auth)/login" />;
  if (mustChangePassword) return <Redirect href="/(auth)/change-password" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="pets/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="pets/[id]" />
      <Stack.Screen name="applications/[id]" />
      <Stack.Screen name="conversation/[id]" />
    </Stack>
  );
}
