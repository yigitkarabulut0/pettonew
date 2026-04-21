import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  RefreshCw,
  XCircle
} from "lucide-react-native";
import type { ShelterApplication } from "@petto/contracts";

import { fetchApplicationStatus } from "@/lib/apply-api";
import { useApplyStore } from "@/store/apply";
import { theme } from "@/lib/theme";

const REASON_LABELS: Record<string, string> = {
  invalid_registration: "Registration number couldn't be verified",
  documents_unclear: "Documents unclear or incomplete",
  jurisdiction_mismatch: "Jurisdiction mismatch with your registration",
  duplicate: "Duplicate of an existing application or shelter",
  out_of_scope: "Outside our current scope",
  other: "Other — see note"
};

export default function ApplyStatusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const lastResult = useApplyStore((s) => s.lastResult);
  const [token, setToken] = useState(
    (params?.token as string) ?? lastResult?.accessToken ?? ""
  );
  const [app, setApp] = useState<ShelterApplication | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (t: string) => {
    if (!t) {
      setError("Enter your access token to check status.");
      setApp(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setApp(await fetchApplicationStatus(t));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load status");
      setApp(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) void load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          gap: 10
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.colors.primaryBg : "#FFFFFF",
            borderWidth: 1,
            borderColor: theme.colors.border
          })}
        >
          <ArrowLeft size={18} color={theme.colors.ink} />
        </Pressable>
        <Text
          style={{
            fontSize: 17,
            fontWeight: "700",
            color: theme.colors.ink
          }}
        >
          Application status
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={loading && Boolean(app)}
            onRefresh={() => load(token)}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View
          style={{
            borderRadius: theme.radius.lg,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 14,
            gap: 10
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.6,
              color: theme.colors.muted
            }}
          >
            Access token
          </Text>
          <TextInput
            value={token}
            onChangeText={setToken}
            placeholder="Paste your access token"
            style={{
              height: 44,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              paddingHorizontal: 12,
              fontSize: 13,
              backgroundColor: "#FFFFFF",
              fontFamily: "Courier"
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={() => load(token)}
            style={({ pressed }) => ({
              flexDirection: "row",
              gap: 6,
              alignItems: "center",
              justifyContent: "center",
              height: 42,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.9 : 1
            })}
          >
            <RefreshCw size={14} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
              {loading ? "Loading…" : "Check status"}
            </Text>
          </Pressable>
        </View>

        {loading && !app && (
          <ActivityIndicator color={theme.colors.primary} />
        )}

        {error && (
          <View
            style={{
              padding: 12,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.dangerBg,
              borderWidth: 1,
              borderColor: theme.colors.danger
            }}
          >
            <Text style={{ color: theme.colors.danger, fontSize: 13 }}>
              {error}
            </Text>
          </View>
        )}

        {app && <StatusCard app={app} />}

        {app?.status === "approved" && <ApprovedFooter email={app.primaryContactEmail} />}
        {app?.status === "rejected" && <RejectedFooter app={app} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusCard({ app }: { app: ShelterApplication }) {
  const { Icon, tone, title, description } = (() => {
    switch (app.status) {
      case "submitted":
        return {
          Icon: Clock,
          tone: theme.colors.primary,
          title: "We're reviewing your application",
          description:
            "Our team reviews every application manually. You'll hear back within 48 hours."
        };
      case "under_review":
        return {
          Icon: Clock,
          tone: theme.colors.primary,
          title: "A reviewer has picked up your application",
          description: "No action needed on your side."
        };
      case "approved":
        return {
          Icon: CheckCircle2,
          tone: theme.colors.success,
          title: "Approved",
          description: "Your shelter account is verified and ready."
        };
      case "rejected":
        return {
          Icon: XCircle,
          tone: theme.colors.danger,
          title: "Application not approved",
          description:
            "See the details below for what to address if you'd like to try again."
        };
      default:
        return {
          Icon: Clock,
          tone: theme.colors.muted,
          title: "Unknown status",
          description: ""
        };
    }
  })();
  return (
    <View
      style={{
        borderRadius: theme.radius.xl,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 16,
        gap: 10
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: tone + "22",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Icon size={18} color={tone} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: tone }}>
            {app.status.replace("_", " ").toUpperCase()}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: 16,
              fontWeight: "700",
              color: theme.colors.ink
            }}
          >
            {title}
          </Text>
        </View>
      </View>
      {description ? (
        <Text style={{ fontSize: 13, color: theme.colors.muted, lineHeight: 18 }}>
          {description}
        </Text>
      ) : null}
      <Text style={{ fontSize: 12, color: theme.colors.muted }}>
        {app.orgName}
      </Text>
      <Text style={{ fontSize: 11, color: theme.colors.muted }}>
        Submitted {new Date(app.submittedAt).toLocaleString()} · deadline{" "}
        {new Date(app.slaDeadline).toLocaleString()}
      </Text>
    </View>
  );
}

function ApprovedFooter({ email }: { email: string }) {
  const router = useRouter();
  return (
    <View
      style={{
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.successBg,
        borderWidth: 1,
        borderColor: theme.colors.success,
        padding: 16,
        gap: 10
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.ink }}>
        You're in!
      </Text>
      <Text style={{ fontSize: 13, color: theme.colors.ink, lineHeight: 18 }}>
        Our team created your shelter account. Check the email you used
        ({email}) for your temporary password, then sign in below.
      </Text>
      <Pressable
        onPress={() => router.replace("/(auth)/login")}
        style={({ pressed }) => ({
          paddingVertical: 12,
          alignItems: "center",
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.primary,
          opacity: pressed ? 0.9 : 1
        })}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
          Sign in
        </Text>
      </Pressable>
    </View>
  );
}

function RejectedFooter({ app }: { app: ShelterApplication }) {
  const router = useRouter();
  const reset = useApplyStore((s) => s.reset);
  const clearResult = useApplyStore((s) => s.clearResult);
  const label =
    (app.rejectionReasonCode &&
      REASON_LABELS[app.rejectionReasonCode as keyof typeof REASON_LABELS]) ||
    "Other";
  return (
    <View
      style={{
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.dangerBg,
        borderWidth: 1,
        borderColor: theme.colors.danger,
        padding: 16,
        gap: 10
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.ink }}>
        Reason for this decision
      </Text>
      <Text
        style={{ fontSize: 14, fontWeight: "600", color: theme.colors.ink }}
      >
        {label}
      </Text>
      {app.rejectionReasonNote ? (
        <Text style={{ fontSize: 13, color: theme.colors.ink, lineHeight: 19 }}>
          {app.rejectionReasonNote}
        </Text>
      ) : null}
      <Pressable
        onPress={async () => {
          await reset();
          await clearResult();
          router.replace("/(apply)/entity-type");
        }}
        style={({ pressed }) => ({
          marginTop: 4,
          paddingVertical: 12,
          alignItems: "center",
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.primary,
          opacity: pressed ? 0.9 : 1
        })}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
          Start a new application
        </Text>
      </Pressable>
    </View>
  );
}
