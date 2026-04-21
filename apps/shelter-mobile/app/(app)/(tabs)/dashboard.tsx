import { useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  BadgeCheck,
  BarChart3,
  ChevronRight,
  Clock,
  HeartHandshake,
  Inbox,
  MessageSquare,
  PawPrint
} from "lucide-react-native";

import { getMyShelter, getShelterStats } from "@/lib/api";
import { theme } from "@/lib/theme";

export default function DashboardScreen() {
  const router = useRouter();
  const { data: shelter } = useQuery({
    queryKey: ["shelter-me"],
    queryFn: getMyShelter
  });
  const { data: stats } = useQuery({
    queryKey: ["shelter-stats"],
    queryFn: getShelterStats
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View>
          <Text style={{ fontSize: 11, color: theme.colors.muted, fontWeight: "600", letterSpacing: 0.5 }}>
            WELCOME BACK
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: theme.colors.ink }}>
              {shelter?.name ?? "Shelter panel"}
            </Text>
            {shelter?.verifiedAt && (
              <BadgeCheck size={20} color={theme.colors.primary} />
            )}
          </View>
        </View>

        {shelter && !shelter.verifiedAt && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
              padding: 12,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.warningBg,
              borderWidth: 1,
              borderColor: theme.colors.warning
            }}
          >
            <Clock size={16} color={theme.colors.warning} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.ink }}>
                Account pending verification
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: theme.colors.muted,
                  lineHeight: 16
                }}
              >
                Listing pets and reviewing applications unlock once our
                team completes review.
              </Text>
            </View>
          </View>
        )}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md }}>
          <StatCard
            label="Available pets"
            value={stats?.availablePets ?? 0}
            hint={`${stats?.totalPets ?? 0} total`}
            icon={<PawPrint size={18} color={theme.colors.primary} />}
          />
          <StatCard
            label="Pending applications"
            value={stats?.pendingApplications ?? 0}
            hint="Awaiting review"
            icon={<Inbox size={18} color={theme.colors.primary} />}
            highlight
          />
          <StatCard
            label="Active chats"
            value={stats?.activeChats ?? 0}
            hint="Approved applicants"
            icon={<MessageSquare size={18} color={theme.colors.primary} />}
          />
          <StatCard
            label="Adopted"
            value={stats?.adoptedPets ?? 0}
            hint="All-time"
            icon={<HeartHandshake size={18} color={theme.colors.primary} />}
          />
        </View>

        <Pressable
          onPress={() => router.push("/(app)/analytics" as any)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.88 : 1
          })}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.primaryBg,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <BarChart3 size={18} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.ink }}>
              View analytics
            </Text>
            <Text style={{ marginTop: 2, fontSize: 11, color: theme.colors.muted }}>
              Listing performance, adoption funnel, and time-to-adoption
            </Text>
          </View>
          <ChevronRight size={18} color={theme.colors.muted} />
        </Pressable>

        <View
          style={{
            padding: theme.spacing.lg,
            backgroundColor: theme.colors.primaryBg,
            borderRadius: theme.radius.lg
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.primary }}>
            💡 Tip
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: theme.colors.ink, lineHeight: 18 }}>
            Keep at least one photo on every pet listing so applicants see them
            right away on the app.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  highlight
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: "45%",
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: highlight ? theme.colors.primary : theme.colors.border
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 10, fontWeight: "600", color: theme.colors.muted, letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </Text>
        {icon}
      </View>
      <Text style={{ marginTop: 8, fontSize: 28, fontWeight: "700", color: theme.colors.ink }}>
        {value}
      </Text>
      <Text style={{ marginTop: 2, fontSize: 11, color: theme.colors.muted }}>{hint}</Text>
    </View>
  );
}
