import { Redirect } from "expo-router";

import { useSessionStore } from "@/store/session";

export default function VerifyEmailCompatibilityPage() {
  const session = useSessionStore((state) => state.session);

  if (session) {
    return <Redirect href="/" />;
  }

  return <Redirect href="/(auth)/sign-up" />;
}
