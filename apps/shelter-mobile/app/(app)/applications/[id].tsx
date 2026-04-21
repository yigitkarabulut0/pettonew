import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, CheckCircle2, Home, MessageSquare, PawPrint, Users, X } from "lucide-react-native";

import {
  approveApplication,
  completeAdoption,
  getShelterApplication,
  rejectApplication
} from "@/lib/api";
import { theme } from "@/lib/theme";

export default function ApplicationDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const appId = Array.isArray(id) ? id[0] : id;

  const { data: app, isLoading } = useQuery({
    queryKey: ["shelter-application", appId],
    queryFn: () => getShelterApplication(appId as string),
    enabled: Boolean(appId)
  });

  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const approveMut = useMutation({
    mutationFn: () => approveApplication(appId as string),
    onSuccess: (refreshed) => {
      queryClient.invalidateQueries({ queryKey: ["shelter-application", appId] });
      queryClient.invalidateQueries({ queryKey: ["shelter-applications"] });
      queryClient.invalidateQueries({ queryKey: ["shelter-conversations"] });
      if (refreshed?.conversationId) {
        router.push(
          `/(app)/conversation/${refreshed.conversationId}?title=${encodeURIComponent(refreshed.userName ?? "Applicant")}` as any
        );
      } else {
        Alert.alert("Approved — chat opened");
      }
    },
    onError: (err: Error) => Alert.alert("Could not approve", err.message)
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectApplication(appId as string, reason),
    onSuccess: () => {
      setShowReject(false);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["shelter-application", appId] });
      queryClient.invalidateQueries({ queryKey: ["shelter-applications"] });
    },
    onError: (err: Error) => Alert.alert("Could not reject", err.message)
  });

  const completeMut = useMutation({
    mutationFn: () => completeAdoption(appId as string),
    onSuccess: () => {
      Alert.alert("Adoption complete 🎉");
      queryClient.invalidateQueries({ queryKey: ["shelter-application", appId] });
      queryClient.invalidateQueries({ queryKey: ["shelter-applications"] });
    },
    onError: (err: Error) => Alert.alert("Could not update", err.message)
  });

  if (isLoading || !app) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={22} color={theme.colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.ink }}>Application</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing.md,
            padding: theme.spacing.md,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border
          }}
        >
          {app.petPhoto ? (
            <Image
              source={{ uri: app.petPhoto }}
              style={{ width: 72, height: 72, borderRadius: theme.radius.md, backgroundColor: theme.colors.border }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.border,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <PawPrint size={24} color={theme.colors.muted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.ink }} numberOfLines={1}>
              {app.petName ?? "Pet"}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 11, color: theme.colors.muted }}>
              Application by {app.userName}
            </Text>
            <Text style={{ marginTop: 6, fontSize: 10, fontWeight: "700", color: statusColor(app.status), letterSpacing: 0.4 }}>
              {app.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <Section title="Applicant profile">
          <InfoRow icon={<Home size={14} color={theme.colors.muted} />} label="Housing" value={app.housingType || "—"} />
          <InfoRow icon={<Users size={14} color={theme.colors.muted} />} label="Other pets" value={app.hasOtherPets ? app.otherPetsDetail || "Yes" : "None"} />
          {app.experience ? <Block label="Experience" value={app.experience} /> : null}
          {app.message ? <Block label="Message" value={app.message} /> : null}
        </Section>

        {app.status === "pending" ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Pressable
              onPress={() => approveMut.mutate()}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 14,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.primary,
                opacity: pressed ? 0.9 : 1
              })}
            >
              <Check size={16} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Approve & open chat</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowReject((v) => !v)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 12,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.7 : 1
              })}
            >
              <X size={16} color={theme.colors.danger} />
              <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>Reject</Text>
            </Pressable>

            {showReject ? (
              <View style={{ gap: theme.spacing.sm, marginTop: 4 }}>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Reason (optional, visible to applicant)"
                  placeholderTextColor={theme.colors.muted}
                  style={{
                    height: 42,
                    paddingHorizontal: 12,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.background,
                    color: theme.colors.ink,
                    fontSize: 13
                  }}
                />
                <Pressable
                  onPress={() => rejectMut.mutate()}
                  style={({ pressed }) => ({
                    paddingVertical: 12,
                    borderRadius: theme.radius.pill,
                    backgroundColor: theme.colors.danger,
                    alignItems: "center",
                    opacity: pressed ? 0.85 : 1
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Confirm reject</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : app.status === "chat_open" ? (
          <View style={{ gap: theme.spacing.sm }}>
            {app.conversationId ? (
              <Pressable
                onPress={() =>
                  router.push(
                    `/(app)/conversation/${app.conversationId}?title=${encodeURIComponent(app.userName)}` as any
                  )
                }
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 14,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.primary,
                  opacity: pressed ? 0.9 : 1
                })}
              >
                <MessageSquare size={16} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                  Open chat with {app.userName}
                </Text>
              </Pressable>
            ) : (
              <View
                style={{
                  padding: theme.spacing.md,
                  borderRadius: theme.radius.lg,
                  backgroundColor: theme.colors.primaryBg,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8
                }}
              >
                <MessageSquare size={16} color={theme.colors.primary} />
                <Text style={{ flex: 1, fontSize: 12, color: theme.colors.ink, lineHeight: 17 }}>
                  Chat with <Text style={{ fontWeight: "700" }}>{app.userName}</Text> is being
                  set up. Pull to refresh.
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => completeMut.mutate()}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 12,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.8 : 1
              })}
            >
              <CheckCircle2 size={16} color={theme.colors.success} />
              <Text style={{ color: theme.colors.success, fontWeight: "700" }}>Mark adopted</Text>
            </Pressable>
          </View>
        ) : app.status === "rejected" && app.rejectionReason ? (
          <Section title="Rejection reason">
            <Text style={{ fontSize: 13, color: theme.colors.ink }}>{app.rejectionReason}</Text>
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.muted, letterSpacing: 0.5 }}>
        {title.toUpperCase()}
      </Text>
      <View
        style={{
          padding: theme.spacing.md,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: theme.spacing.sm
        }}
      >
        {children}
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon}
        <Text style={{ fontSize: 12, color: theme.colors.muted }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 13, color: theme.colors.ink, fontWeight: "600", flex: 1, textAlign: "right", marginLeft: 12 }}>
        {value}
      </Text>
    </View>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 4, paddingTop: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.muted }}>{label}</Text>
      <Text style={{ fontSize: 13, color: theme.colors.ink, lineHeight: 18 }}>{value}</Text>
    </View>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "pending":
      return theme.colors.warning;
    case "approved":
    case "chat_open":
      return theme.colors.primary;
    case "adopted":
      return theme.colors.success;
    case "rejected":
    case "withdrawn":
      return theme.colors.danger;
    default:
      return theme.colors.muted;
  }
}
