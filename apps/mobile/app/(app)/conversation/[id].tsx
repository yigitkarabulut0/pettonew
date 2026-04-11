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
  Text,
  TextInput,
  View
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Flag, Send, X } from "lucide-react-native";

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
    enabled: Boolean(session && id)
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!session || !draft.trim()) return null;
      return sendMessage(session.tokens.accessToken, id, draft.trim());
    },
    onSuccess: () => {
      setDraft("");
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
        alignSelf: msg.isMine ? "flex-end" : "flex-start",
        maxWidth: "78%",
        marginHorizontal: mobileTheme.spacing.lg,
        marginBottom: mobileTheme.spacing.sm
      }}
    >
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
          onPress={() => mutation.mutate()}
          disabled={!draft.trim() || mutation.isPending}
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

      {/* Group Info Modal */}
      <Modal visible={groupInfoOpen} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "75%",
              paddingBottom: insets.bottom + mobileTheme.spacing.xl
            }}
          >
            {/* Modal header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: mobileTheme.spacing.xl,
                paddingVertical: mobileTheme.spacing.lg,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border
              }}
            >
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
                <Text
                  style={{
                    fontSize: mobileTheme.typography.caption.fontSize,
                    color: theme.colors.muted,
                    fontFamily: "Inter_500Medium",
                    marginTop: 2
                  }}
                >
                  {t("groups.members", { count: groupInfo?.memberCount ?? 0 })}
                </Text>
              </View>
              <Pressable
                onPress={() => setGroupInfoOpen(false)}
                hitSlop={12}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.colors.background,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <X size={18} color={theme.colors.ink} />
              </Pressable>
            </View>

            {/* Members list */}
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: mobileTheme.spacing.xl,
                paddingTop: mobileTheme.spacing.lg,
                gap: mobileTheme.spacing.lg
              }}
            >
              {groupInfo?.members?.map((member) => (
                <View
                  key={member.userId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: mobileTheme.spacing.md
                  }}
                >
                  {/* Member avatar */}
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
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
                        <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.primary }}>
                          {member.firstName?.[0] ?? "?"}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Member name + pets */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: mobileTheme.typography.bodySemiBold.fontSize,
                        fontWeight: "600",
                        color: theme.colors.ink,
                        fontFamily: "Inter_600SemiBold"
                      }}
                    >
                      {member.firstName}
                    </Text>
                    {member.pets?.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8, marginTop: 6 }}
                      >
                        {member.pets.map((pet) => (
                          <View key={pet.id} style={{ alignItems: "center", width: 52 }}>
                            <View
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                overflow: "hidden",
                                backgroundColor: theme.colors.background,
                                borderWidth: 2,
                                borderColor: theme.colors.primaryBg
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
                                  <Text style={{ fontSize: 12, color: theme.colors.muted }}>🐾</Text>
                                </View>
                              )}
                            </View>
                            <Text
                              numberOfLines={1}
                              style={{
                                fontSize: 10,
                                color: theme.colors.muted,
                                fontFamily: "Inter_500Medium",
                                marginTop: 2,
                                maxWidth: 52,
                                textAlign: "center"
                              }}
                            >
                              {pet.name}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
