import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { useRouter } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { changePassword } from "@/lib/api";
import { useSession } from "@/store/session";
import { theme } from "@/lib/theme";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const markChanged = useSession((s) => s.markPasswordChanged);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (next.length < 8) return setError("Password must be at least 8 characters");
    if (next !== confirm) return setError("Passwords do not match");
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      await markChanged();
      router.replace("/(app)/(tabs)/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "center", paddingHorizontal: theme.spacing["2xl"] }}
      >
        <View style={{ alignItems: "center", marginBottom: theme.spacing.xl }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.primaryBg,
              marginBottom: theme.spacing.md
            }}
          >
            <KeyRound size={26} color={theme.colors.primary} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: "700", color: theme.colors.ink }}>
            Set a new password
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontSize: 12,
              color: theme.colors.muted,
              textAlign: "center"
            }}
          >
            You won&apos;t be asked again unless the password is reset.
          </Text>
        </View>

        <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.muted }}>Current password</Text>
        <TextInput value={current} onChangeText={setCurrent} secureTextEntry style={inputStyle} />

        <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.muted, marginTop: theme.spacing.md }}>
          New password
        </Text>
        <TextInput value={next} onChangeText={setNext} secureTextEntry style={inputStyle} />

        <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.muted, marginTop: theme.spacing.md }}>
          Confirm new password
        </Text>
        <TextInput value={confirm} onChangeText={setConfirm} secureTextEntry style={inputStyle} />

        {error ? (
          <Text style={{ marginTop: 8, color: theme.colors.danger, fontSize: 12 }}>{error}</Text>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => ({
            marginTop: theme.spacing.xl,
            backgroundColor: theme.colors.primary,
            paddingVertical: 14,
            borderRadius: theme.radius.pill,
            alignItems: "center",
            opacity: busy ? 0.6 : pressed ? 0.9 : 1
          })}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Update password</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const inputStyle = {
  height: 46,
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: theme.radius.md,
  paddingHorizontal: 12,
  backgroundColor: "#FFFFFF",
  color: theme.colors.ink,
  fontSize: 14,
  marginTop: 6
};
