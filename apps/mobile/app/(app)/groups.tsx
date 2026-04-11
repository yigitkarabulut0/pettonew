import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { LottieLoading } from "@/components/lottie-loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Users2 } from "lucide-react-native";

import { useTranslation } from "react-i18next";
import { listGroups, joinGroup } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";

export default function GroupsPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();

  const token = session?.tokens.accessToken ?? "";

  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(token),
    enabled: Boolean(token)
  });

  const joinMutation = useMutation({
    mutationFn: (groupId: string) => joinGroup(token, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    }
  });

  const onRefresh = useCallback(() => {
    groupsQuery.refetch();
  }, [groupsQuery]);

  const groups = groupsQuery.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + mobileTheme.spacing.md,
          paddingBottom: mobileTheme.spacing.lg,
          paddingHorizontal: mobileTheme.spacing.xl,
          backgroundColor: theme.colors.white,
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <ArrowLeft size={18} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: mobileTheme.typography.subheading.fontSize,
              fontWeight: mobileTheme.typography.subheading.fontWeight,
              color: theme.colors.ink
            }}
          >
            {t("groups.title")}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: mobileTheme.spacing.xl,
          paddingTop: mobileTheme.spacing.xl,
          paddingBottom: insets.bottom + 24
        }}
        refreshControl={
          <RefreshControl
            refreshing={groupsQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Loading */}
        {groupsQuery.isLoading && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center" }}>
            <LottieLoading size={70} />
          </View>
        )}

        {/* Empty */}
        {!groupsQuery.isLoading && groups.length === 0 && (
          <View style={{ paddingVertical: mobileTheme.spacing["4xl"], alignItems: "center", gap: mobileTheme.spacing.lg }}>
            <Users2 size={48} color={theme.colors.muted} />
            <Text style={{ fontSize: mobileTheme.typography.subheading.fontSize, fontWeight: mobileTheme.typography.subheading.fontWeight, color: theme.colors.ink }}>
              {t("groups.noGroups")}
            </Text>
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, textAlign: "center", paddingHorizontal: mobileTheme.spacing["3xl"] }}>
              {t("groups.noGroupsDescription")}
            </Text>
          </View>
        )}

        {/* Groups */}
        {groups.map((group) => (
          <View
            key={group.id}
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: mobileTheme.radius.lg,
              padding: mobileTheme.spacing.xl,
              marginBottom: mobileTheme.spacing.md,
              gap: mobileTheme.spacing.sm,
              ...mobileTheme.shadow.sm
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: mobileTheme.typography.bodySemiBold.fontSize, fontWeight: "600", color: theme.colors.ink, flex: 1 }}>
                {group.name}
              </Text>
              <View
                style={{
                  backgroundColor: theme.colors.secondarySoft,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: mobileTheme.radius.pill
                }}
              >
                <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, fontWeight: "600", color: theme.colors.secondary, textTransform: "capitalize" }}>
                  {group.petType}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: mobileTheme.typography.body.fontSize, color: theme.colors.muted, lineHeight: mobileTheme.typography.body.lineHeight }}>
              {group.description}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Users2 size={14} color={theme.colors.muted} />
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>
                  {t("groups.members", { count: group.memberCount })}
                </Text>
              </View>
              <Pressable
                onPress={() => joinMutation.mutate(group.id)}
                disabled={joinMutation.isPending}
                style={{
                  backgroundColor: theme.colors.primaryBg,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: mobileTheme.radius.md
                }}
              >
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.primary }}>
                  {t("common.join")}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
