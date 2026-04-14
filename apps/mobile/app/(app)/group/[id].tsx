import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  View
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  Crown,
  Hash,
  Info,
  Key,
  LogOut,
  Lock,
  MapPin,
  MessageCircle,
  MicOff,
  MoreVertical,
  PawPrint,
  Share2,
  ShieldCheck,
  UserMinus,
  X
} from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import {
  demoteGroupAdmin,
  getGroupDetail,
  joinGroup,
  kickGroupMember,
  leaveGroup,
  muteGroupMember,
  promoteGroupAdmin,
  unmuteGroupMember
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { GroupMember } from "@petto/contracts";

export default function GroupDetailPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();

  const [membersOpen, setMembersOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<GroupMember | null>(null);

  const { data: group, refetch } = useQuery({
    queryKey: ["group-detail", id],
    queryFn: () => getGroupDetail(session!.tokens.accessToken, id),
    enabled: Boolean(session && id)
  });

  const currentUserId = session?.user.id ?? "";
  const isMember = Boolean(group?.isMember);
  const isAdmin = Boolean(group?.isAdmin);
  const isOwner = Boolean(group?.isOwner);

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!session || !id) return;
      await joinGroup(session.tokens.accessToken, id);
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    }
  });

  const openChat = () => {
    if (group?.conversationId) {
      router.push(`/(app)/conversation/${group.conversationId}` as any);
    }
  };

  const performMemberAction = async (
    action: "mute-1h" | "mute-24h" | "mute-indef" | "unmute" | "promote" | "demote" | "kick",
    targetUserID: string
  ) => {
    if (!session || !group?.id) return;
    const token = session.tokens.accessToken;
    try {
      switch (action) {
        case "mute-1h":
          await muteGroupMember(token, group.id, targetUserID, "1h");
          break;
        case "mute-24h":
          await muteGroupMember(token, group.id, targetUserID, "24h");
          break;
        case "mute-indef":
          await muteGroupMember(token, group.id, targetUserID, "indefinite");
          break;
        case "unmute":
          await unmuteGroupMember(token, group.id, targetUserID);
          break;
        case "promote":
          await promoteGroupAdmin(token, group.id, targetUserID);
          break;
        case "demote":
          await demoteGroupAdmin(token, group.id, targetUserID);
          break;
        case "kick":
          await kickGroupMember(token, group.id, targetUserID);
          break;
      }
      refetch();
    } catch (err: any) {
      Alert.alert("Action failed", err?.message || "");
    }
  };

  const runMemberAction = (
    action: "mute-1h" | "mute-24h" | "mute-indef" | "unmute" | "promote" | "demote" | "kick",
    targetUserID: string,
    targetName?: string
  ) => {
    const name = targetName || "this member";
    // Destructive actions require a two-button confirm.
    const confirmed = (onConfirm: () => void, title: string, body: string, destructiveLabel: string) => {
      Alert.alert(title, body, [
        { text: t("common.cancel") as string, style: "cancel", onPress: () => setActionTarget(null) },
        {
          text: destructiveLabel,
          style: "destructive",
          onPress: async () => {
            await onConfirm();
            setActionTarget(null);
          }
        }
      ]);
    };

    switch (action) {
      case "demote":
        confirmed(
          () => performMemberAction("demote", targetUserID),
          t("groups.confirmDemoteTitle") as string,
          t("groups.confirmDemoteBody", { name }) as string,
          t("groups.demoteAdmin") as string
        );
        return;
      case "kick":
        confirmed(
          () => performMemberAction("kick", targetUserID),
          t("groups.confirmKickTitle") as string,
          t("groups.confirmKickBody", { name }) as string,
          t("groups.kickMember") as string
        );
        return;
      case "mute-indef":
        confirmed(
          () => performMemberAction("mute-indef", targetUserID),
          t("groups.confirmMuteTitle") as string,
          t("groups.confirmMuteBody", { name }) as string,
          t("groups.muteIndef") as string
        );
        return;
      default:
        performMemberAction(action, targetUserID).finally(() => setActionTarget(null));
    }
  };

  // Leave / delete group — derived from admin count.
  const adminCount =
    (group?.ownerUserId ? 1 : 0) + (group?.adminUserIds?.length ?? 0);
  const isLastAdmin = Boolean(group?.isAdmin) && adminCount <= 1;

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!session || !group?.id) throw new Error("no session");
      return leaveGroup(session.tokens.accessToken, group.id);
    },
    onSuccess: (result) => {
      // Invalidate any query that surfaces this group so the UI updates.
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group-detail", group?.id] });
      queryClient.invalidateQueries({ queryKey: ["group-by-conv"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      if (result?.deleted) {
        Alert.alert(t("groups.groupDeletedTitle") as string, t("groups.groupDeletedBody") as string);
      }
      router.replace("/(app)/groups" as any);
    },
    onError: (err: any) => {
      Alert.alert(t("groups.leaveGroup") as string, err?.message || "Failed");
    }
  });

  const handleLeavePress = () => {
    if (isLastAdmin) {
      Alert.alert(
        t("groups.confirmDeleteTitle") as string,
        t("groups.confirmDeleteBody") as string,
        [
          { text: t("common.cancel") as string, style: "cancel" },
          {
            text: t("groups.leaveAndDelete") as string,
            style: "destructive",
            onPress: () => leaveMutation.mutate()
          }
        ]
      );
    } else {
      Alert.alert(
        t("groups.confirmLeaveTitle") as string,
        t("groups.confirmLeaveBody") as string,
        [
          { text: t("common.cancel") as string, style: "cancel" },
          {
            text: t("groups.leaveGroup") as string,
            style: "destructive",
            onPress: () => leaveMutation.mutate()
          }
        ]
      );
    }
  };

  const petTypeIcon = <PawPrint size={14} color={theme.colors.white} />;

  if (!group) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: theme.colors.muted, fontFamily: "Inter_500Medium" }}>
            {t("common.loading")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────────────────── */}
        <View style={{ height: 260, backgroundColor: theme.colors.primaryBg }}>
          {group.imageUrl ? (
            <Image
              source={{ uri: group.imageUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <PawPrint size={70} color={theme.colors.primary} />
            </View>
          )}
          <LinearGradient
            colors={["rgba(22,21,20,0)", "rgba(22,21,20,0.85)"]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 170
            }}
          />

          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{
              position: "absolute",
              top: insets.top + 8,
              left: 16,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "rgba(0,0,0,0.35)",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </Pressable>

          {group.isPrivate && (
            <View
              style={{
                position: "absolute",
                top: insets.top + 12,
                right: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: "rgba(0,0,0,0.45)",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: mobileTheme.radius.pill
              }}
            >
              <Lock size={12} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                {t("groups.private")}
              </Text>
            </View>
          )}

          <View
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              bottom: 18
            }}
          >
            <Text
              numberOfLines={2}
              style={{
                color: "#FFFFFF",
                fontSize: 28,
                fontFamily: "Inter_700Bold",
                marginBottom: 6
              }}
            >
              {group.name}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: "rgba(255,255,255,0.25)",
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: mobileTheme.radius.pill
                }}
              >
                {petTypeIcon}
                <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {group.petType || "All"}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: "rgba(255,255,255,0.25)",
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: mobileTheme.radius.pill
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {t("groups.members", { count: group.memberCount })}
                </Text>
              </View>
              {group.cityLabel ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: "rgba(255,255,255,0.25)",
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: mobileTheme.radius.pill
                  }}
                >
                  <MapPin size={12} color="#FFFFFF" />
                  <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                    {group.cityLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Description & hashtags ──────────────────────── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          {group.description ? (
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.ink,
                fontFamily: "Inter_500Medium",
                lineHeight: 20
              }}
            >
              {group.description}
            </Text>
          ) : null}

          {group.hashtags && group.hashtags.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 14
              }}
            >
              {group.hashtags.map((tag) => (
                <View
                  key={tag}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: mobileTheme.radius.pill,
                    backgroundColor: theme.colors.primaryBg
                  }}
                >
                  <Hash size={12} color={theme.colors.primary} />
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.colors.primary,
                      fontFamily: "Inter_600SemiBold"
                    }}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Members strip ───────────────────────────────── */}
        {group.members && group.members.length > 0 && (
          <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "Inter_700Bold",
                  color: theme.colors.ink
                }}
              >
                {t("groups.members", { count: group.memberCount })}
              </Text>
              <Pressable onPress={() => setMembersOpen(true)}>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.primary,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {isAdmin ? t("groups.manage") : t("groups.viewAll")}
                </Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: -8 }}>
              {group.members.slice(0, 8).map((member) => (
                <View key={member.userId} style={{ marginRight: -10 }}>
                  <Avatar uri={member.avatarUrl} name={member.firstName} size="md" />
                </View>
              ))}
              {group.memberCount > 8 && (
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: theme.colors.primaryBg,
                    alignItems: "center",
                    justifyContent: "center",
                    marginLeft: 2
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.colors.primary,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    +{group.memberCount - 8}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Invite code (members only) / Join CTA (non-members) ─── */}
        {isMember && group.code ? (
          <View
            style={{
              marginTop: 24,
              marginHorizontal: 20,
              padding: 20,
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.border,
              ...mobileTheme.shadow.sm
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 6,
                gap: 8
              }}
            >
              <Key size={16} color={theme.colors.primary} />
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_700Bold",
                  color: theme.colors.primary,
                  letterSpacing: 0.5,
                  textTransform: "uppercase"
                }}
              >
                {t("groups.inviteCodeLabel")}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 13,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium",
                marginBottom: 14,
                lineHeight: 18
              }}
            >
              {t("groups.inviteCodeHint")}
            </Text>

            <View
              style={{
                paddingVertical: 18,
                paddingHorizontal: 20,
                borderRadius: mobileTheme.radius.md,
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center",
                marginBottom: 14
              }}
            >
              <Text
                selectable
                style={{
                  fontSize: 32,
                  letterSpacing: 6,
                  color: theme.colors.primary,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {group.code}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={async () => {
                  try {
                    await Share.share({
                      message: t("groups.shareCodeMessage", {
                        name: group.name,
                        code: group.code
                      })
                    });
                  } catch (err: any) {
                    Alert.alert("Share failed", err?.message || "");
                  }
                }}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: theme.colors.primary
                }}
              >
                <Share2 size={16} color={theme.colors.white} />
                <Text
                  style={{
                    color: theme.colors.white,
                    fontFamily: "Inter_700Bold",
                    fontSize: 14
                  }}
                >
                  {t("groups.shareInvite")}
                </Text>
              </Pressable>
              <Pressable
                onPress={openChat}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: theme.colors.secondarySoft
                }}
              >
                <MessageCircle size={16} color={theme.colors.secondary} />
                <Text
                  style={{
                    color: theme.colors.secondary,
                    fontFamily: "Inter_700Bold",
                    fontSize: 14
                  }}
                >
                  {t("groups.openChat")}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : !isMember ? (
          <View
            style={{
              marginTop: 24,
              marginHorizontal: 20,
              padding: 24,
              borderRadius: mobileTheme.radius.lg,
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: "center",
              ...mobileTheme.shadow.sm
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12
              }}
            >
              <Lock size={22} color={theme.colors.primary} />
            </View>
            <Text
              style={{
                fontSize: 16,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold",
                marginBottom: 6
              }}
            >
              {t("groups.joinToChatTitle")}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium",
                textAlign: "center",
                lineHeight: 19,
                marginBottom: 16,
                maxWidth: 260
              }}
            >
              {t("groups.joinToChatBody")}
            </Text>
            <Pressable
              onPress={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
              style={{
                alignSelf: "stretch",
                paddingVertical: 14,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.primary,
                alignItems: "center",
                opacity: joinMutation.isPending ? 0.6 : 1
              }}
            >
              <Text
                style={{
                  color: theme.colors.white,
                  fontFamily: "Inter_700Bold",
                  fontSize: 15
                }}
              >
                {t("groups.joinToChat")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Rules ───────────────────────────────────────── */}
        {group.rules && group.rules.length > 0 && (
          <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 10
              }}
            >
              <Info size={16} color={theme.colors.secondary} />
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "Inter_700Bold",
                  color: theme.colors.ink
                }}
              >
                {t("groups.rules")}
              </Text>
            </View>
            {group.rules.map((rule, idx) => (
              <View
                key={idx}
                style={{
                  flexDirection: "row",
                  gap: 10,
                  marginBottom: 8,
                  padding: 12,
                  borderRadius: mobileTheme.radius.md,
                  backgroundColor: theme.colors.secondarySoft
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.secondary,
                    fontFamily: "Inter_700Bold",
                    width: 18
                  }}
                >
                  {idx + 1}.
                </Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: theme.colors.ink,
                    fontFamily: "Inter_500Medium",
                    lineHeight: 18
                  }}
                >
                  {rule}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Leave group ─────────────────────────────────── */}
        {isMember ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
            <Pressable
              onPress={handleLeavePress}
              disabled={leaveMutation.isPending}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                paddingVertical: 14,
                borderRadius: mobileTheme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.danger,
                backgroundColor: theme.colors.dangerBg,
                opacity: leaveMutation.isPending ? 0.6 : 1
              }}
            >
              <LogOut size={16} color={theme.colors.danger} />
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.danger,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {isLastAdmin
                  ? (t("groups.leaveAndDelete") as string)
                  : (t("groups.leaveGroup") as string)}
              </Text>
            </Pressable>
            {isLastAdmin && (
              <Text
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium",
                  textAlign: "center"
                }}
              >
                {t("groups.lastAdminWarning")}
              </Text>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* ── Members Manager Modal ──────────────────────── */}
      <Modal
        visible={membersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMembersOpen(false)}
      >
        <Pressable
          onPress={() => setMembersOpen(false)}
          style={{
            flex: 1,
            backgroundColor: theme.colors.overlay,
            justifyContent: "flex-end"
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 12,
              paddingBottom: 32,
              maxHeight: "80%"
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.border,
                alignSelf: "center",
                marginBottom: 14
              }}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 20,
                marginBottom: 12
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 18,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {isAdmin ? t("groups.manageMembers") : t("groups.members", { count: group.memberCount })}
              </Text>
              <Pressable onPress={() => setMembersOpen(false)} hitSlop={12}>
                <X size={22} color={theme.colors.muted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
              {group.members.map((member) => {
                const memberIsOwner = group.ownerUserId === member.userId;
                const memberIsAdmin =
                  memberIsOwner || (group.adminUserIds ?? []).includes(member.userId);
                return (
                  <View
                    key={member.userId}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 10,
                      borderRadius: mobileTheme.radius.md,
                      backgroundColor: theme.colors.background
                    }}
                  >
                    <Avatar uri={member.avatarUrl} name={member.firstName} size="md" />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.ink,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {member.firstName}
                        {member.userId === currentUserId ? " (You)" : ""}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {memberIsOwner && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 3
                            }}
                          >
                            <Crown size={11} color={theme.colors.accent} />
                            <Text
                              style={{
                                fontSize: 10,
                                color: theme.colors.accent,
                                fontFamily: "Inter_600SemiBold"
                              }}
                            >
                              {t("groups.owner")}
                            </Text>
                          </View>
                        )}
                        {!memberIsOwner && memberIsAdmin && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 3
                            }}
                          >
                            <ShieldCheck size={11} color={theme.colors.secondary} />
                            <Text
                              style={{
                                fontSize: 10,
                                color: theme.colors.secondary,
                                fontFamily: "Inter_600SemiBold"
                              }}
                            >
                              {t("groups.adminBadge")}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {isAdmin && member.userId !== currentUserId && !memberIsOwner && (
                      <Pressable
                        onPress={() => setActionTarget(member)}
                        hitSlop={10}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: theme.colors.white,
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        <MoreVertical size={18} color={theme.colors.muted} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Member Action Sheet ────────────────────────── */}
      <Modal
        visible={Boolean(actionTarget)}
        transparent
        animationType="slide"
        onRequestClose={() => setActionTarget(null)}
      >
        <Pressable
          onPress={() => setActionTarget(null)}
          style={{
            flex: 1,
            backgroundColor: theme.colors.overlay,
            justifyContent: "flex-end"
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 12,
              paddingBottom: 32
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.border,
                alignSelf: "center",
                marginBottom: 8
              }}
            />
            <Text
              style={{
                paddingHorizontal: 20,
                paddingBottom: 8,
                fontSize: 15,
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold"
              }}
            >
              {actionTarget?.firstName}
            </Text>
            {/* Any admin can promote/demote. Promote is hidden if the
                target is already an admin; demote is hidden unless the
                target is an admin AND is not the owner (server also
                enforces this as a safety net). */}
            {isAdmin && actionTarget && !(group.adminUserIds ?? []).includes(actionTarget.userId) && actionTarget.userId !== group.ownerUserId && (
              <Pressable
                onPress={() => runMemberAction("promote", actionTarget.userId)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
              >
                <ShieldCheck size={18} color={theme.colors.secondary} />
                <Text style={{ fontSize: 15, color: theme.colors.ink, fontFamily: "Inter_600SemiBold" }}>
                  {t("groups.promoteAdmin")}
                </Text>
              </Pressable>
            )}
            {isAdmin && actionTarget && (group.adminUserIds ?? []).includes(actionTarget.userId) && actionTarget.userId !== group.ownerUserId && (
              <Pressable
                onPress={() => runMemberAction("demote", actionTarget.userId, actionTarget.firstName)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
              >
                <ShieldCheck size={18} color={theme.colors.muted} />
                <Text style={{ fontSize: 15, color: theme.colors.ink, fontFamily: "Inter_600SemiBold" }}>
                  {t("groups.demoteAdmin")}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => actionTarget && runMemberAction("mute-1h", actionTarget.userId)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
            >
              <MicOff size={18} color={theme.colors.ink} />
              <Text style={{ fontSize: 15, color: theme.colors.ink, fontFamily: "Inter_600SemiBold" }}>
                {t("groups.mute1h")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => actionTarget && runMemberAction("mute-24h", actionTarget.userId)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
            >
              <MicOff size={18} color={theme.colors.ink} />
              <Text style={{ fontSize: 15, color: theme.colors.ink, fontFamily: "Inter_600SemiBold" }}>
                {t("groups.mute24h")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => actionTarget && runMemberAction("mute-indef", actionTarget.userId, actionTarget.firstName)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
            >
              <MicOff size={18} color={theme.colors.danger} />
              <Text style={{ fontSize: 15, color: theme.colors.danger, fontFamily: "Inter_600SemiBold" }}>
                {t("groups.muteIndef")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => actionTarget && runMemberAction("unmute", actionTarget.userId)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
            >
              <MicOff size={18} color={theme.colors.secondary} />
              <Text style={{ fontSize: 15, color: theme.colors.ink, fontFamily: "Inter_600SemiBold" }}>
                {t("groups.unmute")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => actionTarget && runMemberAction("kick", actionTarget.userId, actionTarget.firstName)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
            >
              <UserMinus size={18} color={theme.colors.danger} />
              <Text style={{ fontSize: 15, color: theme.colors.danger, fontFamily: "Inter_600SemiBold" }}>
                {t("groups.kickMember")}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
