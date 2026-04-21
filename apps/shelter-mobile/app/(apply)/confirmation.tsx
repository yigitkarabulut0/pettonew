import { useMemo } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  Text,
  View
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle2, Clock, Copy, FileCheck } from "lucide-react-native";

import { useApplyStore } from "@/store/apply";
import { theme } from "@/lib/theme";

// Static post-submit screen. Shows SLA deadline + the status link the
// applicant can return to later. Intentionally free of action buttons
// that change server state — from here it's just "we'll be in touch".

export default function ApplyConfirmationScreen() {
  const router = useRouter();
  const lastResult = useApplyStore((s) => s.lastResult);
  const reset = useApplyStore((s) => s.reset);
  const clearResult = useApplyStore((s) => s.clearResult);

  const deadlineLabel = useMemo(() => {
    if (!lastResult?.slaDeadline) return "within 48 hours";
    const d = new Date(lastResult.slaDeadline);
    if (Number.isNaN(d.getTime())) return "within 48 hours";
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }, [lastResult]);

  if (!lastResult) {
    // If someone hits this screen with no submission cached, just bounce
    // them back to step 1.
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
          padding: 24
        }}
      >
        <Text style={{ color: theme.colors.muted }}>
          No application submitted yet.
        </Text>
        <Pressable
          onPress={() => router.replace("/(apply)/entity-type")}
          style={({ pressed }) => ({
            marginTop: 16,
            paddingHorizontal: 18,
            height: 44,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.9 : 1
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
            Start a new application
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const shareToken = async () => {
    try {
      await Share.share({ message: lastResult.accessToken });
    } catch {
      /* ignore */
    }
  };

  const copyToken = () => {
    // Clipboard is optional; Share gives the same utility on mobile.
    Alert.alert("Your access token", lastResult.accessToken, [
      { text: "OK" }
    ]);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 20
        }}
      >
        <View
          style={{
            borderRadius: theme.radius.xl,
            overflow: "hidden",
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: theme.colors.border
          }}
        >
          <View
            style={{
              padding: 24,
              backgroundColor: theme.colors.primaryBg
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <CheckCircle2 size={24} color={theme.colors.primary} />
            </View>
            <Text
              style={{
                marginTop: 14,
                fontSize: 11,
                letterSpacing: 1.5,
                fontWeight: "700",
                textTransform: "uppercase",
                color: theme.colors.primary
              }}
            >
              Application received
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontSize: 22,
                fontWeight: "700",
                color: theme.colors.ink
              }}
            >
              We'll get back to you by {deadlineLabel}
            </Text>
            <Text
              style={{
                marginTop: 8,
                fontSize: 14,
                color: theme.colors.muted,
                lineHeight: 20
              }}
            >
              Our team reviews every application manually. You'll receive
              a decision within 48 hours.
            </Text>
          </View>

          <View style={{ padding: 20, gap: 14 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10
              }}
            >
              <Clock size={16} color={theme.colors.muted} />
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
                Review deadline: {deadlineLabel}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10
              }}
            >
              <FileCheck size={16} color={theme.colors.muted} />
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
                Application ID: {lastResult.id}
              </Text>
            </View>
          </View>
        </View>

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
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.6,
              color: theme.colors.muted
            }}
          >
            Save this access token
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.muted }}>
            Enter it on the status screen to check progress anytime — no
            login required.
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 12,
                fontFamily: "Courier",
                color: theme.colors.ink
              }}
            >
              {lastResult.accessToken}
            </Text>
            <Pressable
              onPress={copyToken}
              style={({ pressed }) => ({
                flexDirection: "row",
                gap: 4,
                alignItems: "center",
                paddingHorizontal: 12,
                height: 36,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.7 : 1
              })}
            >
              <Copy size={14} color={theme.colors.ink} />
              <Text style={{ fontSize: 12, fontWeight: "600" }}>View</Text>
            </Pressable>
            <Pressable
              onPress={shareToken}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                height: 36,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.9 : 1
              })}
            >
              <Text
                style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}
              >
                Share
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/(apply)/status",
              params: { token: lastResult.accessToken }
            })
          }
          style={({ pressed }) => ({
            paddingVertical: 14,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.primary,
            alignItems: "center",
            opacity: pressed ? 0.9 : 1
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
            Go to status page
          </Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            await reset();
            await clearResult();
            router.replace("/(auth)/login");
          }}
          style={({ pressed }) => ({
            paddingVertical: 12,
            alignItems: "center",
            opacity: pressed ? 0.6 : 1
          })}
        >
          <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
            Back to sign in
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
