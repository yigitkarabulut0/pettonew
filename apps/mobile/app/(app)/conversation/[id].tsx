import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Flag, Lock, MicOff, PawPrint, Send } from "lucide-react-native";

import { Avatar } from "@/components/avatar";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ModerationSheet, type ModerationAction } from "@/components/chat/moderation-sheet";
import { PetSharePicker } from "@/components/chat/pet-share-picker";
import { PinnedBanner } from "@/components/chat/pinned-banner";
import { GroupInfoModal } from "@/components/groups/group-info-modal";
import { ReportModal } from "@/components/report-modal";
import { useTranslation } from "react-i18next";
import {
  deleteGroupMessage,
  getGroupByConversation,
  joinGroup,
  listConversations,
  listGroupPinned,
  listMessages,
  listMyPets,
  muteGroupMember,
  pinGroupMessage,
  sendConversationMessage,
  sendMessage,
  unpinGroupMessage
} from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { formatDurationShort } from "@/lib/time";
import { useSessionStore } from "@/store/session";
import type { Conversation, Message, Pet } from "@petto/contracts";

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
  const [petPickerOpen, setPetPickerOpen] = useState(false);
  const [modMessage, setModMessage] = useState<Message | null>(null);
  const setActiveConversationId = useSessionStore((s) => s.setActiveConversationId);

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

  const { data: groupInfo, refetch: refetchGroupInfo } = useQuery({
    queryKey: ["group-by-conv", id],
    queryFn: () => getGroupByConversation(session!.tokens.accessToken, id),
    enabled: Boolean(session && id)
  });

  const isGroupChat = Boolean(groupInfo);
  const currentUserId = session?.user.id ?? "";
  const isMember = isGroupChat
    ? Boolean(groupInfo?.members?.some((m) => m.userId === currentUserId))
    : true;
  const isAdmin = Boolean(groupInfo?.isAdmin);
  const isMuted = Boolean(groupInfo?.muted);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", id, session?.tokens.accessToken],
    queryFn: () => listMessages(session!.tokens.accessToken, id),
    enabled: Boolean(session && id && (!isGroupChat || isMember)),
    // Poll every 2.5 s — TanStack's structural sharing keeps the array
    // identity stable when nothing changed, so memoized bubbles skip their
    // re-render entirely on an unchanged poll.
    refetchInterval: 2500,
    staleTime: 1500,
    refetchOnWindowFocus: false
  });

  const { data: pinned = [], refetch: refetchPinned } = useQuery({
    queryKey: ["group-pinned", groupInfo?.id],
    queryFn: () => listGroupPinned(session!.tokens.accessToken, groupInfo!.id),
    enabled: Boolean(session && groupInfo?.id && isMember),
    staleTime: 5000
  });

  const { data: myPets = [] } = useQuery({
    queryKey: ["my-pets", session?.tokens.accessToken],
    queryFn: () => listMyPets(session!.tokens.accessToken),
    enabled: Boolean(session && isGroupChat)
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!session || !text.trim()) return null;
      return sendMessage(session.tokens.accessToken, id, text.trim());
    },
    onMutate: async (text: string) => {
      await queryClient.cancelQueries({ queryKey: ["messages", id] });
      const prev = queryClient.getQueryData(["messages", id]);
      const optimistic: Message = {
        id: `temp-${Date.now()}`,
        conversationId: id,
        senderProfileId: session?.user.id ?? "",
        senderName: session?.user.firstName ?? "",
        senderAvatarUrl: session?.user.avatarUrl ?? undefined,
        type: "text",
        body: text.trim(),
        createdAt: new Date().toISOString(),
        isMine: true
      };
      queryClient.setQueryData(["messages", id], (old: Message[] | undefined) => [
        ...(old ?? []),
        optimistic
      ]);
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

  const richSendMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof sendConversationMessage>[2]) => {
      if (!session) return null;
      return sendConversationMessage(session.tokens.accessToken, id, payload);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });

  // ── Composer actions ─────────────────────────────────────────────
  const handleSharePet = (pet: Pet) => {
    setPetPickerOpen(false);
    if (!session || isMuted || !isMember) return;
    const photo = pet.photos?.find((p) => p.isPrimary)?.url ?? pet.photos?.[0]?.url;
    richSendMutation.mutate({
      type: "pet_share",
      metadata: {
        petId: pet.id,
        petName: pet.name,
        petPhotoUrl: photo,
        speciesLabel: pet.speciesLabel,
        breedLabel: pet.breedLabel
      }
    });
  };

  // ── Moderation actions ───────────────────────────────────────────
  const handleModeration = async (action: ModerationAction) => {
    if (!session || !modMessage) return;
    const token = session.tokens.accessToken;
    try {
      switch (action) {
        case "copy": {
          // react-native's built-in Clipboard was removed; fall back to the
          // community package if present, otherwise show the body.
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const ClipboardLib = require("@react-native-clipboard/clipboard").default;
            ClipboardLib?.setString(modMessage.body || "");
          } catch {
            Alert.alert("Copy", modMessage.body || "");
          }
          break;
        }
        case "report":
          setReportOpen(true);
          break;
        case "delete":
          if (groupInfo?.id) {
            await deleteGroupMessage(token, groupInfo.id, modMessage.id);
            queryClient.invalidateQueries({ queryKey: ["messages", id] });
          }
          break;
        case "pin":
          if (groupInfo?.id) {
            await pinGroupMessage(token, groupInfo.id, modMessage.id);
            refetchPinned();
          }
          break;
        case "unpin":
          if (groupInfo?.id) {
            await unpinGroupMessage(token, groupInfo.id, modMessage.id);
            refetchPinned();
          }
          break;
        case "mute-1h":
        case "mute-24h":
        case "mute-indefinite": {
          if (!groupInfo?.id || !modMessage.senderProfileId) break;
          const duration =
            action === "mute-1h" ? "1h" : action === "mute-24h" ? "24h" : "indefinite";
          await muteGroupMember(
            token,
            groupInfo.id,
            modMessage.senderProfileId,
            duration as "1h" | "24h" | "indefinite"
          );
          queryClient.invalidateQueries({ queryKey: ["group-by-conv", id] });
          break;
        }
      }
    } catch (err: any) {
      Alert.alert("Action failed", err?.message || "");
    } finally {
      setModMessage(null);
    }
  };

  // ── Join flow for non-members ───────────────────────────────────
  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!session || !groupInfo?.id) return;
      await joinGroup(session.tokens.accessToken, groupInfo.id);
    },
    onSuccess: () => {
      refetchGroupInfo();
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
    }
  });

  // ── Grouping by day ──────────────────────────────────────────────
  // Hash the messages by the fields that actually change rendering so we
  // don't recompute groupedMessages on every poll when nothing changed.
  const messagesKey = useMemo(
    () =>
      messages
        .map(
          (m) =>
            `${m.id}|${m.deletedAt ?? ""}|${m.pinnedAt ?? ""}|${m.body.length}`
        )
        .join(","),
    [messages]
  );

  const groupedMessages = useMemo(() => {
    const groups: Array<{
      id: string;
      date: string;
      messages: Message[];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesKey]);

  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const canSend = isMember && !isMuted;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ─────────────────────────────────────────────── */}
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
        <Avatar
          uri={isGroupChat ? groupInfo?.imageUrl : otherUserAvatar}
          name={isGroupChat ? groupInfo?.name ?? otherUserName : otherUserName}
          size="sm"
        />
        <Pressable
          style={{ flex: 1 }}
          onPress={
            isGroupChat && groupInfo?.id
              ? () => router.push(`/(app)/group/${groupInfo.id}` as any)
              : undefined
          }
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
              {isAdmin ? ` · ${t("groups.adminBadge")}` : ""}
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

      {/* ── Pinned banner ──────────────────────────────────────── */}
      {isGroupChat && isMember && (
        <PinnedBanner
          pinned={pinned}
          onPress={() => setGroupInfoOpen(true)}
        />
      )}

      {/* ── Non-member gate ───────────────────────────────────── */}
      {isGroupChat && !isMember ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: mobileTheme.spacing.xl,
            gap: 14
          }}
        >
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: theme.colors.primaryBg,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Lock size={36} color={theme.colors.primary} />
          </View>
          <Text
            style={{
              fontSize: 18,
              color: theme.colors.ink,
              fontFamily: "Inter_700Bold",
              textAlign: "center"
            }}
          >
            {t("groups.joinToChatTitle")}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.muted,
              fontFamily: "Inter_500Medium",
              textAlign: "center",
              lineHeight: 20,
              maxWidth: 300
            }}
          >
            {t("groups.joinToChatBody")}
          </Text>
          <Pressable
            onPress={() => joinMutation.mutate()}
            disabled={joinMutation.isPending}
            style={{
              marginTop: 10,
              paddingHorizontal: 30,
              paddingVertical: 14,
              borderRadius: mobileTheme.radius.pill,
              backgroundColor: theme.colors.primary,
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
      ) : (
        <>
          {/* ── Messages list ─────────────────────────────────── */}
          <FlatList
            ref={flatListRef}
            data={groupedMessages}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            initialNumToRender={20}
            maxToRenderPerBatch={10}
            windowSize={10}
            updateCellsBatchingPeriod={50}
            contentContainerStyle={{
              paddingVertical: mobileTheme.spacing.md,
              paddingBottom: 80
            }}
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
                {group.messages.map((msg: Message, idx: number) => {
                  const next = group.messages[idx + 1];
                  const sameMinute =
                    next &&
                    new Date(msg.createdAt).getHours() ===
                      new Date(next.createdAt).getHours() &&
                    new Date(msg.createdAt).getMinutes() ===
                      new Date(next.createdAt).getMinutes();
                  const nextSameSender =
                    next &&
                    next.senderProfileId === msg.senderProfileId &&
                    next.type !== "system";
                  const showAvatar = isGroupChat && !msg.isMine && !nextSameSender;
                  const showName =
                    isGroupChat &&
                    !msg.isMine &&
                    (idx === 0 ||
                      group.messages[idx - 1]?.senderProfileId !== msg.senderProfileId ||
                      group.messages[idx - 1]?.type === "system");
                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      showAvatar={showAvatar || (isGroupChat && !msg.isMine && idx === group.messages.length - 1)}
                      showName={showName}
                      showTimestamp={!sameMinute}
                      onLongPress={
                        msg.type === "system"
                          ? undefined
                          : () => setModMessage(msg)
                      }
                    />
                  );
                })}
              </View>
            )}
          />

          {/* ── Composer ──────────────────────────────────────── */}
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
            {isMuted ? (
              <MutedPill until={groupInfo?.mutedUntil ?? null} />
            ) : (
              <>
                {isGroupChat && (
                  <>
                    <Pressable
                      onPress={() => setPetPickerOpen(true)}
                      disabled={!canSend}
                      hitSlop={10}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.colors.background,
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 2
                      }}
                    >
                      <PawPrint size={18} color={theme.colors.primary} />
                    </Pressable>
                  </>
                )}
                <TextInput
                  placeholder={t("chat.typeMessage")}
                  placeholderTextColor={theme.colors.muted}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  editable={canSend}
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
                  onPress={() => draft.trim() && sendMutation.mutate(draft)}
                  disabled={!draft.trim() || !canSend}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor:
                      draft.trim() && canSend
                        ? theme.colors.primary
                        : theme.colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 2,
                    opacity: sendMutation.isPending ? 0.5 : 1
                  }}
                >
                  <Send
                    size={18}
                    color={
                      draft.trim() && canSend ? theme.colors.white : theme.colors.muted
                    }
                  />
                </Pressable>
              </>
            )}
          </View>
        </>
      )}

      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="chat"
        targetID={id}
        targetLabel={otherUserName}
      />

      <GroupInfoModal
        visible={groupInfoOpen}
        onClose={() => setGroupInfoOpen(false)}
        group={groupInfo ?? null}
      />

      <PetSharePicker
        visible={petPickerOpen}
        pets={myPets}
        onClose={() => setPetPickerOpen(false)}
        onSelect={handleSharePet}
      />

      <ModerationSheet
        visible={Boolean(modMessage)}
        message={modMessage}
        isAdmin={isAdmin}
        isOwnMessage={modMessage?.isMine ?? false}
        onClose={() => setModMessage(null)}
        onAction={handleModeration}
      />
    </KeyboardAvoidingView>
  );
}

// ── Dynamic muted pill ─────────────────────────────────────────────
// Shows "You are muted — 1h 23m left" that ticks down every 30s, or
// "You are muted indefinitely" when the until is null.
function MutedPill({ until }: { until?: string | null }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!until) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [until]);

  const label = useMemo(() => {
    if (!until) return t("groups.mutedIndefinitelyLabel") as string;
    const msLeft = new Date(until).getTime() - now;
    if (msLeft <= 0) return t("groups.mutedExpiringLabel") as string;
    return t("groups.mutedForLabel", {
      duration: formatDurationShort(msLeft)
    }) as string;
  }, [until, now, t]);

  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: mobileTheme.spacing.lg,
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: theme.colors.dangerBg
      }}
    >
      <MicOff size={16} color={theme.colors.danger} strokeWidth={2.2} />
      <Text
        style={{
          color: theme.colors.danger,
          fontFamily: "Inter_700Bold",
          fontSize: 13
        }}
      >
        {label}
      </Text>
    </View>
  );
}
