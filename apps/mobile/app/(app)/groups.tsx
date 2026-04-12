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
import { ArrowLeft, MessageCircle, Users2 } from "lucide-react-native";
import { Image } from "expo-image";

import { useTranslation } from "react-i18next";
import { listGroups, joinGroup } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { CommunityGroup } from "@petto/contracts";

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
    onMutate: async (groupId: string) => {
      // Optimistic update — immediately show as member
      await queryClient.cancelQueries({ queryKey: ["groups"] });
      const prev = queryClient.getQueryData<CommunityGroup[]>(["groups"]);
      queryClient.setQueryData<CommunityGroup[]>(["groups"], (old) =>
        old?.map((g) =>
          g.id === groupId ? { ...g, isMember: true, memberCount: g.memberCount + 1 } : g
        ) ?? []
      );
      return { prev };
    },
    onError: (_err, _groupId, context) => {
      if (context?.prev) queryClient.setQueryData(["groups"], context.prev);
    },
    onSettled: () => {
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
            {/* Member avatars */}
            {group.isMember && group.members?.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                {group.members?.slice(0, 5).map((member, idx) => (
                  <View
                    key={member.userId}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      borderWidth: 2,
                      borderColor: theme.colors.white,
                      overflow: "hidden",
                      backgroundColor: theme.colors.background,
                      marginLeft: idx > 0 ? -8 : 0
                    }}
                  >
                    {member.avatarUrl ? (
                      <Image
                        source={{ uri: member.avatarUrl }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.colors.primaryBg }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.primary }}>
                          {member.firstName?.[0] ?? "?"}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
                {group.members?.length > 5 && (
                  <Text style={{ fontSize: mobileTheme.typography.micro.fontSize, color: theme.colors.muted, marginLeft: 4 }}>
                    +{group.members?.length - 5}
                  </Text>
                )}
              </View>
            )}

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Users2 size={14} color={theme.colors.muted} />
                <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, color: theme.colors.muted }}>
                  {t("groups.members", { count: group.memberCount })}
                </Text>
              </View>
              {group.isMember ? (
                <Pressable
                  onPress={() => group.conversationId && router.push(`/(app)/conversation/${group.conversationId}` as any)}
                  style={{
                    backgroundColor: theme.colors.primary,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: mobileTheme.radius.md,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6
                  }}
                >
                  <MessageCircle size={14} color={theme.colors.white} />
                  <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.white }}>
                    {t("groups.chat")}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => joinMutation.mutate(group.id)}
                  disabled={joinMutation.isPending}
                  style={{
                    backgroundColor: theme.colors.primaryBg,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: mobileTheme.radius.md,
                    opacity: joinMutation.isPending ? 0.5 : 1
                  }}
                >
                  <Text style={{ fontSize: mobileTheme.typography.caption.fontSize, fontWeight: "600", color: theme.colors.primary }}>
                    {joinMutation.isPending ? t("common.loading") : t("common.join")}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
