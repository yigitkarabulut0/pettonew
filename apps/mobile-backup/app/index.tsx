import { Redirect } from "expo-router";

import { needsLocationOnboarding, needsProfileOnboarding, useSessionStore } from "@/store/session";

export default function IndexPage() {
  const session = useSessionStore((state) => state.session);
  const petCount = useSessionStore((state) => state.petCount);

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (needsLocationOnboarding(session)) {
    return <Redirect href="/(app)/onboarding/location" />;
  }

  if (needsProfileOnboarding(session)) {
    return <Redirect href="/(app)/onboarding/profile" />;
  }

  if (petCount < 1) {
    return <Redirect href="/(app)/onboarding/pets" />;
  }

  return <Redirect href="/(app)/(tabs)/home" />;
}
