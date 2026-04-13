import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Flag, Key, Send, Share2, Users2, X } from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { ReportModal } from "@/components/report-modal";
import { useTranslation } from "react-i18next";
import { getGroupByConversation, listConversations, listMessages, sendMessage } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import type { Conversation } from "@petto/contracts";

export default function ConversationPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const setActiveConversationId = useSessionStore((s) => s.setActiveConversationId);

  // Track which conversation is currently open (for notification suppression)
  useEffect(() => {
    setActiveConversationId(id);
    return () => setActiveConversationId(null);
  }, [id]);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", session?.tokens.accessToken],
    queryFn: () => listConversations(session!.tokens.accessToken),
    enabled: Boolean(session)
  });
  const conversation = conversations.find((c) => c.id === id) ?? null;

  const otherUserName = conversation?.title || t("chat.conversation");
  const otherUserAvatar = conversation?.matchPetPairs?.[0]?.matchedPetPhotoUrl;
  const petPairLabel = conversation?.matchPetPairs?.length
    ? conversation.matchPetPairs.map((p) => `${p.myPetName} & ${p.matchedPetName}`).join(", ")
    : "";

  const { data: groupInfo } = useQuery({
    queryKey: ["group-by-conv", id],
    queryFn: () => getGroupByConversation(session!.tokens.accessToken, id),
    enabled: Boolean(session && id)
  });

  const isGroupChat = Boolean(groupInfo);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", id, session?.tokens.accessToken],
    queryFn: () => listMessages(session!.tokens.accessToken, id),
    enabled: Boolean(session && id),
    refetchInterval: 500
  });

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      if (!session || !text.trim()) return null;
      return sendMessage(session.tokens.accessToken, id, text.trim());
    },
    onMutate: async (text: string) => {
      // Optimistic: instantly show the message in the list
      await queryClient.cancelQueries({ queryKey: ["messages", id] });
      const prev = queryClient.getQueryData(["messages", id]);
      const optimisticMsg = {
        id: `temp-${Date.now()}`,
        conversationId: id,
        senderProfileId: session?.user.id ?? "",
        senderName: session?.user.firstName ?? "",
        body: text.trim(),
        createdAt: new Date().toISOString(),
        isMine: true
      };
      queryClient.setQueryData(["messages", id], (old: any) =>
        [...(old ?? []), optimisticMsg]
      );
      setDraft("");
      return { prev };
    },
    onError: (_err, _text, context) => {
      if (context?.prev) queryClient.setQueryData(["messages", id], context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });

  const groupedMessages = useMemo(() => {
    const groups: Array<{
      id: string;
      date: string;
      messages: typeof messages;
    }> = [];
    let currentDate = "";

    for (const msg of messages) {
      const msgDate = new Date(msg.createdAt).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long"
      });
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ id: `date-${msg.id}`, date: msgDate, messages: [] });
      }
      const lastGroup = groups[groups.length - 1];
      if (lastGroup) {
        lastGroup.messages.push(msg);
      }
    }

    return groups;
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        100
      );
    }
  }, [messages.length]);

  const renderMessage = (msg: (typeof messages)[0], showTimestamp: boolean) => (
    <View
      key={msg.id}
      style={{
        flexDirection: isGroupChat && !msg.isMine ? "row" : "column",
        alignSelf: msg.isMine ? "flex-end" : "flex-start",
        maxWidth: "78%",
        marginHorizontal: mobileTheme.spacing.lg,
        marginBottom: mobileTheme.spacing.sm,
        gap: isGroupChat && !msg.isMine ? 8 : 0
      }}
    >
      {/* Sender avatar for group chats */}
      {isGroupChat && !msg.isMine && (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            overflow: "hidden",
            backgroundColor: theme.colors.primaryBg,
            marginTop: 2
          }}
        >
          {(() => {
            const member = groupInfo?.members?.find((m) => m.userId === msg.senderProfileId);
            return member?.avatarUrl ? (
              <Image source={{ uri: member.avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            ) : (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: theme.colors.primary }}>
                  {(msg.senderName || "?")[0]}
                </Text>
              </View>
            );
          })()}
        </View>
      )}
      <View>
        {/* Sender name for group chats */}
        {isGroupChat && !msg.isMine && (
          <Text
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: theme.colors.primary,
              fontFamily: "Inter_600SemiBold",
              marginBottom: 2,
              marginLeft: 4
            }}
          >
            {msg.senderName}
          </Text>
        )}
        <View
          style={{
            paddingHorizontal: mobileTheme.spacing.lg,
            paddingVertical: mobileTheme.spacing.sm + 4,
            borderRadius: mobileTheme.radius.lg,
            backgroundColor: msg.isMine
              ? theme.colors.primary
              : theme.colors.white,
            borderTopRightRadius: msg.isMine
              ? mobileTheme.radius.xs
              : mobileTheme.radius.lg,
            borderTopLeftRadius: msg.isMine
              ? mobileTheme.radius.lg
              : mobileTheme.radius.xs,
            ...mobileTheme.shadow.sm
          }}
        >
          <Text
            selectable
            style={{
              color: msg.isMine
                ? theme.colors.white
                : theme.colors.ink,
              lineHeight: mobileTheme.typography.body.lineHeight,
              fontSize: mobileTheme.typography.body.fontSize,
              fontFamily: "Inter_400Regular"
            }}
          >
            {msg.body}
          </Text>
        </View>
      </View>
      {showTimestamp && (
        <Text
          style={{
            fontSize: 10,
            color: theme.colors.muted,
            marginTop: 3,
            marginHorizontal: mobileTheme.spacing.sm,
            alignSelf: msg.isMine ? "flex-end" : "flex-start",
            fontFamily: "Inter_400Regular"
          }}
        >
          {new Date(msg.createdAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit"
          })}
        </Text>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: mobileTheme.spacing.md,
          paddingHorizontal: mobileTheme.spacing.lg,
          paddingBottom: mobileTheme.spacing.md,
          paddingTop: insets.top + mobileTheme.spacing.md,
          backgroundColor: theme.colors.white,
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
          <ChevronLeft size={20} color={theme.colors.ink} />
        </Pressable>
        <Avatar uri={otherUserAvatar} name={isGroupChat ? groupInfo?.name ?? otherUserName : otherUserName} size="sm" />
        <Pressable
          style={{ flex: 1 }}
          onPress={isGroupChat ? () => setGroupInfoOpen(true) : undefined}
        >
          <Text
            style={{
              fontSize: mobileTheme.typography.bodySemiBold.fontSize,
              fontWeight: mobileTheme.typography.bodySemiBold.fontWeight,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold"
            }}
          >
            {isGroupChat ? groupInfo?.name ?? otherUserName : otherUserName}
          </Text>
          {isGroupChat ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.micro.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {t("groups.members", { count: groupInfo?.memberCount ?? 0 })}
            </Text>
          ) : petPairLabel ? (
            <Text
              style={{
                fontSize: mobileTheme.typography.micro.fontSize,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium"
              }}
            >
              {petPairLabel}
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => setReportOpen(true)}
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
          <Flag size={18} color={theme.colors.muted} />
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={groupedMessages}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: mobileTheme.spacing.md, paddingBottom: 80 }}
        renderItem={({ item: group }) => (
          <View>
            <View
              style={{
                alignItems: "center",
                marginVertical: mobileTheme.spacing.md
              }}
            >
              <View
                style={{
                  backgroundColor: theme.colors.secondarySoft,
                  borderRadius: mobileTheme.radius.pill,
                  paddingHorizontal: mobileTheme.spacing.md,
                  paddingVertical: mobileTheme.spacing.xs + 2
                }}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.micro.fontSize,
                    fontWeight: "600",
                    color: theme.colors.secondary,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {group.date}
                </Text>
              </View>
            </View>
            {group.messages.map((msg, idx) => {
              const next = group.messages[idx + 1];
              const sameMinute =
                next &&
                new Date(msg.createdAt).getHours() ===
                  new Date(next.createdAt).getHours() &&
                new Date(msg.createdAt).getMinutes() ===
                  new Date(next.createdAt).getMinutes();
              return renderMessage(msg, !sameMinute);
            })}
          </View>
        )}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: mobileTheme.spacing.sm,
          paddingHorizontal: mobileTheme.spacing.lg,
          paddingVertical: mobileTheme.spacing.sm,
          paddingBottom: insets.bottom + mobileTheme.spacing.md,
          backgroundColor: theme.colors.white,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border
        }}
      >
        <TextInput
          placeholder={t("chat.typeMessage")}
          placeholderTextColor={theme.colors.muted}
          value={draft}
          onChangeText={setDraft}
          multiline
          style={{
            flex: 1,
            borderRadius: mobileTheme.radius.pill,
            backgroundColor: theme.colors.background,
            paddingHorizontal: mobileTheme.spacing.lg,
            paddingVertical: mobileTheme.spacing.sm + 4,
            maxHeight: 120,
            fontSize: mobileTheme.typography.body.fontSize,
            color: theme.colors.ink,
            fontFamily: "Inter_400Regular",
            lineHeight: mobileTheme.typography.body.lineHeight
          }}
        />
        <Pressable
          onPress={() => draft.trim() && mutation.mutate(draft)}
          disabled={!draft.trim()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: draft.trim()
              ? theme.colors.primary
              : theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 2,
            opacity: mutation.isPending ? 0.5 : 1
          }}
        >
          <Send
            size={18}
            color={
              draft.trim() ? theme.colors.white : theme.colors.muted
            }
          />
        </Pressable>
      </View>

      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="chat"
        targetID={id}
        targetLabel={otherUserName}
      />

      {/* Group Info — Full Screen */}
      <Modal visible={groupInfoOpen} animationType="slide">
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          {/* Header */}
          <View
            style={{
              paddingTop: insets.top + mobileTheme.spacing.md,
              paddingBottom: mobileTheme.spacing.lg,
              paddingHorizontal: mobileTheme.spacing.xl,
              backgroundColor: theme.colors.white,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: mobileTheme.spacing.md
            }}
          >
            <Pressable
              onPress={() => setGroupInfoOpen(false)}
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
              <ChevronLeft size={20} color={theme.colors.ink} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: mobileTheme.typography.subheading.fontSize,
                  fontWeight: "700",
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {groupInfo?.name}
              </Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
            {/* Group info card */}
            <View
              style={{
                backgroundColor: theme.colors.white,
                marginHorizontal: mobileTheme.spacing.xl,
                marginTop: mobileTheme.spacing.xl,
                borderRadius: mobileTheme.radius.lg,
                padding: mobileTheme.spacing.xl,
                alignItems: "center",
                gap: mobileTheme.spacing.md,
                ...mobileTheme.shadow.sm
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Text style={{ fontSize: 28 }}>
                  {groupInfo?.petType === "dog" ? "🐕" : groupInfo?.petType === "cat" ? "🐈" : "🐾"}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: mobileTheme.typography.heading.fontSize,
                  fontWeight: "700",
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold",
                  textAlign: "center"
                }}
              >
                {groupInfo?.name}
              </Text>
              {groupInfo?.description ? (
                <Text
                  style={{
                    fontSize: mobileTheme.typography.body.fontSize,
                    color: theme.colors.muted,
                    fontFamily: "Inter_400Regular",
                    textAlign: "center",
                    lineHeight: mobileTheme.typography.body.lineHeight
                  }}
                >
                  {groupInfo.description}
                </Text>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: theme.colors.secondarySoft,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: mobileTheme.radius.pill
                }}
              >
                <Users2 size={14} color={theme.colors.secondary} />
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    fontWeight: "600",
                    color: theme.colors.secondary,
                    fontFamily: "Inter_600SemiBold"
                  }}
                >
                  {t("groups.members", { count: groupInfo?.memberCount ?? 0 })}
                </Text>
              </View>
            </View>

            {/* Group Code section (visible to members of private groups) */}
            {groupInfo?.isPrivate && groupInfo?.code ? (
              <View
                style={{
                  marginHorizontal: mobileTheme.spacing.xl,
                  marginTop: mobileTheme.spacing.lg
                }}
              >
                <Text
                  style={{
                    fontSize: mobileTheme.typography.label.fontSize,
                    fontWeight: "700",
                    color: theme.colors.ink,
                    fontFamily: "Inter_700Bold",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    marginBottom: mobileTheme.spacing.md
                  }}
                >
                  {t("groups.groupCode") ?? "Group Code"}
                </Text>
                <View
                  style={{
                    backgroundColor: theme.colors.white,
                    borderRadius: mobileTheme.radius.lg,
                    padding: mobileTheme.spacing.lg,
                    gap: mobileTheme.spacing.md,
                    ...mobileTheme.shadow.sm
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.sm }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: theme.colors.primaryBg,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Key size={16} color={theme.colors.primary} />
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: mobileTheme.typography.caption.fontSize,
                        color: theme.colors.muted,
                        fontFamily: "Inter_400Regular"
                      }}
                    >
                      {t("groups.shareCode") ?? "Share this code with members:"}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: theme.colors.primaryBg,
                      borderRadius: mobileTheme.radius.md,
                      borderWidth: 2,
                      borderColor: theme.colors.primary,
                      borderStyle: "dashed",
                      paddingVertical: mobileTheme.spacing.lg,
                      alignItems: "center"
                    }}
                  >
                    <Text
                      selectable
                      style={{
                        fontSize: 28,
                        fontWeight: "800",
                        color: theme.colors.primary,
                        fontFamily: "Inter_700Bold",
                        letterSpacing: 5
                      }}
                    >
                      {groupInfo.code}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      Share.share({
                        message: t("groups.shareCodeMessage", {
                          name: groupInfo.name,
                          code: groupInfo.code
                        }) as string
                      });
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: 12,
                      borderRadius: mobileTheme.radius.md,
                      backgroundColor: theme.colors.primary,
                      minHeight: 44,
                      opacity: pressed ? 0.85 : 1
                    })}
                  >
                    <Share2 size={16} color={theme.colors.white} />
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                        fontWeight: "600",
                        color: theme.colors.white,
                        fontFamily: "Inter_600SemiBold"
                      }}
                    >
                      {t("common.share") ?? "Share"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Members section */}
            <Text
              style={{
                fontSize: mobileTheme.typography.label.fontSize,
                fontWeight: "700",
                color: theme.colors.ink,
                fontFamily: "Inter_700Bold",
                letterSpacing: 0.5,
                textTransform: "uppercase",
                paddingHorizontal: mobileTheme.spacing.xl,
                marginTop: mobileTheme.spacing.xl,
                marginBottom: mobileTheme.spacing.md
              }}
            >
              {t("groups.members", { count: groupInfo?.members?.length ?? 0 })}
            </Text>

            <View style={{ paddingHorizontal: mobileTheme.spacing.xl, gap: mobileTheme.spacing.sm }}>
              {groupInfo?.members?.map((member) => (
                <View
                  key={member.userId}
                  style={{
                    backgroundColor: theme.colors.white,
                    borderRadius: mobileTheme.radius.lg,
                    padding: mobileTheme.spacing.lg,
                    ...mobileTheme.shadow.sm
                  }}
                >
                  {/* Member header row */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: mobileTheme.spacing.md }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        overflow: "hidden",
                        backgroundColor: theme.colors.primaryBg
                      }}
                    >
                      {member.avatarUrl ? (
                        <Image
                          source={{ uri: member.avatarUrl }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                          <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.primary }}>
                            {member.firstName?.[0] ?? "?"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                        fontWeight: "600",
                        color: theme.colors.ink,
                        fontFamily: "Inter_600SemiBold",
                        flex: 1
                      }}
                    >
                      {member.firstName}
                    </Text>
                  </View>

                  {/* Pets row */}
                  {member.pets?.length > 0 && (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: mobileTheme.spacing.sm,
                        marginTop: mobileTheme.spacing.md,
                        paddingTop: mobileTheme.spacing.md,
                        borderTopWidth: 1,
                        borderTopColor: theme.colors.border
                      }}
                    >
                      {member.pets.map((pet) => (
                        <View
                          key={pet.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            backgroundColor: theme.colors.background,
                            borderRadius: mobileTheme.radius.pill,
                            paddingRight: 12,
                            paddingVertical: 4,
                            paddingLeft: 4
                          }}
                        >
                          <View
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              overflow: "hidden",
                              backgroundColor: theme.colors.white
                            }}
                          >
                            {pet.photoUrl ? (
                              <Image
                                source={{ uri: pet.photoUrl }}
                                style={{ width: "100%", height: "100%" }}
                                contentFit="cover"
                              />
                            ) : (
                              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                                <Text style={{ fontSize: 12 }}>🐾</Text>
                              </View>
                            )}
                          </View>
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: mobileTheme.typography.caption.fontSize,
                              fontWeight: "500",
                              color: theme.colors.ink,
                              fontFamily: "Inter_500Medium",
                              maxWidth: 100
                            }}
                          >
                            {pet.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
