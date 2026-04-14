import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
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
  Lock,
  MapPin,
  MessageCircle,
  MicOff,
  MoreVertical,
  PawPrint,
  ShieldCheck,
  UserMinus,
  X
} from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { MessageBubble } from "@/components/chat/message-bubble";
import {
  demoteGroupAdmin,
  getGroupDetail,
  getGroupPreview,
  joinGroup,
  kickGroupMember,
  muteGroupMember,
  promoteGroupAdmin,
  unmuteGroupMember
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { GroupMember, Message } from "@petto/contracts";

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

  const { data: previewMessages = [] } = useQuery({
    queryKey: ["group-preview", id],
    queryFn: () => getGroupPreview(session!.tokens.accessToken, id),
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

  const runMemberAction = async (
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
    } finally {
      setActionTarget(null);
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

        {/* ── Chat preview / gate ─────────────────────────── */}
        <View
          style={{
            marginTop: 24,
            marginHorizontal: 20,
            padding: 16,
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
              marginBottom: 12,
              gap: 8
            }}
          >
            <MessageCircle size={18} color={theme.colors.primary} />
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Inter_700Bold",
                color: theme.colors.ink,
                flex: 1
              }}
            >
              {t("groups.chat")}
            </Text>
          </View>

          <View style={{ position: "relative" }}>
            {previewMessages.length === 0 ? (
              <View
                style={{
                  paddingVertical: 24,
                  alignItems: "center"
                }}
              >
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontFamily: "Inter_500Medium",
                    fontSize: 13
                  }}
                >
                  {t("chat.noMessagesYet")}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 2 }}>
                {previewMessages.map((msg: Message) => (
                  <MessageBubble
                    key={msg.id}
                    message={{ ...msg, isMine: false }}
                    showAvatar={false}
                    showName
                    showTimestamp={false}
                  />
                ))}
              </View>
            )}

            {!isMember && previewMessages.length > 0 && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: "rgba(255,255,255,0.72)",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: theme.colors.primary,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Lock size={20} color="#FFFFFF" />
                </View>
              </View>
            )}
          </View>

          <Pressable
            onPress={isMember ? openChat : () => joinMutation.mutate()}
            disabled={joinMutation.isPending}
            style={{
              marginTop: 14,
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
              {isMember ? t("groups.openChat") : t("groups.joinToChat")}
            </Text>
          </Pressable>
        </View>

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
            {isOwner && actionTarget && (
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
            {isOwner && actionTarget && (group.adminUserIds ?? []).includes(actionTarget.userId) && (
              <Pressable
                onPress={() => runMemberAction("demote", actionTarget.userId)}
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
              onPress={() => actionTarget && runMemberAction("mute-indef", actionTarget.userId)}
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
              onPress={() => actionTarget && runMemberAction("kick", actionTarget.userId)}
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
