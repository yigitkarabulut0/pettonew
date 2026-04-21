// User's adoption applications. Status badge + withdraw action.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Clock, HeartHandshake, Inbox, MessageSquare, PawPrint, X } from "lucide-react-native";

import { LottieLoading } from "@/components/lottie-loading";
import { listMyAdoptionApplications, withdrawAdoptionApplication } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { AdoptionApplication } from "@petto/contracts";

const STATUS_META: Record<
  AdoptionApplication["status"],
  { label: string; tone: string; icon: React.ComponentType<{ size: number; color: string }> }
> = {
  pending: { label: "Pending review", tone: "warning", icon: Clock },
  approved: { label: "Approved", tone: "primary", icon: HeartHandshake },
  chat_open: { label: "Chat open", tone: "primary", icon: MessageSquare },
  adopted: { label: "Adopted", tone: "success", icon: HeartHandshake },
  rejected: { label: "Declined", tone: "danger", icon: X },
  withdrawn: { label: "Withdrawn", tone: "muted", icon: X }
};

export default function MyApplicationsPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["my-applications"],
    queryFn: () => listMyAdoptionApplications(token),
    enabled: Boolean(token)
  });

  const withdrawMutation = useMutation({
    mutationFn: (appId: string) => withdrawAdoptionApplication(token, appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-applications"] });
    },
    onError: (err: Error) => Alert.alert("Could not withdraw", err.message)
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 10,
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.white,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={theme.colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: theme.colors.ink }}>
          My applications
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <LottieLoading />
        </View>
      ) : apps.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Inbox size={32} color={theme.colors.muted} />
          <Text style={{ marginTop: 10, fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.colors.ink }}>
            No applications yet
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontSize: 12,
              color: theme.colors.muted,
              fontFamily: "Inter_400Regular",
              textAlign: "center"
            }}
          >
            Browse adoptable pets and submit your first application.
          </Text>
          <Pressable
            onPress={() => router.push("/(app)/adopt" as any)}
            style={{
              marginTop: 14,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: theme.colors.primary
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_700Bold" }}>
              Browse pets
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: mobileTheme.spacing.xl, gap: 10, paddingBottom: insets.bottom + 20 }}>
          {apps.map((app) => {
            const meta = STATUS_META[app.status] ?? STATUS_META.pending;
            const Icon = meta.icon;
            const canWithdraw = app.status === "pending" || app.status === "chat_open";
            return (
              <View
                key={app.id}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: theme.colors.white,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: "row",
                  gap: 12
                }}
              >
                {app.petPhoto ? (
                  <Image
                    source={{ uri: app.petPhoto }}
                    style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: theme.colors.border }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 12,
                      backgroundColor: theme.colors.border,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <PawPrint size={22} color={theme.colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: theme.colors.ink }} numberOfLines={1}>
                      {app.petName ?? "Pet"}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: toneBg(theme, meta.tone)
                      }}
                    >
                      <Icon size={10} color={toneFg(theme, meta.tone)} />
                      <Text
                        style={{
                          fontSize: 9.5,
                          fontFamily: "Inter_700Bold",
                          color: toneFg(theme, meta.tone),
                          letterSpacing: 0.3
                        }}
                      >
                        {meta.label.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  {app.shelterName ? (
                    <Text style={{ marginTop: 2, fontSize: 11, color: theme.colors.muted, fontFamily: "Inter_500Medium" }} numberOfLines={1}>
                      {app.shelterName}
                    </Text>
                  ) : null}
                  {app.rejectionReason && app.status === "rejected" ? (
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: theme.colors.muted,
                        fontFamily: "Inter_400Regular"
                      }}
                      numberOfLines={2}
                    >
                      {app.rejectionReason}
                    </Text>
                  ) : null}
                  {canWithdraw ? (
                    <Pressable
                      onPress={() =>
                        Alert.alert(
                          "Withdraw application?",
                          "This cannot be undone.",
                          [
                            { text: "Keep", style: "cancel" },
                            {
                              text: "Withdraw",
                              style: "destructive",
                              onPress: () => withdrawMutation.mutate(app.id)
                            }
                          ]
                        )
                      }
                      style={{ alignSelf: "flex-start", marginTop: 8 }}
                    >
                      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: theme.colors.danger }}>
                        Withdraw
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function toneBg(theme: ReturnType<typeof useTheme>, tone: string): string {
  switch (tone) {
    case "success":
      return theme.colors.successBg;
    case "warning":
      return "rgba(199,127,31,0.10)";
    case "danger":
      return "rgba(161,70,50,0.10)";
    case "primary":
      return theme.colors.primaryBg as string;
    default:
      return theme.colors.border as string;
  }
}

function toneFg(theme: ReturnType<typeof useTheme>, tone: string): string {
  switch (tone) {
    case "success":
      return theme.colors.success;
    case "warning":
      return "#C77F1F";
    case "danger":
      return theme.colors.danger;
    case "primary":
      return theme.colors.primary;
    default:
      return theme.colors.muted;
  }
}
