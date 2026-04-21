import { useEffect } from "react";
import { Stack } from "expo-router";
import { useApplyStore } from "@/store/apply";

// (apply) is an unauthenticated stack — its screens run before anyone
// has a shelter session. The root layout gates / vs /(auth) vs /(app);
// entering /(apply) means "I'm building an application".

export default function ApplyLayout() {
  const hydrate = useApplyStore((s) => s.hydrate);
  const hydrated = useApplyStore((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#FFFBF6" }
      }}
    />
  );
}
