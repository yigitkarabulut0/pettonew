import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  XCircle
} from "lucide-react-native";
import type { ShelterInviteInfo } from "@petto/contracts";

import { acceptInvite, fetchInviteInfo } from "@/lib/team-api";
import { useSession } from "@/store/session";
import { theme } from "@/lib/theme";

// Public accept screen for mobile. The invite URL is opened either from
// a pasted link (user types token manually) or a deep link
// `fetcht-shelter://invite?token=XYZ` once scheme routing kicks in.

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer"
};

export default function InviteAcceptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const setSession = useSession((s) => s.setSession);

  const [token, setToken] = useState<string>((params?.token as string) ?? "");
  const [info, setInfo] = useState<ShelterInviteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(
    async (t: string) => {
      if (!t) return;
      setLoading(true);
      setLoadError(null);
      try {
        setInfo(await fetchInviteInfo(t));
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Invite not found"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  const submit = async () => {
    if (!info) return;
    setSubmitError(null);
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setSubmitError("Passwords don't match");
      return;
    }
    if (!name.trim()) {
      setSubmitError("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const session = await acceptInvite(token, { name: name.trim(), password });
      await setSession(
        session.shelter,
        session.accessToken,
        session.mustChangePassword,
        session.member ?? null
      );
      router.replace("/(app)/(tabs)/dashboard");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Could not accept invite"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Text
              style={{
                fontSize: 11,
                letterSpacing: 1.6,
                fontWeight: "700",
                color: theme.colors.primary,
                textTransform: "uppercase"
              }}
            >
              You've been invited
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "700", color: theme.colors.ink }}>
              Join a Fetcht Shelter team
            </Text>
          </View>

          {!info && !loading && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Invite token</Text>
              <TextInput
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Paste the token from your invite link"
                style={{ ...styles.input, fontFamily: "Courier" }}
              />
              <Pressable
                onPress={() => load(token)}
                disabled={!token}
                style={({ pressed }) => ({
                  marginTop: 8,
                  paddingVertical: 12,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.primary,
                  alignItems: "center",
                  opacity: !token ? 0.5 : pressed ? 0.9 : 1
                })}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                  Look up invite
                </Text>
              </Pressable>
              {loadError && (
                <Text
                  style={{ marginTop: 8, color: theme.colors.danger, fontSize: 12 }}
                >
                  {loadError}
                </Text>
              )}
            </View>
          )}

          {loading && <ActivityIndicator color={theme.colors.primary} />}

          {info && info.status !== "active" && <UnavailableInvite info={info} />}

          {info && info.status === "active" && (
            <View style={styles.card}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8
                }}
              >
                <ShieldCheck size={18} color={theme.colors.primary} />
                <Text style={{ fontSize: 16, fontWeight: "700" }}>
                  {info.shelterName}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: theme.colors.muted }}>
                You'll join as <Text style={{ fontWeight: "700" }}>{ROLE_LABEL[info.role]}</Text>.
                Invite expires {new Date(info.expiresAt).toLocaleString()}.
              </Text>

              <View style={{ marginTop: 14 }}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  value={info.email}
                  editable={false}
                  style={{ ...styles.input, color: theme.colors.muted }}
                />
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={styles.fieldLabel}>Your name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Full name"
                  style={styles.input}
                  autoComplete="name"
                />
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={styles.fieldLabel}>New password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={styles.input}
                  autoComplete="new-password"
                />
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={styles.fieldLabel}>Confirm password</Text>
                <TextInput
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  style={styles.input}
                  autoComplete="new-password"
                />
              </View>
              {submitError && (
                <Text
                  style={{ marginTop: 10, color: theme.colors.danger, fontSize: 12 }}
                >
                  {submitError}
                </Text>
              )}
              <Pressable
                onPress={submit}
                disabled={submitting}
                style={({ pressed }) => ({
                  marginTop: 16,
                  paddingVertical: 13,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.primary,
                  alignItems: "center",
                  opacity: submitting ? 0.6 : pressed ? 0.9 : 1
                })}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                  {submitting ? "Joining…" : `Accept & join as ${ROLE_LABEL[info.role]}`}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function UnavailableInvite({ info }: { info: ShelterInviteInfo }) {
  const router = useRouter();
  const map = {
    expired: { Icon: Clock, tint: theme.colors.warning, title: "This invite has expired" },
    accepted: {
      Icon: CheckCircle2,
      tint: theme.colors.success,
      title: "This invite was already used"
    },
    revoked: {
      Icon: XCircle,
      tint: theme.colors.danger,
      title: "This invite was revoked"
    }
  } as const;
  const entry = map[info.status as "expired" | "accepted" | "revoked"] ?? {
    Icon: AlertTriangle,
    tint: theme.colors.danger,
    title: "Invite unavailable"
  };
  const Icon = entry.Icon;
  return (
    <View style={{ ...styles.card, alignItems: "center" }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: entry.tint + "22"
        }}
      >
        <Icon size={22} color={entry.tint} />
      </View>
      <Text
        style={{
          marginTop: 10,
          fontSize: 16,
          fontWeight: "700",
          color: theme.colors.ink
        }}
      >
        {entry.title}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 13,
          color: theme.colors.muted,
          textAlign: "center"
        }}
      >
        Ask an admin at {info.shelterName} to send a fresh link.
      </Text>
      <Pressable
        onPress={() => router.replace("/(auth)/login")}
        style={({ pressed }) => ({
          marginTop: 14,
          paddingHorizontal: 18,
          paddingVertical: 10,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.8 : 1
        })}
      >
        <Text style={{ fontWeight: "700", color: theme.colors.ink }}>
          Back to sign in
        </Text>
      </Pressable>
    </View>
  );
}

const styles = {
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: theme.colors.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
    marginBottom: 6
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: "#FFFFFF"
  }
} as const;
