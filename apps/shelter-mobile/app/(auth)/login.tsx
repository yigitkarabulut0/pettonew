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
import { Building2 } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { shelterLogin } from "@/lib/api";
import { useSession } from "@/store/session";
import { theme } from "@/lib/theme";

export default function LoginScreen() {
  const router = useRouter();
  const setSession = useSession((s) => s.setSession);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await shelterLogin(email.trim().toLowerCase(), password);
      await setSession(
        res.shelter,
        res.accessToken,
        res.mustChangePassword,
        res.member ?? null
      );
      router.replace(
        res.mustChangePassword ? "/(auth)/change-password" : "/(app)/(tabs)/dashboard"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
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
        <View style={{ alignItems: "center", marginBottom: theme.spacing["2xl"] }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.primaryBg,
              marginBottom: theme.spacing.lg
            }}
          >
            <Building2 size={26} color={theme.colors.primary} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.primary, letterSpacing: 1.6, textTransform: "uppercase" }}>
            Fetcht Shelter
          </Text>
          <Text style={{ marginTop: 6, fontSize: 24, fontWeight: "700", color: theme.colors.ink }}>
            Welcome back
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, color: theme.colors.muted, textAlign: "center" }}>
            Sign in with the credentials Fetcht support sent you.
          </Text>
        </View>

        <Field label="Email">
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={inputStyle}
            placeholder="shelter@example.org"
            placeholderTextColor={theme.colors.muted}
          />
        </Field>
        <Field label="Password">
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            style={inputStyle}
            placeholder="••••••••"
            placeholderTextColor={theme.colors.muted}
          />
        </Field>

        {error ? (
          <Text style={{ marginTop: 8, color: theme.colors.danger, fontSize: 12 }}>
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={busy || !email || !password}
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
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
              Sign in
            </Text>
          )}
        </Pressable>

        <View
          style={{
            marginTop: theme.spacing.xl,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingTop: theme.spacing.lg,
            gap: 10
          }}
        >
          <Text
            style={{
              textAlign: "center",
              fontSize: 12,
              color: theme.colors.muted
            }}
          >
            Not signed up yet?
          </Text>
          <Pressable
            onPress={() => router.push("/(apply)/entity-type")}
            style={({ pressed }) => ({
              paddingVertical: 12,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.primaryBg,
              alignItems: "center",
              opacity: pressed ? 0.8 : 1
            })}
          >
            <Text
              style={{
                color: theme.colors.primary,
                fontWeight: "700",
                fontSize: 13
              }}
            >
              Start a shelter application →
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(apply)/status")}
            style={({ pressed }) => ({ alignItems: "center", opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
              Already applied? Check status →
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(auth)/invite")}
            style={({ pressed }) => ({ alignItems: "center", opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
              Have an invite link? Accept it →
            </Text>
          </Pressable>
        </View>
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
  fontSize: 14
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: theme.spacing.md }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600",
          color: theme.colors.muted,
          marginBottom: 6
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}
