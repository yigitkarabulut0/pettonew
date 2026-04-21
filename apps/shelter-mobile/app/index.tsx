import { Redirect } from "expo-router";
import { useSession } from "@/store/session";

export default function Index() {
  const hydrated = useSession((s) => s.hydrated);
  const shelter = useSession((s) => s.shelter);
  const mustChangePassword = useSession((s) => s.mustChangePassword);
  if (!hydrated) return null;
  if (!shelter) return <Redirect href="/(auth)/login" />;
  if (mustChangePassword) return <Redirect href="/(auth)/change-password" />;
  return <Redirect href="/(app)/(tabs)/dashboard" />;
}
